import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { Panel } from "@/api/panels";
import { PanelCard } from "./PanelCard";

jest.mock("react-native", () => {
	const React = jest.requireActual("react") as typeof import("react");
	const stub = (name: string) => {
		const Stub = (props: { children?: unknown; [key: string]: unknown }) =>
			React.createElement(name, props, props.children as never);
		Stub.displayName = name;
		return Stub;
	};
	return {
		View: stub("View"),
		Text: stub("Text"),
		Pressable: stub("Pressable"),
		ScrollView: stub("ScrollView"),
		StyleSheet: { create: (s: unknown) => s },
	};
});

jest.mock("@/theme", () => ({
	useTheme: () => ({
		colors: {
			primary: "#00aaff",
			primaryForeground: "#ffffff",
			muted: "#111111",
			mutedForeground: "#888888",
			background: "#000000",
			foreground: "#ffffff",
			card: "#0a0a0a",
			border: "#222222",
			destructive: "#ff0000",
		},
		isDark: true,
	}),
	typography: {
		micro: { fontSize: 11 },
		uiLabel: { fontSize: 14 },
		h2: { fontSize: 18 },
	},
}));

jest.mock("@/components/icons", () => ({
	LayersIcon: () => null,
}));

const NOW_MS = 1_700_000_000_000;

function panelFixture(overrides: Partial<Panel> = {}): Panel {
	return {
		id: "approvals",
		title: "Approvals",
		headline: "2 approvals waiting for your decision.",
		tiles: [
			{ label: "Pending", value: "2" },
			{ label: "High risk", value: "1" },
		],
		rows: [
			{
				title: "Deploy to prod",
				detail: "high risk",
				timestamp: NOW_MS / 1000 - 300,
			},
			{ title: "Send invoice", detail: "medium risk", timestamp: null },
		],
		generated_at: NOW_MS / 1000 - 60,
		empty: false,
		...overrides,
	};
}

function texts(root: ReactTestInstance): string[] {
	return root
		.findAll((n) => n.type === "Text")
		.map((n) => String(n.props.children ?? ""))
		.filter((t) => t.length > 0);
}

