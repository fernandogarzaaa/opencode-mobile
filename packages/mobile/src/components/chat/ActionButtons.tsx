import * as Haptics from "expo-haptics";
import { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ApprovalRequest } from "@/api/approvals";
import { approvalsApi } from "@/api/approvals";
import { CheckIcon, XIcon } from "@/components/icons";
import { ApiError } from "@/lib/httpClient";
import { useApprovalsStore } from "@/stores/useApprovalsStore";
import { Radius, Spacing, fontStyle, typography, useTheme } from "@/theme";
import { withOpacity } from "@/utils/colors";
import {
	actionLabelFor,
	isActionable,
	riskTier,
} from "./actionButtonLogic";

/**
 * One-tap action buttons for pending approvals, rendered above the chat
 * composer next to the background-task pills.
 *
 * Hark's pattern: a suggested action collapses decision and execution
 * into a single gesture. The SHADOW-AI adaptation keeps the approvals
 * inbox as the enforcement surface: tapping a button calls the exact
 * same POST /approvals/{id}/approve endpoint the inbox card uses, so
 * nothing runs without the approval gate. Approvals that require double
 * confirmation ask for a second tap inline.
 *
 * Buttons only render while there is at least one actionable pending
 * approval, and each row is dismissible. Decided items vanish via the
 * approvals store, so the row never shows a dead button.
 */
export function ActionButtons() {
	const { colors } = useTheme();
	const items = useApprovalsStore((s) => s.items);

	const actionable = useMemo(
		() => items.filter((a) => isActionable(a, Date.now())),
		[items],
	);
	const actionableIds = useMemo(
		() => actionable.map((a) => a.id).join(","),
		[actionable],
	);

	const [dismissState, setDismissState] = useState<{
		sig: string;
		ids: Set<string>;
	}>({ sig: "", ids: new Set() });
	const [confirmingId, setConfirmingId] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [errorId, setErrorId] = useState<string | null>(null);
	// Synchronous re-entrancy guard: state updates do not land between two
	// rapid taps, so a ref is the only thing that reliably blocks the
	// second one. busyId stays as the visual state.
	const busyRef = useRef(false);

	// Dismissals are scoped to the current pending set: new approvals
	// bring the row back. Adjusted during render (React-endorsed pattern
	// for state derived from props) instead of in an effect, so no async
	// setState can fire after unmount.
	if (dismissState.sig !== actionableIds) {
		setDismissState({ sig: actionableIds, ids: new Set() });
		setConfirmingId(null);
	}
	const dismissed = dismissState.ids;

	const visible = actionable.filter((a) => !dismissed.has(a.id));
	if (visible.length === 0) {
		return null;
	}

	const riskDotColor = (approval: ApprovalRequest): string => {
		switch (riskTier(approval)) {
			case "high":
				return colors.destructive;
			case "medium":
				return colors.warning;
			default:
				return colors.success;
		}
	};

	const dismiss = (id: string) => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
			() => undefined,
		);
		setConfirmingId((current) => (current === id ? null : current));
		setDismissState((prev) => ({
			sig: prev.sig,
			ids: new Set(prev.ids).add(id),
		}));
	};

	const approve = async (approval: ApprovalRequest) => {
		if (busyRef.current) return;
		if (
			approval.requires_double_confirmation &&
			confirmingId !== approval.id
		) {
			void Haptics.impactAsync(
				Haptics.ImpactFeedbackStyle.Medium,
			).catch(() => undefined);
			setConfirmingId(approval.id);
			return;
		}
		busyRef.current = true;
		setBusyId(approval.id);
		setErrorId(null);
		try {
			const decided = await approvalsApi.approve(approval.id);
			useApprovalsStore.getState().upsert(decided);
			void Haptics.notificationAsync(
				Haptics.NotificationFeedbackType.Success,
			).catch(() => undefined);
		} catch (err) {
			if (err instanceof ApiError && err.status === 409) {
				// Already decided elsewhere: refresh the pending list so the
				// decided item drops out of the store.
				try {
					const page = await approvalsApi.listPending();
					useApprovalsStore.getState().setItems(page.items);
				} catch {
					useApprovalsStore.getState().remove(approval.id);
				}
			} else {
				setErrorId(approval.id);
				void Haptics.notificationAsync(
					Haptics.NotificationFeedbackType.Error,
				).catch(() => undefined);
			}
		} finally {
			busyRef.current = false;
			setBusyId(null);
			setConfirmingId((current) =>
				current === approval.id ? null : current,
			);
		}
	};

	return (
		<View
			style={{
				paddingHorizontal: Spacing[4],
				paddingBottom: Spacing[2],
				gap: Spacing[1.5],
			}}
			accessibilityRole="none"
		>
			{visible.map((approval) => {
				const label = actionLabelFor(approval);
				const confirming =
					approval.requires_double_confirmation &&
					confirmingId === approval.id;
				const busy = busyId === approval.id;
				const failed = errorId === approval.id;
				return (
					<View
						key={approval.id}
						style={{
							flexDirection: "row",
							alignItems: "center",
							backgroundColor: withOpacity(
								colors.primary,
								0.08,
							),
							borderRadius: Radius.lg,
							borderWidth: 1,
							borderColor: withOpacity(colors.primary, 0.25),
							paddingLeft: Spacing[3],
							paddingRight: Spacing[1],
							paddingVertical: Spacing[1],
							opacity: busy ? 0.6 : 1,
						}}
					>
						<View
							style={{
								width: 8,
								height: 8,
								borderRadius: 4,
								backgroundColor: riskDotColor(approval),
								marginRight: Spacing[2],
							}}
						/>
						<Pressable
							onPress={() => void approve(approval)}
							disabled={busy}
							accessibilityRole="button"
							accessibilityLabel={
								confirming
									? `Confirm approval: ${label}`
									: `Approve: ${label}`
							}
							style={{ flex: 1, paddingVertical: Spacing[2] }}
						>
							<Text
								style={[
									typography.uiLabel,
									fontStyle("600"),
									{
										color: confirming
											? colors.destructive
											: colors.primary,
									},
								]}
								numberOfLines={2}
							>
								{confirming ? (
									`Tap again to confirm: ${label}`
								) : (
									`Approve: ${label}`
								)}
							</Text>
							{failed ? (
								<Text
									style={[
										typography.micro,
										{ color: colors.destructive, marginTop: 2 },
									]}
								>
									Approval failed. Try again.
								</Text>
							) : null}
						</Pressable>
						<Pressable
							onPress={() => dismiss(approval.id)}
							accessibilityRole="button"
							accessibilityLabel={`Dismiss: ${label}`}
							style={{
								padding: Spacing[2.5],
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							{confirming ? (
								<CheckIcon size={14} color={colors.mutedForeground} />
							) : (
								<XIcon size={14} color={colors.mutedForeground} />
							)}
						</Pressable>
					</View>
				);
			})}
		</View>
	);
}
