import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { XIcon } from "@/components/icons";
import type { Panel } from "@/api/panels";
import { typography, useTheme } from "@/theme";
import { PanelCard } from "./PanelCard";

interface PanelViewerProps {
	/** Heading shown above the cards, e.g. "Your panels". */
	title: string;
	panels: Panel[];
	isLoading?: boolean;
	error?: string | null;
	onDismiss: () => void;
	nowMs?: number;
}

/**
 * Dismissible panel viewer rendered above the chat composer. Used when
 * the user asks to see their panels and right after a new custom panel
 * is created. Panels are glanceable, never chat-cluttering: the viewer
 * is explicitly opened and explicitly dismissed.
 */
export function PanelViewer({
	title,
	panels,
	isLoading = false,
	error = null,
	onDismiss,
	nowMs = Date.now(),
}: PanelViewerProps) {
	const { colors } = useTheme();

	const handleDismiss = useCallback(() => {
		impactAsync(ImpactFeedbackStyle.Light).catch(() => {});
		onDismiss();
	}, [onDismiss]);

	return (
		<View
			className="mx-3 mb-2 rounded-2xl overflow-hidden"
			style={{
				backgroundColor: colors.background,
				borderColor: colors.border,
				borderWidth: 1,
				maxHeight: 420,
			}}
			accessibilityLabel="Panel viewer"
		>
			<View
				className="flex-row items-center justify-between px-3 py-2"
				style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
			>
				<Text style={[typography.uiLabel, { color: colors.foreground }]}>
					{title}
				</Text>
				<Pressable
					onPress={handleDismiss}
					accessibilityLabel="Dismiss panels"
					accessibilityRole="button"
					className="p-1"
				>
					<XIcon color={colors.mutedForeground} size={18} />
				</Pressable>
			</View>
			<ScrollView>
				<View className="py-2">
					{isLoading ? (
						<Text
							style={[typography.micro, { color: colors.mutedForeground }]}
							className="px-3 py-2"
						>
							Loading panels...
						</Text>
					) : error ? (
						<Text
							style={[typography.micro, { color: colors.destructive }]}
							className="px-3 py-2"
						>
							{error}
						</Text>
					) : panels.length === 0 ? (
						<Text
							style={[typography.micro, { color: colors.mutedForeground }]}
							className="px-3 py-2"
						>
							No panels yet. Ask me to make one, for example "make a panel
							showing my top 5 overdue goals".
						</Text>
					) : (
						panels.map((panel) => (
							<PanelCard key={panel.id} panel={panel} nowMs={nowMs} />
						))
					)}
				</View>
			</ScrollView>
		</View>
	);
}

PanelViewer.displayName = "PanelViewer";
