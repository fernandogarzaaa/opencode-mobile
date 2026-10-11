import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, Text } from "react-native";
import type { ApprovalRequest } from "@/api/approvals";
import { LoaderIcon } from "@/components/icons";
import { openApprovalsInbox } from "@/lib/approvalNotifications";
import { useApprovalsStore } from "@/stores/useApprovalsStore";
import { typography, useTheme } from "@/theme";
import { pillLabelFor } from "./backgroundTaskPillLabel";
import { backgroundTaskPillsStyles } from "./BackgroundTaskPills.styles";

/**
 * One compact pill per active background task (pending approval),
 * rendered above the chat composer. Driven by the node's existing
 * approval SSE stream via useApprovalsStore: pills appear when a task
 * goes pending and vanish when it is decided. Tapping a pill opens
 * the approvals inbox, which is the task's detail surface.
 * Nothing here leaves the device.
 */
export function BackgroundTaskPills() {
	const { colors } = useTheme();
	const items = useApprovalsStore((s) => s.items);

	if (items.length === 0) {
		return null;
	}

	const handlePress = (approval: ApprovalRequest) => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
			() => undefined,
		);
		openApprovalsInbox(approval.id);
	};

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			className={backgroundTaskPillsStyles.row({})}
			accessibilityRole="none"
		>
			{items.map((approval) => (
				<Pressable
					key={approval.id}
					onPress={() => handlePress(approval)}
					accessibilityRole="button"
					accessibilityLabel={`Open approval: ${pillLabelFor(approval)}`}
					className={backgroundTaskPillsStyles.pill({})}
					style={{ backgroundColor: colors.muted }}
				>
					<LoaderIcon size={12} color={colors.primary} />
					<Text
						style={[typography.micro, { color: colors.primary }]}
						numberOfLines={1}
					>
						{pillLabelFor(approval)}
					</Text>
				</Pressable>
			))}
		</ScrollView>
	);
}
