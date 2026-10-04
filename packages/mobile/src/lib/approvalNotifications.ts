/**
 * Expo push-notification wiring for Shadow approval alerts.
 *
 * Server contract (node: apps/shadow-node/shadow_node/main.py):
 * - Push is gated by SHADOW_EXPO_PUSH_ENABLED (default off). On every
 *   approval.created the node POSTs to https://exp.host/--/api/v2/push/send
 *   with title "Approval needed", body = action_preview || action.description,
 *   data {type:"approval.created", approval_id}, categoryId "shadow.approval"
 *   (main.py:125-153).
 * - This device registers its Expo push token via
 *   POST /devices/{device_id}/push-token with body
 *   {"push_token": "ExponentPushToken[...]"}. The node 403s when the
 *   x-shadow-device-id HMAC header does not equal the {device_id} path param
 *   ("a device may only register its own push token"), 404s on an unknown
 *   device, and 400s when the token does not start with "ExponentPushToken["
 *   (main.py:1101-1115).
 *
 * The tabs in app/(tabs)/_layout.tsx are a custom in-layout switcher, not
 * expo-router tabs, so a notification tap cannot reach the approvals inbox
 * through routing alone. The response handler below both deep-links into the
 * tabs stack and emits through onApprovalNotificationTap, which TabsLayout
 * subscribes to in order to switch the visible tab.
 *
 * The shadow.approval category also carries Approve / Decline action
 * buttons. Actions are handled in the background via the same HMAC-signed
 * httpClient path as foreground requests (no new auth mechanism); approvals
 * flagged requires_double_confirmation (or risk blocked) are never decided
 * one-tap and instead deep-link into the app for the in-app confirm step.
 * A 409 (already decided) recovers through GET /approvals/receipt.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { ApiError, apiGet, apiPost } from "./httpClient";
import {
	getConnectionState,
	useConnectionStore,
} from "../stores/useConnectionStore";
import { approvalsApi, type ApprovalPage, type ApprovalRequest } from "../api/approvals";

/** Android channel id for approval-request notifications. */
export const APPROVALS_CHANNEL_ID = "approvals";

/**
 * Notification category id the node attaches to approval pushes
 * (apps/shadow-node/shadow_node/main.py:149, category_id="shadow.approval").
 */
export const APPROVAL_CATEGORY_ID = "shadow.approval";
/** Action identifiers for inline approve/decline from the notification. */
export const APPROVE_ACTION_ID = "shadow.approve";
export const DECLINE_ACTION_ID = "shadow.decline";
/**
 * Reason recorded when declining from a notification. Notification actions
 * offer no text input, so a fixed reason is used and surfaced in the audit
 * log; a custom reason requires deciding inside the app.
 */
export const NOTIFICATION_DECLINE_REASON = "Declined from notification";

/**
 * App version at which notification permission was last requested. A denial
 * is recorded the same as a grant: the user is asked at most once per app
 * version and never nagged on every launch.
 */
const PUSH_PERMISSION_PROMPTED_KEY = "shadow_push_permission_prompted_version";
/** App version at which the push token was last registered successfully. */
const PUSH_TOKEN_REGISTERED_KEY = "shadow_push_token_registered_version";

function currentAppVersion(): string {
	return Constants.expoConfig?.version ?? "unknown";
}

function easProjectId(): string | undefined {
	const extra = Constants.expoConfig?.extra as
		| { eas?: { projectId?: string } }
		| undefined;
	return extra?.eas?.projectId;
}

/**
 * Ask the user for notification permission. Shows the system dialog.
 * Returns the resulting permission status.
 */
export async function requestPushPermission(): Promise<Notifications.PermissionStatus> {
	const { status } = await Notifications.requestPermissionsAsync();
	return status;
}

interface PushTokenResponse {
	device_id: string;
	push_registered: boolean;
}

/**
 * Fetch this device's Expo push token and register it with the paired
 * Shadow Node via POST /devices/{device_id}/push-token, signed with the
 * client's HMAC headers (the node ownership-checks the x-shadow-device-id
 * header against the path param).
 *
 * Throws a descriptive Error when the device is not paired, permission is
 * not granted, the app runs on a simulator, or the node rejects the token
 * (403 ownership mismatch, 404 unknown device, 400 bad token format).
 */
