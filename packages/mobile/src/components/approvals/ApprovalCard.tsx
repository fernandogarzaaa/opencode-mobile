import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ApprovalRequest, RiskLabel } from "@/api/approvals";
import { CheckIcon, XIcon } from "@/components/icons";
import { Button, Card, TextField } from "@/components/ui";
import { FontSizes, Spacing, fontStyle, typography, useTheme } from "@/theme";
import { withOpacity } from "@/utils/colors";

const CONFIRM_DISMISS_MS = 900;

export interface ApprovalCardProps {
	approval: ApprovalRequest;
	/** Wall-clock ms tick; drives the expires-in countdown. */
	now: number;
	/** POSTs /approvals/{id}/approve (with 409 recovery). Resolves on success. */
	onApprove: (approval: ApprovalRequest) => Promise<ApprovalRequest>;
	/** POSTs /approvals/{id}/deny (with 409 recovery). Resolves on success. */
	onDeny: (
		approval: ApprovalRequest,
		reason: string,
	) => Promise<ApprovalRequest>;
	/** Remove the card from the pending list once confirmed. */
	onSettled: (id: string) => void;
}

function formatExpiresIn(msLeft: number): string {
	if (msLeft <= 0) return "expired";
	const totalSeconds = Math.floor(msLeft / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

function RiskBadge({ risk }: { risk: RiskLabel }) {
	const { colors } = useTheme();

	const config = useMemo(() => {
		switch (risk) {
			case "low":
				return {
					label: "Low risk",
					text: colors.mutedForeground,
					background: colors.muted,
				};
			case "medium":
				return {
					label: "Medium risk",
					text: colors.warning,
					background: withOpacity(colors.warning, 0.15),
				};
			case "high":
				return {
					label: "High risk",
					text: colors.destructive,
					background: withOpacity(colors.destructive, 0.15),
				};
			case "blocked":
				return {
					label: "Blocked",
					text: colors.destructiveForeground,
					background: colors.destructive,
				};
		}
	}, [risk, colors]);

	return (
		<View style={[styles.riskBadge, { backgroundColor: config.background }]}>
			<Text
				style={[typography.meta, fontStyle("600"), { color: config.text }]}
			>
				{config.label}
			</Text>
		</View>
	);
}

export function ApprovalCard({
	approval,
	now,
	onApprove,
	onDeny,
	onSettled,
}: ApprovalCardProps) {
	const { colors } = useTheme();
	const [confirmingDestructive, setConfirmingDestructive] = useState(false);
	const [declineOpen, setDeclineOpen] = useState(false);
	const [declineReason, setDeclineReason] = useState("");
	const [declineError, setDeclineError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [decided, setDecided] = useState<"approved" | "denied" | null>(null);
	const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (dismissTimer.current) {
				clearTimeout(dismissTimer.current);
			}
		},
		[],
	);

	const expiresAtMs = approval.expires_at
		? Date.parse(approval.expires_at)
		: null;
	const expired = expiresAtMs !== null && expiresAtMs <= now;
	const msLeft = expiresAtMs !== null ? expiresAtMs - now : null;

	const title =
		approval.action.description?.trim() ||
		approval.action.tool_name ||
		"Approval needed";

	const dataUsed = approval.data_used_preview ?? [];
	const toolName = approval.action.tool_name;

	const scheduleDismiss = () => {
		dismissTimer.current = setTimeout(
			() => onSettled(approval.id),
			CONFIRM_DISMISS_MS,
		);
	};

	const handleError = (err: unknown) => {
		const message =
			err instanceof Error ? err.message : "Decision failed. Try again.";
		setError(message);
		Haptics.notificationAsync(
			Haptics.NotificationFeedbackType.Error,
		).catch(() => {});
	};

	const doApprove = async () => {
		if (busy || decided || expired) return;
		setBusy(true);
		setError(null);
		try {
			await onApprove(approval);
			setDecided("approved");
			Haptics.notificationAsync(
				Haptics.NotificationFeedbackType.Success,
			).catch(() => {});
			scheduleDismiss();
		} catch (err) {
			handleError(err);
		} finally {
			setBusy(false);
		}
	};

	const handleApprovePress = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
		if (approval.requires_double_confirmation && !confirmingDestructive) {
			setConfirmingDestructive(true);
			return;
		}
		void doApprove();
	};

	const handleConfirmDestructive = () => {
		setConfirmingDestructive(false);
		void doApprove();
	};

	const doDeny = async () => {
		const reason = declineReason.trim();
		if (!reason) {
			setDeclineError("A reason is required to decline.");
			return;
		}
		if (busy || decided || expired) return;
		setBusy(true);
		setError(null);
		setDeclineError(null);
		try {
			await onDeny(approval, reason);
			setDecided("denied");
			Haptics.notificationAsync(
				Haptics.NotificationFeedbackType.Success,
			).catch(() => {});
			scheduleDismiss();
		} catch (err) {
			handleError(err);
		} finally {
			setBusy(false);
		}
	};

	const handleDeclinePress = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
		setConfirmingDestructive(false);
		setDeclineError(null);
		setDeclineOpen((open) => !open);
	};

	if (decided) {
		return (
			<Card style={styles.card}>
				<View style={styles.confirmedRow}>
					<View
						style={[
							styles.confirmedDot,
							{
								backgroundColor:
									decided === "approved"
										? colors.success
										: colors.destructive,
							},
						]}
					/>
					<Text
						style={[
							typography.uiLabel,
							fontStyle("600"),
							{ color: colors.foreground },
						]}
					>
						{decided === "approved" ? "Approved" : "Denied"}
					</Text>
				</View>
			</Card>
		);
	}

	const isBlocked = approval.risk_label === "blocked";
	const actionsDisabled = busy || expired;

	return (
		<Card style={styles.card}>
			<View style={styles.headerRow}>
				<Text
					style={[
						typography.uiLabel,
						fontStyle("600"),
						{
							color: colors.foreground,
							fontSize: FontSizes.h3,
							textDecorationLine: expired ? "line-through" : "none",
							opacity: expired ? 0.55 : 1,
						},
					]}
					numberOfLines={2}
				>
					{title}
				</Text>
				<RiskBadge risk={approval.risk_label} />
			</View>

			<View style={styles.toolRow}>
				<View
					style={[
						styles.toolChip,
						{ backgroundColor: colors.secondary },
					]}
				>
					<Text
						style={[
							typography.meta,
							fontStyle("500"),
							{ color: colors.secondaryForeground },
						]}
						numberOfLines={1}
					>
						{toolName}
					</Text>
				</View>
				{msLeft !== null && (
					<Text
						style={[
							typography.meta,
							fontStyle("500"),
							{
								color: expired
									? colors.destructive
									: colors.mutedForeground,
							},
						]}
					>
						{expired
							? "Expired"
							: `Expires in ${formatExpiresIn(msLeft)}`}
					</Text>
				)}
			</View>

			{approval.action_preview ? (
				<Text
					style={[
						typography.uiLabel,
						{ color: colors.mutedForeground },
					]}
					numberOfLines={4}
				>
					{approval.action_preview}
				</Text>
			) : null}

			{approval.destination_preview ? (
				<Text
					style={[typography.meta, { color: colors.mutedForeground }]}
					numberOfLines={2}
				>
					<Text style={{ color: colors.foreground }}>Destination: </Text>
					{approval.destination_preview}
				</Text>
			) : null}

			{dataUsed.length > 0 ? (
				<Text
					style={[typography.meta, { color: colors.mutedForeground }]}
					numberOfLines={2}
				>
					<Text style={{ color: colors.foreground }}>Data used: </Text>
					{dataUsed.join(", ")}
				</Text>
			) : null}

			{approval.reason ? (
				<Text
					style={[typography.meta, { color: colors.mutedForeground }]}
					numberOfLines={3}
				>
					<Text style={{ color: colors.foreground }}>Why: </Text>
					{approval.reason}
				</Text>
			) : null}

			{isBlocked ? (
				<Text
					style={[
						typography.meta,
						fontStyle("600"),
						{ color: colors.destructive },
					]}
				>
					Blocked by policy: this can never run.
				</Text>
			) : null}

			<Text
				style={[
					typography.meta,
					styles.footnote,
					{ color: colors.mutedForeground },
				]}
			>
				Nothing runs until you approve.
			</Text>

			{confirmingDestructive ? (
				<View
					style={[
						styles.confirmBox,
						{
							borderColor: colors.destructive,
							backgroundColor: withOpacity(colors.destructive, 0.08),
						},
					]}
				>
					<Text
						style={[
							typography.uiLabel,
							fontStyle("600"),
							{ color: colors.foreground },
						]}
					>
						This is destructive. Confirm again.
					</Text>
					<View style={styles.confirmButtons}>
						<Button
							variant="destructive"
							size="sm"
							isLoading={busy}
							onPress={handleConfirmDestructive}
						>
							<Text
								style={[
									typography.uiLabel,
									fontStyle("600"),
									{ color: colors.destructiveForeground },
								]}
							>
								Confirm approve
							</Text>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onPress={() => setConfirmingDestructive(false)}
						>
							<Text
								style={[
									typography.uiLabel,
									fontStyle("600"),
									{ color: colors.foreground },
								]}
							>
								Cancel
							</Text>
						</Button>
					</View>
				</View>
			) : null}

			{declineOpen ? (
				<View style={styles.declineBox}>
					<TextField
						label="Reason for declining"
						placeholder="Why should this not run?"
						value={declineReason}
						onChangeText={(text) => {
							setDeclineReason(text);
							if (declineError) setDeclineError(null);
						}}
						multiline
						numberOfLines={3}
						editable={!busy}
						error={declineError ?? undefined}
					/>
					<View style={styles.confirmButtons}>
						<Button
							variant="outline"
							size="sm"
							isLoading={busy}
							onPress={() => void doDeny()}
						>
							<Text
								style={[
									typography.uiLabel,
									fontStyle("600"),
									{ color: colors.foreground },
								]}
							>
								Confirm decline
							</Text>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onPress={() => {
								setDeclineOpen(false);
								setDeclineReason("");
								setDeclineError(null);
							}}
						>
							<Text
								style={[
									typography.uiLabel,
									fontStyle("600"),
									{ color: colors.foreground },
								]}
							>
								Cancel
							</Text>
						</Button>
					</View>
				</View>
			) : null}

			{error ? (
				<Text
					style={[
						typography.meta,
						styles.errorText,
						{ color: colors.destructive },
					]}
				>
					{error}
				</Text>
			) : null}

			<View style={styles.actionsRow}>
				<Button
					variant="primary"
					size="sm"
					isLoading={busy && !declineOpen}
					disabled={actionsDisabled || isBlocked}
					onPress={handleApprovePress}
				>
					<View style={styles.buttonContent}>
						<CheckIcon size={14} color={colors.primaryForeground} />
						<Text
							style={[
								typography.uiLabel,
								fontStyle("600"),
								{ color: colors.primaryForeground },
							]}
						>
							Approve
						</Text>
					</View>
				</Button>
				<Button
					variant="outline"
					size="sm"
					isLoading={busy && declineOpen}
					disabled={actionsDisabled}
					onPress={handleDeclinePress}
				>
					<View style={styles.buttonContent}>
						<XIcon size={14} color={colors.foreground} />
						<Text
							style={[
								typography.uiLabel,
								fontStyle("600"),
								{ color: colors.foreground },
							]}
						>
							Decline
						</Text>
					</View>
				</Button>
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	card: {
		marginHorizontal: Spacing.md,
		marginVertical: Spacing.xs,
		padding: Spacing.md,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: Spacing.sm,
	},
	riskBadge: {
		borderRadius: 999,
		paddingHorizontal: Spacing.sm,
		paddingVertical: 4,
		flexShrink: 0,
	},
	toolRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: Spacing.sm,
		gap: Spacing.sm,
	},
	toolChip: {
		borderRadius: 6,
		paddingHorizontal: Spacing.sm,
		paddingVertical: 4,
		maxWidth: "60%",
	},
	footnote: {
		marginTop: Spacing.sm,
		fontStyle: "italic",
	},
	confirmBox: {
		borderWidth: 1,
		borderRadius: 8,
		padding: Spacing.sm,
		marginTop: Spacing.sm,
	},
	confirmButtons: {
		flexDirection: "row",
		gap: Spacing.sm,
		marginTop: Spacing.sm,
	},
	declineBox: {
		marginTop: Spacing.sm,
		gap: Spacing.sm,
	},
	errorText: {
		marginTop: Spacing.sm,
	},
	actionsRow: {
		flexDirection: "row",
		gap: Spacing.sm,
		marginTop: Spacing.md,
	},
	buttonContent: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	confirmedRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: Spacing.sm,
		padding: Spacing.sm,
	},
	confirmedDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
});
