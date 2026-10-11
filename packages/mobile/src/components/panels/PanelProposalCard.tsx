import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { CheckIcon, LayersIcon, XIcon } from "@/components/icons";
import type { PanelProposal } from "@/api/panels";
import { panelProposalSummary } from "@/lib/panelFormat";
import { typography, useTheme } from "@/theme";

interface PanelProposalCardProps {
	proposal: PanelProposal;
	onConfirm: () => void;
	onCancel: () => void;
	isConfirming?: boolean;
}

/**
 * Inline confirmation card shown above the chat composer after
 * POST /custom-panels/parse returns a parsed proposal. Tapping Confirm
 * creates the panel via POST /custom-panels; Cancel discards it.
 * Nothing is created until the user confirms.
 */
export function PanelProposalCard({
	proposal,
	onConfirm,
	onCancel,
	isConfirming = false,
}: PanelProposalCardProps) {
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
			accessibilityLabel="Panel proposal"
		>
			<View className="flex-row items-center gap-2 mb-1">
				<LayersIcon color={colors.primary} size={18} />
				<Text style={[typography.uiLabel, { color: colors.foreground }]}>
					Create this panel?
				</Text>
			</View>
			<Text
				style={[typography.uiLabel, { color: colors.foreground }]}
				numberOfLines={2}
			>
				{proposal.name}
			</Text>
			<Text style={[typography.micro, { color: colors.mutedForeground }]}>
				{panelProposalSummary(proposal)}
			</Text>
			<View className="flex-row gap-2 mt-3">
				<Pressable
					onPress={handleCancel}
					disabled={isConfirming}
					className="flex-1 flex-row items-center justify-center gap-1 py-2 rounded-xl"
					style={{ backgroundColor: colors.muted }}
					accessibilityLabel="Cancel panel proposal"
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
					accessibilityLabel={`Confirm panel: ${proposal.name}`}
					accessibilityRole="button"
				>
					<CheckIcon color={colors.primaryForeground} size={16} />
					<Text style={[typography.uiLabel, { color: colors.primaryForeground }]}>
						{isConfirming ? "Creating..." : "Create panel"}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

PanelProposalCard.displayName = "PanelProposalCard";
