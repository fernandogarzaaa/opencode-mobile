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
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { ApiError, apiPost } from "./httpClient";
import { getConnectionState } from "../stores/useConnectionStore";

/** Android channel id for approval-request notifications. */
export const APPROVALS_CHANNEL_ID = "approvals";

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
