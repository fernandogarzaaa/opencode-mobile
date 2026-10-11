import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert } from "react-native";
import {
	SettingsGroup,
	SettingsRow,
	SettingsScreen,
} from "@/components/settings";
import { scheduledTasksApi } from "@/api/scheduledTasks";
import { countEnabledTasks } from "@/lib/scheduleFormat";
import { useConnectionStore } from "@/stores/useConnectionStore";
import packageJson from "../../package.json";

export default function SettingsIndexScreen() {
	const { disconnect, isConnected } = useConnectionStore();
	const [scheduledTaskCount, setScheduledTaskCount] = useState<number>(0);

	// Count badge for the Scheduled Tasks row: number of enabled tasks.
	// Silently stays 0 when the node predates the /scheduled-tasks API.
	useFocusEffect(
		useCallback(() => {
			if (!isConnected) return;
			let cancelled = false;
			scheduledTasksApi
				.list()
				.then((tasks) => {
					if (!cancelled) setScheduledTaskCount(countEnabledTasks(tasks));
				})
				.catch(() => {
					if (!cancelled) setScheduledTaskCount(0);
				});
			return () => {
				cancelled = true;
			};
		}, [isConnected]),
	);

	const handleDisconnect = () => {
		Alert.alert(
			"Disconnect",
			"Are you sure you want to disconnect from the server?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Disconnect",
					style: "destructive",
					onPress: async () => {
						await disconnect();
						router.replace("/onboarding");
					},
				},
			],
		);
	};

	const handleOpenGitHub = () => {
		Linking.openURL("https://github.com/Shahfarzane/opencode-mobile");
	};

	return (
		<SettingsScreen title="Settings" showClose>
			<SettingsGroup>
				<SettingsRow
					title="Connection"
					onPress={() => router.push("/settings/connection")}
				/>
				<SettingsRow
					title="Agents"
					onPress={() => router.push("/settings/agents")}
				/>
				<SettingsRow
					title="Commands"
					onPress={() => router.push("/settings/commands")}
				/>
				<SettingsRow
					title="Skills"
					onPress={() => router.push("/settings/skills")}
				/>
				<SettingsRow
					title="Providers"
					onPress={() => router.push("/settings/providers")}
				/>
				<SettingsRow
					title="Git Identities"
					onPress={() => router.push("/settings/git")}
				/>
				<SettingsRow
					title="Appearance"
					onPress={() => router.push("/settings/appearance")}
				/>
				<SettingsRow
					title="Scheduled Tasks"
					badge={scheduledTaskCount}
					onPress={() => router.push("/settings/scheduled-tasks")}
				/>
				<SettingsRow
					title="Preferences"
					onPress={() => router.push("/settings/preferences")}
				/>
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow title="Version" value={packageJson.version} />
				<SettingsRow title="GitHub" onPress={handleOpenGitHub} />
			</SettingsGroup>

			<SettingsGroup>
				<SettingsRow
					title="Disconnect"
					destructive
					onPress={handleDisconnect}
				/>
			</SettingsGroup>
		</SettingsScreen>
	);
}
