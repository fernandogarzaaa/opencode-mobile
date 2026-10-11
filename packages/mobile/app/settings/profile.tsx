import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { SettingsScreen, SettingsSection } from "@/components/settings";
import { profileApi } from "@/api/profile";
import {
	PROFILE_SECTIONS,
	emptyUserProfile,
	getProfileField,
	setProfileField,
	validateUserProfile,
	type ProfileFieldKey,
	type UserProfile,
} from "@/profile/userProfile";
import { Fonts, FontSizes, Spacing, useTheme } from "@/theme";

export default function ProfileScreen() {
	const { colors } = useTheme();
	const [draft, setDraft] = useState<UserProfile>(emptyUserProfile());
	const [saved, setSaved] = useState<UserProfile>(emptyUserProfile());
	const [errors, setErrors] = useState<Partial<Record<ProfileFieldKey, string>>>(
		{},
	);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	const loadProfile = useCallback(async () => {
		try {
			const profile = await profileApi.load();
			setDraft(profile);
			setSaved(profile);
		} catch {
			setDraft(emptyUserProfile());
			setSaved(emptyUserProfile());
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadProfile();
	}, [loadProfile]);

	const isDirty = useMemo(
		() => JSON.stringify(draft) !== JSON.stringify(saved),
		[draft, saved],
	);

	const handleChange = (key: ProfileFieldKey, value: string) => {
		setDraft((prev) => setProfileField(prev, key, value));
		if (errors[key]) {
			setErrors((prev) => {
				const next = { ...prev };
				delete next[key];
				return next;
			});
		}
	};

	const handleSave = async () => {
		if (isSaving || !isDirty) {
			return;
		}
		const validationErrors = validateUserProfile(draft);
		if (validationErrors.length > 0) {
			const mapped: Partial<Record<ProfileFieldKey, string>> = {};
			for (const err of validationErrors) {
				mapped[err.field] = err.message;
			}
			setErrors(mapped);
			return;
		}
		setIsSaving(true);
		try {
			const updated = await profileApi.save(draft);
			setDraft(updated);
			setSaved(updated);
			setErrors({});
			await Haptics.notificationAsync(
				Haptics.NotificationFeedbackType.Success,
			);
		} catch (err) {
			Alert.alert(
				"Error",
				err instanceof Error ? err.message : "Failed to save profile",
			);
		} finally {
			setIsSaving(false);
		}
	};

	if (isLoading) {
		return (
			<SettingsScreen title="Profile">
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			</SettingsScreen>
		);
	}

	return (
		<SettingsScreen title="Profile">
			<View style={styles.content}>
				{PROFILE_SECTIONS.map((section, index) => (
					<SettingsSection
						key={section.id}
						title={section.title}
						description={section.description}
						isFirst={index === 0}
					>
						{section.fields.map((field) => (
							<View key={field.key} style={styles.field}>
								<Text
									style={[styles.fieldLabel, { color: colors.foreground }]}
								>
									{field.label}
								</Text>
								<TextInput
									value={getProfileField(draft, field.key)}
									onChangeText={(value) => handleChange(field.key, value)}
									placeholder={field.placeholder}
									placeholderTextColor={colors.mutedForeground}
									multiline={field.multiline}
									autoCapitalize="sentences"
									autoCorrect
									style={[
										styles.input,
										field.multiline && styles.inputMultiline,
										{
											color: colors.foreground,
											borderColor: errors[field.key]
												? colors.destructive
												: colors.border,
											backgroundColor: colors.card,
										},
									]}
								/>
								{errors[field.key] && (
									<Text
										style={[styles.errorText, { color: colors.destructive }]}
									>
										{errors[field.key]}
									</Text>
								)}
							</View>
						))}
					</SettingsSection>
				))}

				<Text
					style={[styles.footnote, { color: colors.mutedForeground }]}
				>
					Only what you type here. Shadow never fills this in or learns
					it in the background.
				</Text>

				<Pressable
					onPress={handleSave}
					disabled={!isDirty || isSaving}
					style={[
						styles.saveButton,
						{
							backgroundColor: colors.primary,
							opacity: !isDirty || isSaving ? 0.4 : 1,
						},
					]}
				>
					{isSaving ? (
						<ActivityIndicator size="small" color={colors.primaryForeground} />
					) : (
						<Text
							style={[
								styles.saveButtonText,
								{ color: colors.primaryForeground },
							]}
						>
							Save profile
						</Text>
					)}
				</Pressable>
			</View>
		</SettingsScreen>
	);
}

const styles = StyleSheet.create({
	loadingContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		paddingTop: Spacing[4],
		paddingHorizontal: Spacing[4],
		gap: Spacing[2],
	},
	field: {
		marginBottom: Spacing[3],
	},
	fieldLabel: {
		fontSize: FontSizes.uiLabel,
		fontFamily: Fonts.medium,
		marginBottom: Spacing[1],
	},
	input: {
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: Spacing[3],
		paddingVertical: Spacing[2],
		fontSize: FontSizes.uiLabel,
		fontFamily: Fonts.regular,
	},
	inputMultiline: {
		minHeight: 72,
		textAlignVertical: "top",
	},
	errorText: {
		fontSize: FontSizes.meta,
		fontFamily: Fonts.regular,
		marginTop: Spacing[1],
	},
	footnote: {
		fontSize: FontSizes.meta,
		fontFamily: Fonts.regular,
		marginTop: Spacing[2],
		lineHeight: 20,
	},
	saveButton: {
		borderRadius: 12,
		paddingVertical: Spacing[3],
		alignItems: "center",
		marginTop: Spacing[4],
	},
	saveButtonText: {
		fontSize: FontSizes.uiLabel,
		fontFamily: Fonts.semiBold,
	},
});
