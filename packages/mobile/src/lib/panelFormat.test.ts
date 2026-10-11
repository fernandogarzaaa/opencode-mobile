import {
	customPanelDefSummary,
	formatPanelFreshness,
	formatPanelRowTime,
	looksLikePanelCreateRequest,
	looksLikePanelViewRequest,
	panelFilterLabel,
	panelProposalSummary,
	panelSortLabel,
	panelSourceLabel,
} from "./panelFormat";
import type {
	CustomPanelDef,
	CustomPanelFilter,
	CustomPanelSource,
	PanelProposal,
} from "../api/panels";

const NOW = 1_700_000_000_000; // fixed clock for deterministic tests

describe("looksLikePanelCreateRequest", () => {
	it("matches create-a-panel phrasings", () => {
		expect(looksLikePanelCreateRequest("make a panel showing my top 5 overdue goals")).toBe(true);
		expect(looksLikePanelCreateRequest("create a panel for my approvals")).toBe(true);
		expect(looksLikePanelCreateRequest("build me a memory panel")).toBe(true);
		expect(looksLikePanelCreateRequest("add a new panel with my reminders")).toBe(true);
		expect(looksLikePanelCreateRequest("a panel showing recent feed items")).toBe(true);
	});

	it("rejects non-panel chat", () => {
		expect(looksLikePanelCreateRequest("what are my goals")).toBe(false);
		expect(looksLikePanelCreateRequest("remind me at 7am")).toBe(false);
		expect(looksLikePanelCreateRequest("show my panels")).toBe(false);
		expect(looksLikePanelCreateRequest("")).toBe(false);
	});

	it("tolerates extra spacing and punctuation between create keywords", () => {
		// Two spaces: distinguishes the {0,40} gap from a single char.
		expect(looksLikePanelCreateRequest("panel  showing goals")).toBe(true);
		// Hyphen: [\s\S] matches non-whitespace, [\ss] would not.
		expect(looksLikePanelCreateRequest("panel-showing goals")).toBe(true);
	});

	it("tolerates extra spacing and punctuation between view keywords", () => {
		// Two spaces: distinguishes the {0,40} gap from a single char.
		expect(looksLikePanelViewRequest("show  my panels")).toBe(true);
		// Hyphen: [\s\S] matches non-whitespace, [\ss] would not.
		expect(looksLikePanelViewRequest("show-my panels")).toBe(true);
	});

	it("matches the singular panel form too", () => {
		expect(looksLikePanelViewRequest("show my panel")).toBe(true);
	});

	it("defers to the create trigger when both match", () => {		// Matches the create pattern ("panel showing") AND the view pattern
		// ("display my panels"): the create intercept wins, so this is not
		// a view request.
		expect(
			looksLikePanelViewRequest(
				"show me a panel showing goals and display my panels",
			),
		).toBe(false);
	});
});

describe("looksLikePanelViewRequest", () => {
	it("matches show-panels phrasings", () => {
		expect(looksLikePanelViewRequest("show my panels")).toBe(true);
		expect(looksLikePanelViewRequest("show panels")).toBe(true);
		expect(looksLikePanelViewRequest("display the panels")).toBe(true);
		expect(looksLikePanelViewRequest("list panels")).toBe(true);
		expect(looksLikePanelViewRequest("view my panels please")).toBe(true);
	});

	it("does not fire for create requests", () => {
		expect(looksLikePanelViewRequest("make a panel showing goals")).toBe(false);
		expect(looksLikePanelViewRequest("create a new panel")).toBe(false);
	});

	it("rejects unrelated chat", () => {
		expect(looksLikePanelViewRequest("show me the money")).toBe(false);
		expect(looksLikePanelViewRequest("what is a panel")).toBe(false);
	});
});

