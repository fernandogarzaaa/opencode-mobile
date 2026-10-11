import { settingsApi } from "./settings";
import {
	sanitizeUserProfile,
	type UserProfile,
} from "../profile/userProfile";

/**
 * User-profile API. The profile is persisted as the `userProfile` key inside
 * the node's settings payload, alongside the other user-typed preferences.
 * All values are explicit user input; this adapter never invents data.
 */
export const profileApi = {
	async load(): Promise<UserProfile> {
		const { settings } = await settingsApi.load();
		return sanitizeUserProfile(settings.userProfile);
	},

	async save(profile: UserProfile): Promise<UserProfile> {
		const sanitized = sanitizeUserProfile(profile);
		const updated = await settingsApi.save({ userProfile: sanitized });
		return sanitizeUserProfile(updated.userProfile);
	},
};

export type { UserProfile };