export async function registerPushToken(): Promise<void> {
	const { deviceId, isConnected } = getConnectionState();
	if (!isConnected || !deviceId) {
		throw new Error(
			"Pair this device with a Shadow Node before registering push notifications.",
		);
	}

	const { status } = await Notifications.getPermissionsAsync();
	if (status !== Notifications.PermissionStatus.GRANTED) {
		throw new Error(
			"Push permission is not granted. Request permission before registering the token.",
		);
	}

	if (!Device.isDevice) {
		throw new Error(
			"Expo push tokens require a physical device. Simulators cannot receive push notifications.",
		);
	}

	const projectId = easProjectId();
	const { data: pushToken } = projectId
		? await Notifications.getExpoPushTokenAsync({ projectId })
		: await Notifications.getExpoPushTokenAsync();

	if (!pushToken.startsWith("ExponentPushToken[")) {
		throw new Error(
			"The Expo push token has an unexpected format. Refusing to register it.",
		);
	}

	try {
		await apiPost<PushTokenResponse>(`/devices/${deviceId}/push-token`, {
			push_token: pushToken,
		});
	} catch (error) {
		if (error instanceof ApiError) {
			if (error.status === 403) {
				throw new Error(
					`The node refused the push-token registration: ${error.message}`,
				);
			}
			if (error.status === 400) {
				throw new Error(
					`The node rejected the push token format: ${error.message}`,
				);
			}
			if (error.status === 404) {
				throw new Error(
					"The node does not recognize this device. Re-pair and try again.",
				);
			}
		}
		throw error;
	}
}

export type ApprovalNotificationTapListener = (
	approvalId: string | null,
) => void;

const approvalTapListeners = new Set<ApprovalNotificationTapListener>();

/**
 * Subscribe to taps on approval.created notifications. TabsLayout uses this
 * to switch to the approvals inbox. Returns an unsubscribe function.
 */
export function onApprovalNotificationTap(
	listener: ApprovalNotificationTapListener,
): () => void {
	approvalTapListeners.add(listener);
	return () => {
		approvalTapListeners.delete(listener);
	};
}

/**
 * Register the shadow.approval category with Approve / Decline buttons.
 * iOS renders the buttons on notification expand; Android renders them
 * inline on the approvals channel once the category is set. Both actions
 * run without foregrounding the app (opensAppToForeground: false).
 * Idempotent; safe to call on every app start.
 */
async function setupNotificationCategory(): Promise<void> {
	await Notifications.setNotificationCategoryAsync(APPROVAL_CATEGORY_ID, [
		{
			identifier: APPROVE_ACTION_ID,
			buttonTitle: "Approve",
			options: { opensAppToForeground: false },
		},
		{
			identifier: DECLINE_ACTION_ID,
			buttonTitle: "Decline",
			options: { opensAppToForeground: false, isDestructive: true },
		},
	]);
}

function approvalTitle(approval: ApprovalRequest): string {
	const title = approval.action.description || approval.action.tool_name;
	return title.length > 60 ? `${title.slice(0, 57)}...` : title;
}

interface DecisionOutcome {
	ok: boolean;
	message: string;
}

/**
 * Locate a pending (or recently decided) approval by id. The push payload
 * carries only approval_id, so the (thread_id, tool_call_id) receipt key is
 * recovered here for the 409 path.
 */
async function findApproval(
	approvalId: string,
): Promise<ApprovalRequest | null> {
	try {
		const pending = await approvalsApi.listPending();
		const found = pending.items.find((a) => a.id === approvalId);
		if (found) {
			return found;
		}
	} catch (error) {
		console.warn("[push] failed to list pending approvals", error);
	}
	// Not pending: it may already be decided. The unfiltered list carries
	// statuses (approved/denied/expired/consumed) for a definitive answer.
	try {
		const all = await apiGet<ApprovalPage>("/approvals", {});
		return all.items.find((a) => a.id === approvalId) ?? null;
	} catch (error) {
		console.warn("[push] failed to list approvals", error);
		return null;
	}
}