describe("formatPanelFreshness", () => {
	it("formats recent timestamps", () => {
		expect(formatPanelFreshness(NOW / 1000 - 30, NOW)).toBe("updated just now");
		expect(formatPanelFreshness(NOW / 1000 - 300, NOW)).toBe("updated 5m ago");
		expect(formatPanelFreshness(NOW / 1000 - 7200, NOW)).toBe("updated 2h ago");
		expect(formatPanelFreshness(NOW / 1000 - 3 * 86400, NOW)).toBe("updated 3d ago");
	});

	it("degrades gracefully for bad input", () => {
		expect(formatPanelFreshness(null, NOW)).toBe("freshness unknown");
		expect(formatPanelFreshness(undefined, NOW)).toBe("freshness unknown");
		expect(formatPanelFreshness(NaN, NOW)).toBe("freshness unknown");
		// Future timestamps never show negative durations.
		expect(formatPanelFreshness(NOW / 1000 + 3600, NOW)).toBe("updated just now");
	});
});

describe("formatPanelRowTime", () => {
	it("formats relative row times", () => {
		expect(formatPanelRowTime(NOW / 1000 - 90, NOW)).toBe("1m ago");
		expect(formatPanelRowTime(NOW / 1000 - 3600, NOW)).toBe("1h ago");
		expect(formatPanelRowTime(NOW / 1000 - 86400, NOW)).toBe("1d ago");
	});

	it("returns null when the row has no timestamp", () => {
		expect(formatPanelRowTime(null, NOW)).toBeNull();
		expect(formatPanelRowTime(undefined, NOW)).toBeNull();
		expect(formatPanelRowTime(NaN, NOW)).toBeNull();
	});

	it("never shows negative durations for future timestamps", () => {
		expect(formatPanelRowTime(NOW / 1000 + 3600, NOW)).toBe("just now");
	});
});

describe("labels", () => {
	it("labels sources", () => {
		expect(panelSourceLabel("approvals")).toBe("Approvals");
		expect(panelSourceLabel("goals")).toBe("Goals");
		expect(panelSourceLabel("reminders")).toBe("Reminders");
		expect(panelSourceLabel("memory")).toBe("Memory");
		expect(panelSourceLabel("feed")).toBe("Feed");
	});

	it("labels filters", () => {
		expect(panelFilterLabel("all")).toBe("all");
		expect(panelFilterLabel("pending")).toBe("pending");
		expect(panelFilterLabel("overdue")).toBe("overdue");
		expect(panelFilterLabel("due_soon")).toBe("due soon");
		expect(panelFilterLabel("stale")).toBe("stale");
		expect(panelFilterLabel("active")).toBe("active");
		expect(panelFilterLabel("completed")).toBe("completed");
		expect(panelFilterLabel("high_risk")).toBe("high risk");
	});

	it("labels sorts", () => {
		expect(panelSortLabel("newest")).toBe("newest first");
		expect(panelSortLabel("oldest")).toBe("oldest first");
	});

	it("passes unknown values through the default branch", () => {
		expect(
			panelSourceLabel("something-new" as CustomPanelSource),
		).toBe("something-new");
		expect(
			panelFilterLabel("something-new" as CustomPanelFilter),
		).toBe("something-new");
	});
});

describe("panelProposalSummary", () => {
	it("summarizes a filtered proposal", () => {
		const proposal: PanelProposal = {
			name: "My goals panel",
			source: "goals",
			filter: "overdue",
			sort: "newest",
			limit: 5,
			matched: ["goals", "overdue"],
		};
		expect(panelProposalSummary(proposal)).toBe(
			"Top 5 overdue goals, newest first",
		);
	});

	it("summarizes an unfiltered proposal and oldest sort", () => {
		const proposal: PanelProposal = {
			name: "Memory",
			source: "memory",
			filter: "all",
			sort: "oldest",
			limit: 3,
			matched: ["memory"],
		};
		expect(panelProposalSummary(proposal)).toBe(
			"Top 3 memory, oldest first",
		);
	});
});

describe("customPanelDefSummary", () => {
	it("summarizes a stored definition", () => {
		const def: CustomPanelDef = {
			id: "cpanel_abc",
			name: "Ops",
			source: "approvals",
			filter: "high_risk",
			sort: "oldest",
			limit: 8,
			fields: ["title", "detail", "timestamp"],
			created_at: 1,
			updated_at: 1,
		};
		expect(customPanelDefSummary(def)).toBe(
			"Approvals - high risk - up to 8, oldest first",
		);
	});
});
