import { selectionAsync } from "expo-haptics";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ContextUsage, ContextUsageDisplay } from "@/components/chat";
import {
	ChatIcon,
	FileIcon,
	LockIcon,
	PlaylistAddIcon,
	SettingsIcon,
} from "@/components/icons";
import { IconButton } from "@/components/ui";
import { useTheme } from "@/theme";
import { headerStyles } from "./Header.styles";

type MainTab = "approvals" | "chat" | "artifacts";

interface TabConfig {
	id: MainTab;
	label: string;
}

const tabs: TabConfig[] = [
	{ id: "approvals", label: "Approvals" },
	{ id: "chat", label: "Chat" },
	{ id: "artifacts", label: "Artifacts" },
];

interface HeaderProps {
	activeTab: MainTab;
	onTabChange: (tab: MainTab) => void;
	onMenuPress: () => void;
	onSettingsPress: () => void;
	onSessionsPress?: () => void;
	hasUpdate?: boolean;
	contextUsage?: ContextUsage | null;
	approvalCount?: number;
}

function getTabIcon(tabId: MainTab, color: string, size: number) {
	switch (tabId) {
		case "approvals":
			return <LockIcon color={color} size={size} />;
		case "chat":
			return <ChatIcon color={color} size={size} />;
		case "artifacts":
			return <FileIcon color={color} size={size} />;
	}
}

export function Header({
	activeTab,
	onTabChange,
	onMenuPress,
	onSettingsPress,
	onSessionsPress,
	hasUpdate = false,
	contextUsage,
	approvalCount = 0,
}: HeaderProps) {
	const insets = useSafeAreaInsets();
	const { colors } = useTheme();

	const showContextUsage =
		activeTab === "chat" && contextUsage && contextUsage.totalTokens > 0;

	const handleTabPress = useCallback(
		(tabId: MainTab) => {
			selectionAsync().catch(() => {});
			onTabChange(tabId);
		},
		[onTabChange],
	);

	return (
		<View
			className={headerStyles.container({})}
			style={{
				backgroundColor: colors.background,
				borderBottomColor: colors.border,
				borderBottomWidth: 1,
				paddingTop: insets.top,
			}}
		>
			<View className={headerStyles.content({})}>
				{/* Left section: Sessions button + context usage */}
				<View className={headerStyles.leftSection({})}>
					<IconButton
						icon={<PlaylistAddIcon color={colors.mutedForeground} size={20} />}
						variant="ghost"
						size="icon-sm"
						onPress={onSessionsPress || onMenuPress}
						accessibilityLabel="Sessions"
					/>
					{showContextUsage && (
						<ContextUsageDisplay usage={contextUsage} size="compact" />
					)}
				</View>

				{/* Right section: Tabs + settings */}
				<View className={headerStyles.rightSection({})}>
					{/* Tabs group */}
					<View className="flex-row items-center">
						{tabs.map((tab) => {
							const isActive = activeTab === tab.id;
							const showApprovalBadge =
								tab.id === "approvals" && approvalCount > 0;

							return (
								<Pressable
									key={tab.id}
									onPress={() => handleTabPress(tab.id)}
									className={headerStyles.tabButton({ isActive })}
									hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
									accessibilityLabel={tab.label}
									accessibilityRole="tab"
									accessibilityState={{ selected: isActive }}
								>
									<View className={headerStyles.tabContent({})}>
										{getTabIcon(
											tab.id,
											isActive ? colors.foreground : colors.mutedForeground,
											20,
										)}
										{/* Pending-count badge on the approvals tab */}
										{showApprovalBadge && (
											<View
												className={headerStyles.countBadge({})}
												style={{
													backgroundColor: colors.destructive,
												}}
											>
												<Text
													className={headerStyles.countBadgeText({})}
													style={{
														color: colors.destructiveForeground,
													}}
												>
													{approvalCount > 99 ? "99+" : approvalCount}
												</Text>
											</View>
										)}
									</View>
								</Pressable>
							);
						})}
					</View>

					{/* Settings button */}
					<View className={headerStyles.tabContent({})}>
						<IconButton
							icon={<SettingsIcon color={colors.mutedForeground} size={20} />}
							variant="ghost"
							size="icon-sm"
							onPress={onSettingsPress}
							accessibilityLabel="Settings"
						/>
						{hasUpdate && (
							<View
								className={headerStyles.updateDot({})}
								style={{ backgroundColor: colors.primary }}
							/>
						)}
					</View>
				</View>
			</View>
		</View>
	);
}

export default Header;
