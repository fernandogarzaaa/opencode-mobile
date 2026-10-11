import type {
	CustomPanelDef,
	CustomPanelFilter,
	CustomPanelSort,
	CustomPanelSource,
	PanelProposal,
} from "../api/panels";

/**
 * Pure helpers for the glanceable data panels surface (Hark backlog item 2).
 * No React, no network: safe to unit test and to run through the
 * mutation gate.
 */

/**
 * Cheap client-side trigger: does this chat message look like a request
 * to CREATE a panel, worth sending to POST /custom-panels/parse? The
 * node parser is the source of truth and rejects anything it cannot
 * parse deterministically; this only decides whether to try.
 */
export function looksLikePanelCreateRequest(text: string): boolean {
	return (
		/\b(create|make|build|add)\b[\s\S]{0,40}\bpanels?\b/i.test(text) ||
		/\bpanels?\b[\s\S]{0,40}\bshowing\b/i.test(text)
	);
}

/**
 * Cheap client-side trigger: does this chat message ask to VIEW the
 * panels? Handled locally with GET /panels (cached); the node is only
 * hit when the cache is stale.
 */
export function looksLikePanelViewRequest(text: string): boolean {
	if (looksLikePanelCreateRequest(text)) return false;
	return /\b(show|display|view|list)\b[\s\S]{0,40}\bpanels?\b/i.test(text);
}

function relativeTime(diffMs: number): string {
	if (diffMs < 60_000) return "just now";
	const diffMin = Math.floor(diffMs / 60_000);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHrs = Math.floor(diffMin / 60);
	if (diffHrs < 24) return `${diffHrs}h ago`;
	const diffDays = Math.floor(diffHrs / 24);
	return `${diffDays}d ago`;
}

/**
 * Freshness line for a panel card, from the node's generated_at
 * (epoch seconds). Future or missing timestamps degrade gracefully.
 *
 * Note: Number.isFinite alone rejects null, undefined, and NaN without
 * coercion, so a single guard covers every bad input.
 */
export function formatPanelFreshness(
	generatedAtSec: number | null | undefined,
	nowMs: number = Date.now(),
): string {
	if (!Number.isFinite(generatedAtSec)) {
		return "freshness unknown";
	}
	// relativeTime clamps anything under a minute (including future
	// timestamps) to "just now", so no separate future branch is needed.
	const diffMs = nowMs - (generatedAtSec as number) * 1000;
	return `updated ${relativeTime(diffMs)}`;
}

/**
 * Relative timestamp for a panel row. Rows without timestamps render
 * no time line, so this returns null for them.
 */
export function formatPanelRowTime(
	timestampSec: number | null | undefined,
	nowMs: number = Date.now(),
): string | null {
	if (!Number.isFinite(timestampSec)) {
		return null;
	}
	// relativeTime clamps anything under a minute (including future
	// timestamps) to "just now", so no separate future branch is needed.
	const diffMs = nowMs - (timestampSec as number) * 1000;
	return relativeTime(diffMs);
}

/** Human label for a custom panel data source. */
export function panelSourceLabel(source: CustomPanelSource): string {
	switch (source) {
		case "approvals":
			return "Approvals";
		case "goals":
			return "Goals";
		case "reminders":
			return "Reminders";
		case "memory":
			return "Memory";
		case "feed":
			return "Feed";
		default:
			return source;
	}
}

/** Human label for a custom panel filter. */
export function panelFilterLabel(filter: CustomPanelFilter): string {
	// Only filters whose label differs from the raw value need a case;
	// the default returns the value unchanged.
	switch (filter) {
		case "due_soon":
			return "due soon";
		case "high_risk":
			return "high risk";
		default:
			return filter;
	}
}

/** Human label for a custom panel sort. */
export function panelSortLabel(sort: CustomPanelSort): string {
	return sort === "oldest" ? "oldest first" : "newest first";
}

/**
 * One-line summary of a parse proposal for the confirm card, e.g.
 * "Top 5 overdue goals, newest first".
 */
export function panelProposalSummary(proposal: PanelProposal): string {
	const sourceName = panelSourceLabel(proposal.source).toLowerCase();
	const filterPart =
		proposal.filter === "all"
			? sourceName
			: `${panelFilterLabel(proposal.filter)} ${sourceName}`;
	return `Top ${proposal.limit} ${filterPart}, ${panelSortLabel(proposal.sort)}`;
}

/**
 * One-line summary of a stored custom panel definition for the Panels
 * settings screen, e.g. "Goals - overdue - up to 5, newest first".
 */
export function customPanelDefSummary(def: CustomPanelDef): string {
	return (
		`${panelSourceLabel(def.source)} - ${panelFilterLabel(def.filter)} - ` +
		`up to ${def.limit}, ${panelSortLabel(def.sort)}`
	);
}
