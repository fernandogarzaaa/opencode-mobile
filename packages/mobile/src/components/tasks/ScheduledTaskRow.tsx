import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import { useCallback } from "react";
import { Switch, Text, View } from "react-native";
import {
	EditIcon,
	TrashIcon,
} from "@/components/icons";
import { IconButton } from "@/components/ui";
import { type ScheduledTask, isReminderTask } from "@/api/scheduledTasks";
import { formatNextRun } from "@/lib/scheduleFormat";
import { typography, useTheme } from "@/theme";

interface ScheduledTaskRowProps {
	task: ScheduledTask;
	onToggle: (task: ScheduledTask, enabled: boolean) => void;
	onEdit: (task: ScheduledTask) => void;
	onDelete: (task: ScheduledTask) => void;
}

/**
 * One row in the Scheduled Tasks screen: title, plain-words cadence,
 * next-run line, enable/disable switch. Reminders get edit/delete;
 * builtin ambient tasks get a "Builtin" tag instead (the node rejects
 * ambient deletes with 422).
 */
export function ScheduledTaskRow({
	task,
	onToggle,
	onEdit,
	onDelete,
}: ScheduledTaskRowProps) {
	const { colors } = useTheme();
	const isReminder = isReminderTask(task);
	const nextRunLine = formatNextRun(task.next_run, task.enabled);

	const handleToggle = useCallback(
		(value: boolean) => {
			impactAsync(ImpactFeedbackStyle.Light).catch(() => {});
			onToggle(task, value);
		},
		[onToggle, task],
	);

	const handleEdit = useCallback(() => {
		impactAsync(ImpactFeedbackStyle.Light).catch(() => {});
		onEdit(task);
	}, [onEdit, task]);

	const handleDelete = useCallback(() => {
		impactAsync(ImpactFeedbackStyle.Light).catch(() => {});
		onDelete(task);
	}, [onDelete, task]);

	return (
		<View
			className="flex-row items-center gap-3 px-4 py-3 rounded-2xl"
			style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
			accessibilityLabel={`Scheduled task: ${task.title}`}
		>
			<View className="flex-1 min-w-0">
				<Text
					style={[typography.uiLabel, { color: colors.foreground }]}
					numberOfLines={1}
				>
					{task.title}
				</Text>
				<Text
					style={[typography.micro, { color: colors.mutedForeground }]}
					numberOfLines={1}
				>
					{task.cadence}
				</Text>
				{nextRunLine && (
					<Text
						style={[typography.micro, { color: colors.primary }]}
						numberOfLines={1}
					>
						{nextRunLine}
					</Text>
				)}
				{!isReminder && (
					<Text
						style={[typography.micro, { color: colors.mutedForeground }]}
						numberOfLines={1}
					>
						Builtin ambient task
					</Text>
				)}
			</View>
			{isReminder && (
				<View className="flex-row items-center">
					<IconButton
						icon={<EditIcon color={colors.mutedForeground} size={18} />}
						variant="ghost"
						size="icon-sm"
						accessibilityLabel={`Edit ${task.title}`}
						onPress={handleEdit}
					/>
					<IconButton
						icon={<TrashIcon color={colors.destructive} size={18} />}
						variant="ghost"
						size="icon-sm"
						accessibilityLabel={`Delete ${task.title}`}
						onPress={handleDelete}
					/>
				</View>
			)}
			<Switch
				value={task.enabled}
				onValueChange={handleToggle}
				trackColor={{ false: colors.muted, true: colors.primary }}
				thumbColor={colors.card}
				ios_backgroundColor={colors.muted}
				accessibilityLabel={
					task.enabled ? `Disable ${task.title}` : `Enable ${task.title}`
				}
			/>
		</View>
	);
}

ScheduledTaskRow.displayName = "ScheduledTaskRow";
