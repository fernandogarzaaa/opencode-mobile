import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
	Text,
	View,
} from "react-native";
import {
	EditTaskSheet,
	ScheduledTaskRow,
} from "@/components/tasks";
import {
	SettingsGroup,
	SettingsScreen,
} from "@/components/settings";
import {
	isReminderTask,
	scheduledTasksApi,
	type ScheduledTask,
} from "@/api/scheduledTasks";
import { typography, useTheme } from "@/theme";

/**
 * Scheduled Tasks screen (Hark backlog item 4, client half).
 *
 * One dedicated screen for everything on a schedule: user reminders
 * (recurring or not) plus the node's builtin ambient tasks, all from
 * GET /scheduled-tasks on the node (fernandogarzaaa/SHADOW-AI#85).
 * Reminders get full CRUD; ambient tasks can only be enabled/disabled.
 */
export default function ScheduledTasksScreen() {
	const { colors } = useTheme();
	const [tasks, setTasks] = useState<ScheduledTask[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [nodeMissingRoutes, setNodeMissingRoutes] = useState(false);
	const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);

	const loadTasks = useCallback(async (showSpinner: boolean) => {
		if (showSpinner) setIsLoading(true);
		setLoadError(null);
		setNodeMissingRoutes(false);
		try {
			const list = await scheduledTasksApi.list();
			setTasks(list);
		} catch (e) {
			const message = e instanceof Error ? e.message : "Could not load tasks.";
			// The node half (SHADOW-AI#85) may not be merged/deployed yet.
			// A 404 on /scheduled-tasks means the node predates the route.
			if (/404/.test(message)) {
				setNodeMissingRoutes(true);
			} else {
				setLoadError(message);
			}
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			void loadTasks(true);
		}, [loadTasks]),
	);

	const handleRefresh = useCallback(() => {
		setIsRefreshing(true);
		void loadTasks(false);
	}, [loadTasks]);

	const handleToggle = useCallback(
		async (task: ScheduledTask, enabled: boolean) => {
			// Optimistic update; roll back on failure.
			setTasks((prev) =>
				prev.map((t) => (t.id === task.id ? { ...t, enabled } : t)),
			);
			try {
				const updated = await scheduledTasksApi.update(task.id, { enabled });
				setTasks((prev) =>
					prev.map((t) => (t.id === task.id ? updated : t)),
				);
			} catch (e) {
				setTasks((prev) =>
					prev.map((t) =>
						t.id === task.id ? { ...t, enabled: task.enabled } : t,
					),
				);
				Alert.alert(
					"Could not update",
					e instanceof Error ? e.message : "The task was not updated.",
				);
			}
		},
		[],
	);

	const handleEdit = useCallback((task: ScheduledTask) => {
		setEditingTask(task);
	}, []);

	const handleSaveEdit = useCallback(
		async (patch: {
			title: string;
			note: string;
			recurrence: string;
			enabled: boolean;
		}) => {
			if (!editingTask) return;
			const updated = await scheduledTasksApi.update(editingTask.id, patch);
			setTasks((prev) =>
				prev.map((t) => (t.id === editingTask.id ? updated : t)),
			);
		},
		[editingTask],
	);

	const handleDelete = useCallback(
		(task: ScheduledTask) => {
			Alert.alert(
				"Delete reminder",
				`Delete "${task.title}"? This cannot be undone.`,
				[
					{ text: "Cancel", style: "cancel" },
					{
						text: "Delete",
						style: "destructive",
						onPress: async () => {
							try {
								await scheduledTasksApi.remove(task.id);
								setTasks((prev) => prev.filter((t) => t.id !== task.id));
							} catch (e) {
								Alert.alert(
									"Could not delete",
									e instanceof Error ? e.message : "The task was not deleted.",
								);
							}
						},
					},
				],
			);
		},
		[],
	);

	const reminders = tasks.filter(isReminderTask);
	const ambientTasks = tasks.filter((t) => !isReminderTask(t));

	return (
		<SettingsScreen title="Scheduled Tasks">
			{isLoading ? (
				<View className="flex-1 items-center justify-center py-16">
					<ActivityIndicator color={colors.primary} />
				</View>
			) : nodeMissingRoutes ? (
				<View className="px-4 py-8">
					<Text
						className="text-center"
						style={[typography.uiLabel, { color: colors.foreground }]}
					>
						Scheduled tasks need a newer Shadow Node
					</Text>
					<Text
						className="text-center mt-2"
						style={[typography.micro, { color: colors.mutedForeground }]}
					>
						This screen talks to the unified /scheduled-tasks API, which
						is not on your node yet. Update the node, then pull to refresh.
					</Text>
				</View>
			) : loadError ? (
				<View className="px-4 py-8">
					<Text
						className="text-center"
						style={[typography.uiLabel, { color: colors.destructive }]}
					>
						{loadError}
					</Text>
				</View>
			) : (
				<ScrollView
					showsVerticalScrollIndicator={false}
					refreshControl={
						<RefreshControl
							refreshing={isRefreshing}
							onRefresh={handleRefresh}
							tintColor={colors.primary}
						/>
					}
				>
					<SettingsGroup>
						<Text
							className="px-4 pt-2 pb-1"
							style={[typography.micro, { color: colors.mutedForeground }]}
						>
							{`REMINDERS (${reminders.length})`}
						</Text>
						{reminders.length === 0 ? (
							<Text
								className="px-4 py-3"
								style={[typography.micro, { color: colors.mutedForeground }]}
							>
								No reminders yet. In chat, say "remind me every weekday at
								7am" to create one.
							</Text>
						) : (
							<View className="gap-2 px-4">
								{reminders.map((task) => (
									<ScheduledTaskRow
										key={task.id}
										task={task}
										onToggle={handleToggle}
										onEdit={handleEdit}
										onDelete={handleDelete}
									/>
								))}
							</View>
						)}
					</SettingsGroup>

					<SettingsGroup>
						<Text
							className="px-4 pt-2 pb-1"
							style={[typography.micro, { color: colors.mutedForeground }]}
						>
							{`AMBIENT TASKS (${ambientTasks.length})`}
						</Text>
						<Text
							className="px-4 pb-2"
							style={[typography.micro, { color: colors.mutedForeground }]}
						>
							Builtin node schedules. They can be enabled or disabled, not
							deleted.
						</Text>
						<View className="gap-2 px-4">
							{ambientTasks.map((task) => (
								<ScheduledTaskRow
									key={task.id}
									task={task}
									onToggle={handleToggle}
									onEdit={handleEdit}
									onDelete={handleDelete}
								/>
							))}
						</View>
					</SettingsGroup>
				</ScrollView>
			)}

			{editingTask && (
				<EditTaskSheet
					task={editingTask}
					visible={editingTask !== null}
					onClose={() => setEditingTask(null)}
					onSave={handleSaveEdit}
				/>
			)}
		</SettingsScreen>
	);
}