describe("PanelCard", () => {
	it("renders title, headline, tiles, rows, and freshness", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelCard, { panel: panelFixture(), nowMs: NOW_MS }),
			);
		});
		const t = texts(tree!.root);
		expect(t).toContain("Approvals");
		expect(t).toContain("2 approvals waiting for your decision.");
		expect(t).toContain("2");
		expect(t).toContain("Pending");
		expect(t).toContain("Deploy to prod");
		expect(t).toContain("high risk");
		expect(t).toContain("updated 1m ago");
	});

	it("renders the empty state honestly when the panel is empty", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(
					PanelCard,
					{
						panel: panelFixture({
							headline: "No goals yet. Create one to start tracking an outcome.",
							tiles: [],
							rows: [],
							empty: true,
						}),
						nowMs: NOW_MS,
					},
				),
			);
		});
		const t = texts(tree!.root);
		expect(t).toContain(
			"No goals yet. Create one to start tracking an outcome.",
		);
		expect(t).toContain("No data to show yet.");
		// No tiles section when there are no tiles.
		expect(
			tree!.root.findAll(
				(n) => n.props.accessibilityLabel === "Panel stats",
			),
		).toHaveLength(0);
	});

	it("omits the time line for rows without timestamps", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelCard, { panel: panelFixture(), nowMs: NOW_MS }),
			);
		});
		const row = tree!.root.findAll(
			(n) =>
				typeof n.type === "string" &&
				n.props.accessibilityLabel === "Panel row: Send invoice",
		);
		expect(row).toHaveLength(1);
		// The timeless row renders title + detail but no time text.
		const rowTexts = row[0]
			.findAll((n) => n.type === "Text")
			.map((n) => String(n.props.children ?? ""));
		expect(rowTexts).toContain("Send invoice");
		expect(rowTexts).toContain("medium risk");
		expect(rowTexts.some((x) => /ago|just now/.test(x))).toBe(false);
	});

	it("exposes an accessibility label for the panel", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelCard, { panel: panelFixture(), nowMs: NOW_MS }),
			);
		});
		expect(
			tree!.root.findAll(
				(n) => n.props.accessibilityLabel === "Panel: Approvals",
			).length,
		).toBeGreaterThan(0);
	});

	it("tolerates missing tiles and rows keys", () => {
		const panel = panelFixture();
		delete (panel as Partial<Panel>).tiles;
		delete (panel as Partial<Panel>).rows;
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(createElement(PanelCard, { panel, nowMs: NOW_MS }));
		});
		// Falls back to []: no tiles section, no rows, no crash.
		expect(
			tree!.root.findAll(
				(n) => n.props.accessibilityLabel === "Panel stats",
			),
		).toHaveLength(0);
		expect(
			tree!.root.findAll(
				(n) =>
					typeof n.props.accessibilityLabel === "string" &&
					n.props.accessibilityLabel.startsWith("Panel row:"),
			),
		).toHaveLength(0);
		const t = texts(tree!.root);
		expect(t).toContain("2 approvals waiting for your decision.");
	});

	it("skips the tiles section when tiles are empty but the panel is not", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(
					PanelCard,
					{
						panel: panelFixture({ tiles: [], empty: false }),
						nowMs: NOW_MS,
					},
				),
			);
		});
		expect(
			tree!.root.findAll(
				(n) => n.props.accessibilityLabel === "Panel stats",
			),
		).toHaveLength(0);
		// Rows still render.
		expect(
			tree!.root.findAll(
				(n) =>
					typeof n.type === "string" &&
					n.props.accessibilityLabel === "Panel row: Deploy to prod",
			),
		).toHaveLength(1);
	});

	it("applies the card container styles", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelCard, { panel: panelFixture(), nowMs: NOW_MS }),
			);
		});
		const card = tree!.root.findAll(
			(n) =>
				typeof n.type === "string" &&
				n.props.accessibilityLabel === "Panel: Approvals",
		)[0];
		expect(card.props.style).toMatchObject({
			backgroundColor: "#0a0a0a",
			borderColor: "#222222",
			borderWidth: 1,
		});
	});

	it("labels the headline with its exact text", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelCard, { panel: panelFixture(), nowMs: NOW_MS }),
			);
		});
		const headline = tree!.root.findAll(
			(n) =>
				n.props.accessibilityLabel ===
				"Panel headline: 2 approvals waiting for your decision.",
		);
		expect(headline.length).toBeGreaterThan(0);
	});

	it("styles the title, freshness, headline, and empty-state texts", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelCard, { panel: panelFixture(), nowMs: NOW_MS }),
			);
		});
		const textByContent = (content: string) =>
			tree!.root.findAll(
				(n) => n.type === "Text" && n.props.children === content,
			)[0];
		// Title (L48) and headline (L60): uiLabel + foreground.
		expect(textByContent("Approvals").props.style).toEqual([
			{ fontSize: 14 },
			{ color: "#ffffff" },
		]);
		expect(
			textByContent("2 approvals waiting for your decision.").props.style,
		).toEqual([{ fontSize: 14 }, { color: "#ffffff" }]);
		// Freshness (L54): micro + mutedForeground.
		const freshness = tree!.root.findAll(
			(n) =>
				n.type === "Text" &&
				typeof n.props.children === "string" &&
				(n.props.children as string).startsWith("updated "),
		)[0];
		expect(freshness.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#888888" },
		]);

		let emptyTree: ReturnType<typeof create>;
		act(() => {
			emptyTree = create(
				createElement(
					PanelCard,
					{ panel: panelFixture({ empty: true }), nowMs: NOW_MS },
				),
			);
		});
		// Empty state (L68): micro + mutedForeground.
		const emptyText = emptyTree!.root.findAll(
			(n) => n.type === "Text" && n.props.children === "No data to show yet.",
		)[0];
		expect(emptyText.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#888888" },
		]);
	});
});
