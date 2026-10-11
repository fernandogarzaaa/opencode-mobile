import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { CheckIcon, ClockIcon, XIcon } from "@/components/icons";
import type { ScheduleProposal } from "@/api/scheduledTasks";
import { typography, useTheme } from "@/theme";

interface ScheduleProposalCardProps {
	proposal: ScheduleProposal;
	onConfirm: () => void;
	onCancel: () => void;
	isConfirming?: boolean;
}

/**
 * Inline confirmation card shown above the chat composer after
 * POST /reminders/parse returns a parsed proposal. Tapping Confirm
 * creates the reminder via POST /scheduled-tasks; Cancel discards it.
 * Nothing is created until the user confirms.
 */
export function ScheduleProposalCard({
	proposal,
	onConfirm,
	onCancel,
	isConfirming = false,
}: ScheduleProposalCardProps) {
	const { colors } = useTheme();

	const handleConfirm = useCallback(() => {
		impactAsync(ImpactFeedbackStyle.Medium).catch(() => {});
		onConfirm();
	}, [onConfirm]);

	const handleCancel = useCallback(() => {
		impactAsync(ImpactFeedbackStyle.Light).catch(() => {});
		onCancel();
	}, [onCancel]);

	return (
		<View
			className="mx-3 mb-2 p-3 rounded-2xl"
			style={{
				backgroundColor: colors.card,
				borderColor: colors.border,
				borderWidth: 1,
			}}
			accessibilityLabel="Schedule proposal"
		>
			<View className="flex-row items-center gap-2 mb-1">
				<ClockIcon color={colors.primary} size={18} />
				<Text style={[typography.uiLabel, { color: colors.foreground }]}>
					Schedule this?
				</Text>
			</View>
			<Text
				style={[typography.uiLabel, { color: colors.foreground }]}
				numberOfLines={2}
			>
				{proposal.title}
			</Text>
			<Text style={[typography.micro, { color: colors.mutedForeground }]}>
				{proposal.plain_cadence}
			</Text>
			<View className="flex-row gap-2 mt-3">
				<Pressable
					onPress={handleCancel}
					disabled={isConfirming}
					className="flex-1 flex-row items-center justify-center gap-1 py-2 rounded-xl"
					style={{ backgroundColor: colors.muted }}
					accessibilityLabel="Cancel schedule proposal"
					accessibilityRole="button"
				>
					<XIcon color={colors.mutedForeground} size={16} />
					<Text style={[typography.uiLabel, { color: colors.mutedForeground }]}>
						Cancel
					</Text>
				</Pressable>
				<Pressable
					onPress={handleConfirm}
					disabled={isConfirming}
					className="flex-1 flex-row items-center justify-center gap-1 py-2 rounded-xl"
					style={{
						backgroundColor: colors.primary,
						opacity: isConfirming ? 0.6 : 1,
					}}
					accessibilityLabel={`Confirm schedule: ${proposal.title}`}
					accessibilityRole="button"
				>
					<CheckIcon color={colors.primaryForeground} size={16} />
					<Text style={[typography.uiLabel, { color: colors.primaryForeground }]}>
						{isConfirming ? "Scheduling..." : "Confirm"}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

ScheduleProposalCard.displayName = "ScheduleProposalCard";