/**
 * Decide an approval from a notification action, entirely in the background.
 *
 * Server contract (apps/shadow-node/shadow_node/main.py:1366-1381,
 * packages/agent-core/agent_core/core.py:85-105):
 * - POST /approvals/{id}/approve -> decided ApprovalRequest | 409 when
 *   already decided or expired.
 * - POST /approvals/{id}/deny {reason} -> decided ApprovalRequest | 409.
 * - GET /approvals/receipt?thread_id&tool_call_id -> the decided approval
 *   for idempotent recovery (404 when no receipt exists).
 *
 * Security posture: the request is HMAC-signed with the device secret via
 * the same httpClient path as foreground requests (no new auth mechanism).
 * Approvals flagged requires_double_confirmation (or risk blocked) are
 * NEVER decided one-tap: the action deep-links into the app instead, where
 * the in-app second-confirm step applies.
 *
 * A cold start from a notification action may fire before the connection
 * store hydrates, so initialization is ensured here; SecureStore is
 * accessible in the background task context on both platforms.
 */
async function decideFromNotification(
	approvalId: string,
	approve: boolean,
): Promise<DecisionOutcome> {
	const store = useConnectionStore.getState();
	if (!store.isInitialized) {
		await store.initialize();
	}
	const { isConnected } = useConnectionStore.getState();
	if (!isConnected) {
		return { ok: false, message: "Device is not paired with a Shadow Node." };
	}

	const approval = await findApproval(approvalId);
	if (!approval) {
		return {
			ok: false,
			message: "Approval not found. It may have expired.",
		};
	}

	if (
		approval.requires_double_confirmation ||
		approval.risk_label === "blocked"
	) {
		// Sensitive approvals need the in-app confirm step; never one-tap.
		router.push("/(tabs)/approvals");
		emitApprovalNotificationTap(approvalId);
		return { ok: true, message: "Opened in the app for confirmation." };
	}

	if (approval.status !== "pending") {
		return { ok: false, message: `Already ${approval.status}.` };
	}

	try {
		const decided = approve
			? await approvalsApi.approve(approval.id)
			: await approvalsApi.deny(approval.id, NOTIFICATION_DECLINE_REASON);
		return {
			ok: true,
			message: `${decided.status === "approved" ? "Approved" : "Declined"}: ${approvalTitle(approval)}`,
		};
	} catch (error) {
		if (
			error instanceof ApiError &&
			error.status === 409 &&
			approval.thread_id &&
			approval.tool_call_id
		) {
			// Lost race: someone decided it between our read and our write.
			// Recover the decided state via the idempotency receipt.
			try {
				const { approval: decided } = await approvalsApi.receipt(
					approval.thread_id,
					approval.tool_call_id,
				);
				return { ok: true, message: `Already ${decided.status}.` };
			} catch {
				return { ok: false, message: "Already decided." };
			}
		}
		throw error;
	}
}

/**
 * Handle an Approve / Decline notification action: decide in the background,
 * dismiss the acted-on notification, and post a brief local confirmation.
 * Failures surface as an error confirmation rather than silently dropping.
 */
async function handleNotificationAction(
	response: Notifications.NotificationResponse,
	approve: boolean,
): Promise<void> {
	const data = response.notification.request.content.data as
		| Record<string, unknown>
		| null
		| undefined;
	const approvalId =
		typeof data?.approval_id === "string" ? data.approval_id : null;
	if (!approvalId) {
		return;
	}

	let outcome: DecisionOutcome;
	try {
		outcome = await decideFromNotification(approvalId, approve);
	} catch (error) {
		outcome = {
			ok: false,
			message:
				error instanceof Error ? error.message : "Decision failed unexpectedly.",
		};
	}

	await Notifications.dismissNotificationAsync(
		response.notification.request.identifier,
	).catch(() => undefined);
	await Notifications.scheduleNotificationAsync({
		content: {
			title: outcome.ok ? "Decision recorded" : "Could not decide",
			body: outcome.message,
		},
		trigger: null,
	}).catch(() => undefined);
	Haptics.notificationAsync(
		outcome.ok
			? Haptics.NotificationFeedbackType.Success
			: Haptics.NotificationFeedbackType.Error,
	).catch(() => undefined);
}

function emitApprovalNotificationTap(approvalId: string | null): void {
	for (const listener of approvalTapListeners) {
		try {
			listener(approvalId);
		} catch (error) {
			console.warn("[push] approval-tap listener threw", error);
		}
	}
}

