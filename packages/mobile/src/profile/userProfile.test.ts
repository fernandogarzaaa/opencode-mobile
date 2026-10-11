import {
	PROFILE_MAX_LENGTHS,
	PROFILE_SECTIONS,
	buildUserContextBlock,
	emptyUserProfile,
	getProfileField,
	isProfileEmpty,
	sanitizeUserProfile,
	setProfileField,
	validateUserProfile,
	type ProfileFieldKey,
	type UserProfile,
} from "./userProfile";

function filledProfile(): UserProfile {
	return {
		identity: {
			displayName: "Ada Lovelace",
			nickname: "Ada",
			birthday: "1815-12-10",
		},
		household: { members: "partner", pets: "one cat" },
		interests: "mathematics, poetry",
	};
}

describe("emptyUserProfile", () => {
	it("returns every field blank", () => {
		expect(emptyUserProfile()).toEqual({
			identity: { displayName: "", nickname: "", birthday: "" },
			household: { members: "", pets: "" },
			interests: "",
		});
	});

	it("returns a fresh object each call", () => {
		const a = emptyUserProfile();
		const b = emptyUserProfile();
		a.identity.displayName = "x";
		expect(b.identity.displayName).toBe("");
	});
});

describe("sanitizeUserProfile", () => {
	it("accepts a complete valid profile unchanged", () => {
		expect(sanitizeUserProfile(filledProfile())).toEqual(filledProfile());
	});

	it("trims surrounding whitespace", () => {
		const out = sanitizeUserProfile({
			identity: { displayName: "  Ada  " },
		});
		expect(out.identity.displayName).toBe("Ada");
	});

	it("truncates values longer than the field maximum", () => {
		// displayName max is 64: a 70-char name must come back at 64.
		const long = "x".repeat(70);
		const out = sanitizeUserProfile({ identity: { displayName: long } });
		expect(out.identity.displayName).toHaveLength(
			PROFILE_MAX_LENGTHS["identity.displayName"],
		);
		expect(out.identity.displayName).toBe("x".repeat(64));
	});

	it("truncates the birthday to 10 characters", () => {
		const out = sanitizeUserProfile({
			identity: { birthday: "2000-01-01T00:00:00Z" },
		});
		expect(out.identity.birthday).toBe("2000-01-01");
	});

	it("coerces non-string values to empty strings", () => {
		const out = sanitizeUserProfile({
			identity: { displayName: 42, nickname: true, birthday: null },
			household: { members: 7, pets: undefined },
			interests: ["a", "b"],
		});
		expect(out).toEqual(emptyUserProfile());
	});

	it("returns an empty profile for null, undefined, and primitives", () => {
		expect(sanitizeUserProfile(null)).toEqual(emptyUserProfile());
		expect(sanitizeUserProfile(undefined)).toEqual(emptyUserProfile());
		expect(sanitizeUserProfile("nope")).toEqual(emptyUserProfile());
		expect(sanitizeUserProfile(42)).toEqual(emptyUserProfile());
	});

	it("returns an empty profile for arrays", () => {
		expect(sanitizeUserProfile([])).toEqual(emptyUserProfile());
	});

	it("treats a non-object section as empty", () => {
		// Kills the mutant that skips the section shape guard.
		const out = sanitizeUserProfile({
			identity: "not-an-object",
			household: ["not", "an", "object"],
		});
		expect(out.identity).toEqual({
			displayName: "",
			nickname: "",
			birthday: "",
		});
		expect(out.household).toEqual({ members: "", pets: "" });
	});

	it("ignores unknown extra keys", () => {
		const out = sanitizeUserProfile({
			identity: { displayName: "Ada", favoriteColor: "blue" },
			someNewSection: { x: 1 },
		});
		expect(out.identity.displayName).toBe("Ada");
		expect(out).toEqual({
			...emptyUserProfile(),
			identity: { ...emptyUserProfile().identity, displayName: "Ada" },
		});
	});

	it("never throws on hostile input", () => {
		expect(() =>
			sanitizeUserProfile({ identity: { displayName: {} } }),
		).not.toThrow();
	});
});

