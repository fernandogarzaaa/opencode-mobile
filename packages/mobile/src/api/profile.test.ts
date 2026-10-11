import { profileApi } from "./profile";
import { settingsApi } from "./settings";
import { emptyUserProfile } from "../profile/userProfile";

jest.mock("./settings", () => ({
	__esModule: true,
	settingsApi: {
		load: jest.fn(),
		save: jest.fn(),
	},
}));

const mockLoad = settingsApi.load as jest.Mock;
const mockSave = settingsApi.save as jest.Mock;

beforeEach(() => {
	mockLoad.mockReset();
	mockSave.mockReset();
});

describe("profileApi.load", () => {
	it("returns the stored profile", () => {
		mockLoad.mockResolvedValue({
			settings: {
				userProfile: {
					identity: {
						displayName: "Ada",
						nickname: "",
						birthday: "1815-12-10",
					},
					household: { members: "partner", pets: "" },
					interests: "math",
				},
			},
			source: "web",
		});
		return expect(profileApi.load()).resolves.toEqual({
			identity: {
				displayName: "Ada",
				nickname: "",
				birthday: "1815-12-10",
			},
			household: { members: "partner", pets: "" },
			interests: "math",
		});
	});

	it("sanitizes the stored payload on the way out", () => {
		// Kills the mutant that skips sanitization on load.
		mockLoad.mockResolvedValue({
			settings: {
				userProfile: {
					identity: { displayName: "  Ada  ", nickname: 42 },
				},
			},
			source: "web",
		});
		return expect(profileApi.load()).resolves.toEqual({
			...emptyUserProfile(),
			identity: { displayName: "Ada", nickname: "", birthday: "" },
		});
	});

	it("returns an empty profile when the node has none stored", () => {
		mockLoad.mockResolvedValue({ settings: {}, source: "web" });
		return expect(profileApi.load()).resolves.toEqual(emptyUserProfile());
	});

	it("propagates load failures", () => {
		mockLoad.mockRejectedValue(new Error("offline"));
		return expect(profileApi.load()).rejects.toThrow("offline");
	});
});

describe("profileApi.save", () => {
	it("saves the sanitized profile under the userProfile key", async () => {
		mockSave.mockImplementation(async (changes: unknown) => changes);
		const profile = {
			...emptyUserProfile(),
			identity: {
				displayName: "  Ada  ",
				nickname: "",
				birthday: "",
			},
		};
		await profileApi.save(profile);
		expect(mockSave).toHaveBeenCalledTimes(1);
		expect(mockSave).toHaveBeenCalledWith({
			userProfile: {
				...emptyUserProfile(),
				identity: { displayName: "Ada", nickname: "", birthday: "" },
			},
		});
	});

	it("returns the sanitized server response", async () => {
		// Kills the mutant that returns the raw server payload.
		mockSave.mockResolvedValue({
			userProfile: {
				identity: { displayName: "  Ada  " },
				extra: "junk",
			},
		});
		const result = await profileApi.save(emptyUserProfile());
		expect(result).toEqual({
			...emptyUserProfile(),
			identity: { displayName: "Ada", nickname: "", birthday: "" },
		});
	});

	it("propagates save failures", () => {
		mockSave.mockRejectedValue(new Error("offline"));
		return expect(profileApi.save(emptyUserProfile())).rejects.toThrow(
			"offline",
		);
	});
});
