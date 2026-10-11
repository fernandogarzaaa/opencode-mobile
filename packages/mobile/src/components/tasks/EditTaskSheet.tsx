import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import { useCallback, useState } from "react";
import {
	Modal,
	Pressable,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import { XIcon } from "@/components/icons";
import { IconButton } from "@/components/ui";
import {
	SCHEDULE_RECURRENCES,
	type ScheduledTask,
} from "@/api/scheduledTasks";
import { recurrenceLabel } from "@/lib/scheduleFormat";
import { typography, useTheme } from "@/theme";

interface EditTaskSheetProps {
	task: ScheduledTask;
	visible: boolean;
	onClose: () => void;
	onSave: (patch: {
		title: string;
		note: string;
		recurrence: string;
		enabled: boolean;
	}) => Promise<void>;
}

/**
 * Edit sheet for a reminder: title, note, recurrence, enabled.
 * Ambient tasks are not editable (the node rejects non-enabled PATCH
 * fields with 422), so this sheet is only opened for reminders.
 */
export function EditTaskSheet({ task, visible, onClose, onSave }: EditTaskSheetProps) {
	const { colors } = useTheme();
	const [title, setTitle] = useState(task.title);
	const [note, setNote] = useState(task.note ?? "");
	const [recurrence, setRecurrence] = useState(task.recurrence ?? "none");
	const [enabled, setEnabled] = useState(task.enabled);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleClose = useCallback(() => {
		if (isSaving) return;
		setError(null);
		onClose();
	}, [isSaving, onClose]);

	const handleSave = useCallback(async () => {
		const trimmed = title.trim();
		if (!trimmed) {
			setError("Title cannot be empty.");
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			impactAsync(ImpactFeedbackStyle.Medium).catch(() => {});
			await onSave({ title: trimmed, note, recurrence, enabled });
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not save the task.");
		} finally {
			setIsSaving(false);
		}
	}, [title, note, recurrence, enabled, onSave, onClose]);

	return (
		<Modal
			visible={visible}
			transparent
			animationType="slide"
			onRequestClose={handleClose}
			accessibilityLabel="Edit scheduled task"
		>
			<View
				className="flex-1 justify-end"
				style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
			>
				<Pressable
					className="flex-1"
					onPress={handleClose}
					accessibilityLabel="Dismiss edit sheet"
				/>
				<View
					className="p-4 rounded-t-3xl"
					style={{ backgroundColor: colors.card }}
				>
					<View className="flex-row items-center justify-between mb-3">
						<Text style={[typography.uiLabel, { color: colors.foreground }]}>
							Edit reminder
						</Text>
						<IconButton
							icon={<XIcon color={colors.mutedForeground} size={18} />}
							variant="ghost"
							size="icon-sm"
							accessibilityLabel="Close edit sheet"
							onPress={handleClose}
						/>
					</View>

					<Text style={[typography.micro, { color: colors.mutedForeground }]}>
						Title
					</Text>
					<TextInput
						value={title}
						onChangeText={setTitle}
						placeholder="Reminder title"
						placeholderTextColor={colors.mutedForeground}
						className="mt-1 mb-3 px-3 py-2 rounded-xl"
						style={[
							typography.uiLabel,
							{ color: colors.foreground, backgroundColor: colors.muted },
						]}
						accessibilityLabel="Reminder title"
					/>

					<Text style={[typography.micro, { color: colors.mutedForeground }]}>
						Note
					</Text>
					<TextInput
						value={note}
						onChangeText={setNote}
						placeholder="Optional note"
						placeholderTextColor={colors.mutedForeground}
						className="mt-1 mb-3 px-3 py-2 rounded-xl"
						style={[
							typography.uiLabel,
							{ color: colors.foreground, backgroundColor: colors.muted },
						]}
						accessibilityLabel="Reminder note"
					/>

					<Text style={[typography.micro, { color: colors.mutedForeground }]}>
						Repeats
					</Text>
					<View className="flex-row flex-wrap gap-2 mt-1 mb-3">
						{SCHEDULE_RECURRENCES.map((r) => {
							const active = recurrence === r;
							return (
								<Pressable
									key={r}
									onPress={() => setRecurrence(r)}
									className="px-3 py-1.5 rounded-full"
									style={{
										backgroundColor: active ? colors.primary : colors.muted,
									}}
									accessibilityLabel={`Recurrence ${recurrenceLabel(r)}`}
									accessibilityRole="button"
									accessibilityState={{ selected: active }}
								>
									<Text
										style={[
											typography.micro,
											{
												color: active
													? colors.primaryForeground
													: colors.mutedForeground,
											},
										]}
									>
										{recurrenceLabel(r)}
									</Text>
								</Pressable>
							);
						})}
					</View>

					<View className="flex-row items-center justify-between mb-4">
						<Text style={[typography.uiLabel, { color: colors.foreground }]}>
							Enabled
						</Text>
						<Switch
							value={enabled}
							onValueChange={setEnabled}
							trackColor={{ false: colors.muted, true: colors.primary }}
							thumbColor={colors.card}
							ios_backgroundColor={colors.muted}
							accessibilityLabel="Reminder enabled"
						/>
					</View>

					{error && (
						<Text
							className="mb-2"
							style={[typography.micro, { color: colors.destructive }]}
						>
							{error}
						</Text>
					)}

					<Pressable
						onPress={handleSave}
						disabled={isSaving}
						className="py-3 rounded-xl items-center"
						style={{
							backgroundColor: colors.primary,
							opacity: isSaving ? 0.6 : 1,
						}}
						accessibilityLabel="Save reminder changes"
						accessibilityRole="button"
					>
						<Text
							style={[typography.uiLabel, { color: colors.primaryForeground }]}
						>
							{isSaving ? "Saving..." : "Save"}
						</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

EditTaskSheet.displayName = "EditTaskSheet";