describe("validateUserProfile", () => {
	it("accepts an empty birthday", () => {
		expect(validateUserProfile(emptyUserProfile())).toEqual([]);
	});

	it("accepts a valid ISO birthday", () => {
		const p = {
			...emptyUserProfile(),
			identity: {
				...emptyUserProfile().identity,
				birthday: "2000-02-29",
			},
		};
		expect(validateUserProfile(p)).toEqual([]);
	});

	it("accepts leap day on a leap year", () => {
		const p = setProfileField(
			emptyUserProfile(),
			"identity.birthday",
			"2024-02-29",
		);
		expect(validateUserProfile(p)).toEqual([]);
	});

	it("rejects a non-ISO format", () => {
		const p = setProfileField(
			emptyUserProfile(),
			"identity.birthday",
			"10/12/1815",
		);
		const errors = validateUserProfile(p);
		expect(errors).toHaveLength(1);
		expect(errors[0].field).toBe("identity.birthday");
		expect(errors[0].message).toMatch(/YYYY-MM-DD/);
	});

	it("rejects single-digit month and day", () => {
		const p = setProfileField(
			emptyUserProfile(),
			"identity.birthday",
			"1815-1-1",
		);
		expect(validateUserProfile(p)).toHaveLength(1);
	});

	it("rejects an impossible calendar date", () => {
		// Kills the mutant that only checks the regex, not the real date.
		const p = setProfileField(
			emptyUserProfile(),
			"identity.birthday",
			"2026-02-30",
		);
		expect(validateUserProfile(p)).toHaveLength(1);
	});

	it("rejects February 29 on a non-leap year", () => {
		const p = setProfileField(
			emptyUserProfile(),
			"identity.birthday",
			"2023-02-29",
		);
		expect(validateUserProfile(p)).toHaveLength(1);
	});

	it("rejects month 13 and month 00", () => {
		expect(
			validateUserProfile(
				setProfileField(emptyUserProfile(), "identity.birthday", "2000-13-01"),
			),
		).toHaveLength(1);
		expect(
			validateUserProfile(
				setProfileField(emptyUserProfile(), "identity.birthday", "2000-00-10"),
			),
		).toHaveLength(1);
	});

	it("rejects day 00", () => {
		const p = setProfileField(
			emptyUserProfile(),
			"identity.birthday",
			"2000-01-00",
		);
		expect(validateUserProfile(p)).toHaveLength(1);
	});

	it("accepts the boundary days of January and December", () => {
		// Kills the mutants that shift the month/day boundary comparisons.
		for (const birthday of ["2000-01-01", "2000-01-31", "2000-12-01", "2000-12-31"]) {
			expect(
				validateUserProfile(
					setProfileField(emptyUserProfile(), "identity.birthday", birthday),
				),
			).toEqual([]);
		}
	});

	it("rejects day 32 in any month", () => {
		for (const birthday of ["2000-01-32", "2000-12-32"]) {
			expect(
				validateUserProfile(
					setProfileField(emptyUserProfile(), "identity.birthday", birthday),
				),
			).toHaveLength(1);
		}
	});

	it("trims a padded but otherwise valid birthday", () => {
		// Kills the mutant that drops the .trim() call.
		const p = setProfileField(
			emptyUserProfile(),
			"identity.birthday",
			"  2000-01-01  ",
		);
		expect(validateUserProfile(p)).toEqual([]);
	});

	it("does not flag other free-text fields", () => {
		const p: UserProfile = {
			identity: { displayName: "Ada!", nickname: "@#$", birthday: "" },
			household: { members: "anything at all", pets: "!!!" },
			interests: "literally anything",
		};
		expect(validateUserProfile(p)).toEqual([]);
	});
});

describe("isProfileEmpty", () => {
	it("is true for a fresh profile", () => {
		expect(isProfileEmpty(emptyUserProfile())).toBe(true);
	});

	it("is false when any single field is set", () => {
		const keys: ProfileFieldKey[] = [
			"identity.displayName",
			"identity.nickname",
			"identity.birthday",
			"household.members",
			"household.pets",
			"interests",
		];
		for (const key of keys) {
			expect(isProfileEmpty(setProfileField(emptyUserProfile(), key, "x"))).toBe(
				false,
			);
		}
	});
});

describe("buildUserContextBlock", () => {
	it("returns an empty string for an empty profile", () => {
		expect(buildUserContextBlock(emptyUserProfile())).toBe("");
	});

	it("marks the block as user-written and never inferred", () => {
		const block = buildUserContextBlock({
			...emptyUserProfile(),
			interests: "chess",
		});
		expect(block).toMatch(/written by the user/i);
		expect(block).toMatch(/never inferred/i);
	});

	it("renders name with nickname in parentheses", () => {
		const block = buildUserContextBlock({
			...emptyUserProfile(),
			identity: { displayName: "Ada", nickname: "Addy", birthday: "" },
		});
		expect(block).toContain("- Name: Ada (nickname: Addy)");
	});

	it("renders a lone nickname without a display name", () => {
		const block = buildUserContextBlock({
			...emptyUserProfile(),
			identity: { displayName: "", nickname: "Addy", birthday: "" },
		});
		expect(block).toContain("- Name: (nickname: Addy)");
	});

	it("renders a lone display name without parentheses", () => {
		// Kills the mutant that always appends the nickname suffix.
		const block = buildUserContextBlock({
			...emptyUserProfile(),
			identity: { displayName: "Ada", nickname: "", birthday: "" },
		});
		expect(block).toContain("- Name: Ada");
		expect(block).not.toContain("nickname:");
	});

	it("omits every empty field", () => {
		// Kills the mutant that renders empty lines unconditionally.
		const block = buildUserContextBlock({
			...emptyUserProfile(),
			interests: "chess",
		});
		expect(block).not.toContain("- Name:");
		expect(block).not.toContain("- Birthday:");
		expect(block).not.toContain("- Household:");
		expect(block).not.toContain("- Pets:");
		expect(block).toContain("- Interests: chess");
	});

	it("renders the full profile in a stable order", () => {
		expect(buildUserContextBlock(filledProfile())).toBe(
			"[User profile: written by the user; never inferred. Treat as user-provided context.]\n" +
				"- Name: Ada Lovelace (nickname: Ada)\n" +
				"- Birthday: 1815-12-10\n" +
				"- Household: partner\n" +
				"- Pets: one cat\n" +
				"- Interests: mathematics, poetry",
		);
	});
});

