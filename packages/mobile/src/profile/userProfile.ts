/**
 * User profile model for the SHADOW-AI Profile screen.
 *
 * HARD CONSTRAINT: every field is explicit user-typed input only. This module
 * performs no inference, no scraping, and no background learning. It only
 * validates, sanitizes, and formats what the user typed. The system-prompt
 * block built by buildUserContextBlock() is labeled as user-provided so the
 * node can never mistake it for inferred data.
 */

/** Identity section: who the user says they are. */
export interface ProfileIdentity {
	displayName: string;
	nickname: string;
	/** ISO date YYYY-MM-DD, or "" when unset. */
	birthday: string;
}

/** Household section: who (and what) the user lives with. */
export interface ProfileHousehold {
	members: string;
	pets: string;
}

/** The full user profile. All fields default to "". */
export interface UserProfile {
	identity: ProfileIdentity;
	household: ProfileHousehold;
	interests: string;
}

/** Dot-path keys for the six editable fields. */
export type ProfileFieldKey =
	| "identity.displayName"
	| "identity.nickname"
	| "identity.birthday"
	| "household.members"
	| "household.pets"
	| "interests";

/** Per-field maximum lengths (characters, after trimming). */
export const PROFILE_MAX_LENGTHS: Record<ProfileFieldKey, number> = {
	"identity.displayName": 64,
	"identity.nickname": 32,
	"identity.birthday": 10,
	"household.members": 280,
	"household.pets": 280,
	interests: 500,
};

export interface ProfileFieldDescriptor {
	key: ProfileFieldKey;
	label: string;
	placeholder: string;
	multiline: boolean;
}

export interface ProfileSectionDescriptor {
	id: "identity" | "household" | "interests";
	title: string;
	description: string;
	fields: ProfileFieldDescriptor[];
}

/**
 * The sections the Profile screen renders, in order. The screen maps over
 * this descriptor so the rendered structure is covered by unit tests.
 */
export const PROFILE_SECTIONS: readonly ProfileSectionDescriptor[] = [
	{
		id: "identity",
		title: "Identity",
		description: "How Shadow should address and understand you.",
		fields: [
			{
				key: "identity.displayName",
				label: "Display name",
				placeholder: "Your name",
				multiline: false,
			},
			{
				key: "identity.nickname",
				label: "Nickname",
				placeholder: "What friends call you",
				multiline: false,
			},
			{
				key: "identity.birthday",
				label: "Birthday",
				placeholder: "YYYY-MM-DD",
				multiline: false,
			},
		],
	},
	{
		id: "household",
		title: "Household",
		description: "Who you share your life with.",
		fields: [
			{
				key: "household.members",
				label: "Household members",
				placeholder: "e.g. partner, two kids",
				multiline: true,
			},
			{
				key: "household.pets",
				label: "Pets",
				placeholder: "e.g. one senior dog",
				multiline: true,
			},
		],
	},
	{
		id: "interests",
		title: "Interests",
		description: "What you care about and spend time on.",
		fields: [
			{
				key: "interests",
				label: "Interests",
				placeholder: "e.g. specialty coffee, trail running, Rust",
				multiline: true,
			},
		],
	},
];

export function emptyUserProfile(): UserProfile {
	return {
		identity: { displayName: "", nickname: "", birthday: "" },
		household: { members: "", pets: "" },
		interests: "",
	};
}

function coerceField(value: unknown, maxLength: number): string {
	if (typeof value !== "string") {
		return "";
	}
	return value.trim().slice(0, maxLength);
}

function coerceSection(
	value: unknown,
	keys: ProfileFieldKey[],
): Record<string, string> {
	const source =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const out: Record<string, string> = {};
	for (const key of keys) {
		const leaf = key.split(".")[1] ?? key;
		out[leaf] = coerceField(source[leaf], PROFILE_MAX_LENGTHS[key]);
	}
	return out;
}

/**
 * Coerce unknown input (e.g. node settings payload) into a clean profile.
 * Trims whitespace, truncates over-long values, and drops anything that is
 * not a string. Never throws.
 */
