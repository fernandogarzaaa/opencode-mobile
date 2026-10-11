import { apiDelete, apiGet, apiPost } from "../lib/httpClient";

/**
 * Client for the node's glanceable data panels (Hark backlog item 2).
 *
 * Node half: fernandogarzaaa/SHADOW-AI#86 (GET /panels) and #88
 * (custom panels: POST /custom-panels/parse, CRUD /custom-panels).
 *
 * One JSON shape for every panel the client renders as a glanceable card:
 * a header row (title), one headline insight sentence, stat tiles (label +
 * large number), then compact rows with timestamps. The headline is the
 * value; the tiles and rows are the receipts.
 *
 * Endpoint contract (apps/shadow-node/shadow_node/main.py):
 * - GET /panels                        -> Panel[]
 * - POST /custom-panels/parse          {text} -> parse result
 * - GET /custom-panels                 -> CustomPanelDef[]
 * - POST /custom-panels                CustomPanelDef -> CustomPanelDef (201)
 * - GET /custom-panels/{id}/render     -> Panel
 * - DELETE /custom-panels/{id}         {confirm: true} -> {deleted}
 */

export interface PanelTile {
	label: string;
	value: string;
}

export interface PanelRow {
	title: string;
	detail: string;
	/** Epoch seconds; null when the row has no timestamp. */
	timestamp: number | null;
}

export interface Panel {
	id: string;
	title: string;
	headline: string;
	tiles: PanelTile[];
	rows: PanelRow[];
	/** Epoch seconds; the client uses this for freshness + caching. */
	generated_at: number;
	empty: boolean;
}

export const CUSTOM_PANEL_SOURCES = [
	"approvals",
	"goals",
	"reminders",
	"memory",
	"feed",
] as const;

export type CustomPanelSource = (typeof CUSTOM_PANEL_SOURCES)[number];

export const CUSTOM_PANEL_FILTERS = [
	"all",
	"pending",
	"overdue",
	"due_soon",
	"stale",
	"active",
	"completed",
	"high_risk",
] as const;

export type CustomPanelFilter = (typeof CUSTOM_PANEL_FILTERS)[number];

export const CUSTOM_PANEL_SORTS = ["newest", "oldest"] as const;

export type CustomPanelSort = (typeof CUSTOM_PANEL_SORTS)[number];

export interface CustomPanelDef {
	id: string;
	name: string;
	source: CustomPanelSource;
	filter: CustomPanelFilter;
	sort: CustomPanelSort;
	limit: number;
	fields: string[];
	created_at: number;
	updated_at: number;
}

export interface CustomPanelCreate {
	name: string;
	source: CustomPanelSource;
	filter?: CustomPanelFilter;
	sort?: CustomPanelSort;
	limit?: number;
	fields?: string[];
}

export interface PanelProposal {
	name: string;
	source: CustomPanelSource;
	filter: CustomPanelFilter;
	sort: CustomPanelSort;
	limit: number;
	/** The node-reported tokens that matched, for transparency. */
	matched: string[];
}

export type PanelParseStatus = "proposal" | "needs_clarification";

export interface PanelParseResult {
	status: PanelParseStatus;
	proposal: PanelProposal | null;
	question: string | null;
	options: string[];
}

/** How long GET /panels results stay fresh in the client cache. */
export const PANELS_CACHE_TTL_MS = 60_000;

/**
 * Tiny TTL cache for the built-in panels list. The node stamps every
 * panel with generated_at; the client avoids hammering the node by
 * reusing a fresh list instead of refetching on every render.
 */
export class PanelsCache {
	private cached: Panel[] | null = null;
	private fetchedAtMs = 0;

	get(nowMs: number = Date.now()): Panel[] | null {
		if (nowMs - this.fetchedAtMs > PANELS_CACHE_TTL_MS) return null;
		return this.cached;
	}

	set(panels: Panel[], nowMs: number = Date.now()): void {
		this.cached = panels;
		this.fetchedAtMs = nowMs;
	}

	clear(): void {
		this.cached = null;
		this.fetchedAtMs = 0;
	}
}

const panelsCache = new PanelsCache();

export const panelsApi = {
	/**
	 * Built-in glanceable panels. Uses the TTL cache; pass
	 * {refresh: true} to force a node round-trip.
	 */
	async listPanels(opts?: { refresh?: boolean }): Promise<Panel[]> {
		if (!opts?.refresh) {
			const cached = panelsCache.get();
			if (cached) return cached;
		}
		const panels = await apiGet<Panel[]>("/panels");
		panelsCache.set(panels);
		return panels;
	},

	/** Parse "make a panel showing my top 5 overdue goals" into a proposal. */
	async parse(text: string): Promise<PanelParseResult> {
		return apiPost<PanelParseResult>("/custom-panels/parse", { text });
	},

	/** All custom panel definitions (inspectable: the definition is the panel). */
	async listCustom(): Promise<CustomPanelDef[]> {
		return apiGet<CustomPanelDef[]>("/custom-panels");
	},

	/** Create a custom panel from a definition or a confirmed parse proposal. */
	async createCustom(def: CustomPanelCreate): Promise<CustomPanelDef> {
		const created = await apiPost<CustomPanelDef>("/custom-panels", def);
		panelsCache.clear();
		return created;
	},

	/** Render one custom panel as panel JSON (same shape as built-ins). */
	async renderCustom(panelId: string): Promise<Panel> {
		return apiGet<Panel>(`/custom-panels/${panelId}/render`);
	},

	/**
	 * Delete a custom panel. Irreversible on the node: it requires
	 * explicit confirm=true, so this client always sends it.
	 */
	async deleteCustom(panelId: string): Promise<void> {
		await apiDelete<{ deleted: string }>(`/custom-panels/${panelId}`, {
			confirm: true,
		});
		panelsCache.clear();
	},

	/** Test seam: drop the cached panels list. */
	clearCache(): void {
		panelsCache.clear();
	},
};