describe("getProfileField / setProfileField", () => {
	it("reads nested and top-level fields", () => {
		const p = filledProfile();
		expect(getProfileField(p, "identity.displayName")).toBe("Ada Lovelace");
		expect(getProfileField(p, "household.pets")).toBe("one cat");
		expect(getProfileField(p, "interests")).toBe("mathematics, poetry");
	});

	it("sets a field without mutating the original", () => {
		const before = filledProfile();
		const after = setProfileField(before, "identity.nickname", "Addy");
		expect(after.identity.nickname).toBe("Addy");
		expect(before.identity.nickname).toBe("Ada");
	});

	it("sets the top-level interests field", () => {
		const after = setProfileField(emptyUserProfile(), "interests", "chess");
		expect(after.interests).toBe("chess");
	});
});

describe("PROFILE_SECTIONS", () => {
	it("lists the three sections in order", () => {
		expect(PROFILE_SECTIONS.map((s) => s.id)).toEqual([
			"identity",
			"household",
			"interests",
		]);
	});

	it("covers all six field keys exactly once", () => {
		const keys = PROFILE_SECTIONS.flatMap((s) =>
			s.fields.map((f) => f.key),
		);
		expect(keys.sort()).toEqual(
			[
				"household.members",
				"household.pets",
				"identity.birthday",
				"identity.displayName",
				"identity.nickname",
				"interests",
			].sort(),
		);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("uses the YYYY-MM-DD placeholder for the birthday field", () => {
		const birthday = PROFILE_SECTIONS.flatMap((s) => s.fields).find(
			(f) => f.key === "identity.birthday",
		);
		expect(birthday?.placeholder).toBe("YYYY-MM-DD");
	});

	it("keeps every label and placeholder exact", () => {
		// Kills the string-literal mutants that blank out copy.
		const byKey = new Map(
			PROFILE_SECTIONS.flatMap((s) => s.fields).map((f) => [f.key, f] as const),
		);
		expect(byKey.get("identity.displayName")).toMatchObject({
			label: "Display name",
			placeholder: "Your name",
		});
		expect(byKey.get("identity.nickname")).toMatchObject({
			label: "Nickname",
			placeholder: "What friends call you",
		});
		expect(byKey.get("identity.birthday")).toMatchObject({
			label: "Birthday",
			placeholder: "YYYY-MM-DD",
		});
		expect(byKey.get("household.members")).toMatchObject({
			label: "Household members",
			placeholder: "e.g. partner, two kids",
		});
		expect(byKey.get("household.pets")).toMatchObject({
			label: "Pets",
			placeholder: "e.g. one senior dog",
		});
		expect(byKey.get("interests")).toMatchObject({
			label: "Interests",
			placeholder: "e.g. specialty coffee, trail running, Rust",
		});
	});

	it("marks only the free-text fields multiline", () => {
		const byKey = Object.fromEntries(
			PROFILE_SECTIONS.flatMap((s) => s.fields).map((f) => [f.key, f]),
		);
		expect(byKey["identity.displayName"].multiline).toBe(false);
		expect(byKey["identity.nickname"].multiline).toBe(false);
		expect(byKey["identity.birthday"].multiline).toBe(false);
		expect(byKey["household.members"].multiline).toBe(true);
		expect(byKey["household.pets"].multiline).toBe(true);
		expect(byKey["interests"].multiline).toBe(true);
	});

	it("defines a max length for every field key", () => {
		const keys = PROFILE_SECTIONS.flatMap((s) =>
			s.fields.map((f) => f.key),
		);
		for (const key of keys) {
			expect(PROFILE_MAX_LENGTHS[key]).toBeGreaterThan(0);
		}
	});

	it("gives every section a title and description", () => {
		for (const section of PROFILE_SECTIONS) {
			expect(section.title.length).toBeGreaterThan(0);
			expect(section.description.length).toBeGreaterThan(0);
		}
	});
});
