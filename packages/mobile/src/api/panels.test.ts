import { apiDelete, apiGet, apiPost } from "../lib/httpClient";
import {
	PANELS_CACHE_TTL_MS,
	PanelsCache,
	panelsApi,
	type Panel,
} from "./panels";

jest.mock("../lib/httpClient", () => ({
	apiGet: jest.fn(),
	apiPost: jest.fn(),
	apiDelete: jest.fn(),
	apiPatch: jest.fn(),
}));

const mockGet = apiGet as jest.Mock;
const mockPost = apiPost as jest.Mock;
const mockDelete = apiDelete as jest.Mock;

function panelFixture(overrides: Partial<Panel> = {}): Panel {
	return {
		id: "approvals",
		title: "Approvals",
		headline: "2 approvals waiting for your decision.",
		tiles: [{ label: "Pending", value: "2" }],
		rows: [{ title: "Deploy", detail: "high risk", timestamp: 1700000000 }],
		generated_at: 1700000100,
		empty: false,
		...overrides,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	panelsApi.clearCache();
});

describe("listPanels", () => {
	it("fetches from the node on a cold cache", async () => {
		const panels = [panelFixture()];
		mockGet.mockResolvedValue(panels);
		const result = await panelsApi.listPanels();
		expect(result).toBe(panels);
		expect(mockGet).toHaveBeenCalledWith("/panels");
	});

	it("serves the second call from cache without a node round-trip", async () => {
		mockGet.mockResolvedValue([panelFixture()]);
		await panelsApi.listPanels();
		const second = await panelsApi.listPanels();
		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(second).toHaveLength(1);
	});

	it("refresh bypasses the cache", async () => {
		mockGet.mockResolvedValue([panelFixture()]);
		await panelsApi.listPanels();
		mockGet.mockResolvedValue([panelFixture({ id: "goals" })]);
		const refreshed = await panelsApi.listPanels({ refresh: true });
		expect(mockGet).toHaveBeenCalledTimes(2);
		expect(refreshed[0].id).toBe("goals");
	});

	it("propagates node errors", async () => {
		mockGet.mockRejectedValue(new Error("unreachable"));
		await expect(panelsApi.listPanels()).rejects.toThrow("unreachable");
	});
});

describe("parse", () => {
	it("posts the text and returns the parse result", async () => {
		const result = {
			status: "proposal",
			proposal: {
				name: "My goals panel",
				source: "goals",
				filter: "overdue",
				sort: "newest",
				limit: 5,
				matched: ["goals"],
			},
			question: null,
			options: [],
		};
		mockPost.mockResolvedValue(result);
		const out = await panelsApi.parse("make a panel showing overdue goals");
		expect(mockPost).toHaveBeenCalledWith("/custom-panels/parse", {
			text: "make a panel showing overdue goals",
		});
		expect(out).toBe(result);
	});
});

describe("custom panel CRUD", () => {
	it("lists custom definitions", async () => {
		mockGet.mockResolvedValue([]);
		await panelsApi.listCustom();
		expect(mockGet).toHaveBeenCalledWith("/custom-panels");
	});

	it("creates a custom panel and clears the list cache", async () => {
		mockGet.mockResolvedValue([panelFixture()]);
		await panelsApi.listPanels();
		const created = { id: "cpanel_1", name: "Ops" };
		mockPost.mockResolvedValue(created);
		const out = await panelsApi.createCustom({
			name: "Ops",
			source: "approvals",
		});
		expect(mockPost).toHaveBeenCalledWith("/custom-panels", {
			name: "Ops",
			source: "approvals",
		});
		expect(out).toBe(created);
		// Cache was cleared: the next list hits the node again.
		mockGet.mockResolvedValue([panelFixture()]);
		await panelsApi.listPanels();
		expect(mockGet).toHaveBeenCalledTimes(2);
	});

	it("renders a custom panel", async () => {
		mockGet.mockResolvedValue(panelFixture({ id: "cpanel_1" }));
		await panelsApi.renderCustom("cpanel_1");
		expect(mockGet).toHaveBeenCalledWith("/custom-panels/cpanel_1/render");
	});

	it("deletes with explicit confirm=true and clears the cache", async () => {
		mockDelete.mockResolvedValue({ deleted: "cpanel_1" });
		mockGet.mockResolvedValue([panelFixture()]);
		await panelsApi.listPanels();
		await panelsApi.deleteCustom("cpanel_1");
		expect(mockDelete).toHaveBeenCalledWith("/custom-panels/cpanel_1", {
			confirm: true,
		});
		mockGet.mockResolvedValue([panelFixture()]);
		await panelsApi.listPanels();
		expect(mockGet).toHaveBeenCalledTimes(2);
	});
});

describe("PanelsCache TTL", () => {
	it("exposes the TTL constant as a positive number", () => {
		expect(PANELS_CACHE_TTL_MS).toBeGreaterThan(0);
	});

	it("returns null on a cold cache", () => {
		const cache = new PanelsCache();
		expect(cache.get(1_000_000)).toBeNull();
	});

	it("returns panels after set", () => {
		const cache = new PanelsCache();
		const panels = [panelFixture()];
		cache.set(panels, 1_000_000);
		expect(cache.get(1_000_000)).toBe(panels);
	});

	it("returns null once the TTL has fully elapsed", () => {
		const cache = new PanelsCache();
		cache.set([panelFixture()], 1_000_000);
		expect(cache.get(1_000_000 + PANELS_CACHE_TTL_MS + 1)).toBeNull();
	});

	it("treats the exact TTL boundary as still fresh", () => {
		const cache = new PanelsCache();
		const panels = [panelFixture()];
		cache.set(panels, 1_000_000);
		// nowMs - fetchedAtMs === TTL is NOT > TTL, so the entry survives.
		expect(cache.get(1_000_000 + PANELS_CACHE_TTL_MS)).toBe(panels);
	});

	it("clear drops the cached panels", () => {
		const cache = new PanelsCache();
		cache.set([panelFixture()], 1_000_000);
		cache.clear();
		expect(cache.get(1_000_000)).toBeNull();
	});
});