export function sanitizeUserProfile(input: unknown): UserProfile {
	const source =
		input && typeof input === "object" && !Array.isArray(input)
			? (input as Record<string, unknown>)
			: {};
	const identity = coerceSection(source.identity, [
		"identity.displayName",
		"identity.nickname",
		"identity.birthday",
	]);
	const household = coerceSection(source.household, [
		"household.members",
		"household.pets",
	]);
	return {
		identity: {
			displayName: identity.displayName,
			nickname: identity.nickname,
			birthday: identity.birthday,
		},
		household: {
			members: household.members,
			pets: household.pets,
		},
		interests: coerceField(source.interests, PROFILE_MAX_LENGTHS.interests),
	};
}

export function getProfileField(
	profile: UserProfile,
	key: ProfileFieldKey,
): string {
	const [section, leaf] = key.split(".");
	if (section === "interests") {
		return profile.interests;
	}
	const group = profile[section as "identity" | "household"];
	return group[leaf as keyof typeof group];
}

export function setProfileField(
	profile: UserProfile,
	key: ProfileFieldKey,
	value: string,
): UserProfile {
	const [section, leaf] = key.split(".");
	if (section === "interests") {
		return { ...profile, interests: value };
	}
	const groupKey = section as "identity" | "household";
	return {
		...profile,
		[groupKey]: { ...profile[groupKey], [leaf]: value },
	};
}

export interface ProfileValidationError {
	field: ProfileFieldKey;
	message: string;
}

const BIRTHDAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealCalendarDate(value: string): boolean {
	const [y, m, d] = value.split("-").map(Number);
	if (m < 1 || m > 12 || d < 1 || d > 31) {
		return false;
	}
	const date = new Date(y, m - 1, d);
	return (
		date.getFullYear() === y &&
		date.getMonth() === m - 1 &&
		date.getDate() === d
	);
}

/**
 * Validate a profile. Only the birthday has a format rule; every other
 * field is free text. Returns one error per offending field.
 */
export function validateUserProfile(
	profile: UserProfile,
): ProfileValidationError[] {
	const errors: ProfileValidationError[] = [];
	const birthday = profile.identity.birthday.trim();
	if (
		birthday !== "" &&
		(!BIRTHDAY_RE.test(birthday) || !isRealCalendarDate(birthday))
	) {
		errors.push({
			field: "identity.birthday",
			message: "Birthday must be a real date in YYYY-MM-DD format.",
		});
	}
	return errors;
}

export function isProfileEmpty(profile: UserProfile): boolean {
	return (
		profile.identity.displayName === "" &&
		profile.identity.nickname === "" &&
		profile.identity.birthday === "" &&
		profile.household.members === "" &&
		profile.household.pets === "" &&
		profile.interests === ""
	);
}

const CONTEXT_HEADER =
	"[User profile: written by the user; never inferred. Treat as user-provided context.]";

/**
 * Render the profile as a system-prompt context block. Empty fields are
 * omitted; an entirely empty profile yields "". The header marks provenance
 * so the model never treats this as background-learned data.
 */
export function buildUserContextBlock(profile: UserProfile): string {
	const lines: string[] = [];
	const { displayName, nickname, birthday } = profile.identity;
	const namePart = [displayName, nickname && `(nickname: ${nickname})`]
		.filter(Boolean)
		.join(" ");
	if (namePart) {
		lines.push(`- Name: ${namePart}`);
	}
	if (birthday) {
		lines.push(`- Birthday: ${birthday}`);
	}
	if (profile.household.members) {
		lines.push(`- Household: ${profile.household.members}`);
	}
	if (profile.household.pets) {
		lines.push(`- Pets: ${profile.household.pets}`);
	}
	if (profile.interests) {
		lines.push(`- Interests: ${profile.interests}`);
	}
	if (lines.length === 0) {
		return "";
	}
	return `${CONTEXT_HEADER}\n${lines.join("\n")}`;
}