/**
 * Install the foreground notification handler (show banner + list entry +
 * sound + badge, mirroring lock-screen behavior) and the tap-response
 * listener. Creates the Android "approvals" channel (high importance);
 * iOS ignores the channel call.
 *
 * A tap on a notification whose data.type === "approval.created" pushes the
 * tabs route (covers cold starts and modal-covered stacks) and emits through
 * onApprovalNotificationTap so the tab layout switches to the approvals
 * inbox.
 *
 * Returns an unsubscribe function for the response listener.
 */
export function setupNotificationHandlers(): () => void {
	Notifications.setNotificationHandler({
		handleNotification: async (): Promise<Notifications.NotificationBehavior> => ({
			shouldShowBanner: true,
			shouldShowList: true,
			shouldPlaySound: true,
			shouldSetBadge: true,
		}),
	});

	setupNotificationCategory().catch((error: unknown) => {
		console.warn("[push] failed to register notification category", error);
	});

	if (Platform.OS === "android") {
		Notifications.setNotificationChannelAsync(APPROVALS_CHANNEL_ID, {
			name: "Approval requests",
			importance: Notifications.AndroidImportance.HIGH,
			vibrationPattern: [0, 250, 250, 250],
			lightColor: "#FF231F7C",
		}).catch((error: unknown) => {
			console.warn("[push] failed to create Android notification channel", error);
		});
	}

	const responseSubscription =
		Notifications.addNotificationResponseReceivedListener((response) => {
			const data = response.notification.request.content.data as
				| Record<string, unknown>
				| null
				| undefined;
			if (data?.type === "approval.created") {
				const actionId = response.actionIdentifier;
				if (
					actionId === APPROVE_ACTION_ID ||
					actionId === DECLINE_ACTION_ID
				) {
					// Inline Approve / Decline from the notification shade.
					// Runs in the background; never foregrounds the app.
					void handleNotificationAction(
						response,
						actionId === APPROVE_ACTION_ID,
					);
					return;
				}
				router.push("/(tabs)/approvals");
				emitApprovalNotificationTap(
					typeof data.approval_id === "string" ? data.approval_id : null,
				);
			}
		});

	return () => {
		responseSubscription.remove();
	};
}

export type PushSetupOutcome =
	| "registered"
	| "already_done"
	| "not_paired"
	| "permission_denied"
	| "skipped_no_device";

/**
 * Idempotent push-registration entry point for the app lifecycle. Call after
 * pairing completes and on app start when already paired.
 *
 * - Simulators are skipped (no Expo push token exists there).
 * - The permission dialog is shown at most once per app version; a denial is
 *   recorded so the user is never re-prompted on every launch.
 * - A successful token registration is recorded per app version, but a
 *   transient registration failure does NOT consume the permission prompt:
 *   the next launch retries registration without showing the dialog again.
 */
export async function ensurePushRegistration(): Promise<PushSetupOutcome> {
	const { isConnected } = getConnectionState();
	if (!isConnected) {
		return "not_paired";
	}

	if (!Device.isDevice) {
		return "skipped_no_device";
	}

	const version = currentAppVersion();
	const [promptedVersion, registeredVersion] = await Promise.all([
		SecureStore.getItemAsync(PUSH_PERMISSION_PROMPTED_KEY),
		SecureStore.getItemAsync(PUSH_TOKEN_REGISTERED_KEY),
	]);
	if (promptedVersion === version && registeredVersion === version) {
		return "already_done";
	}

	let permission: Notifications.PermissionStatus;
	if (promptedVersion === version) {
		// Already asked this version (e.g. the user denied, or registration
		// failed transiently): never show the dialog again, just re-check.
		permission = (await Notifications.getPermissionsAsync()).status;
	} else {
		permission = await requestPushPermission();
		await SecureStore.setItemAsync(PUSH_PERMISSION_PROMPTED_KEY, version);
	}

	if (permission !== Notifications.PermissionStatus.GRANTED) {
		return "permission_denied";
	}

	await registerPushToken();
	await SecureStore.setItemAsync(PUSH_TOKEN_REGISTERED_KEY, version);
	return "registered";
}
