import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { impactAsync } from "expo-haptics";
import type { Panel } from "@/api/panels";
import { PanelViewer } from "./PanelViewer";

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

jest.mock("expo-haptics", () => ({
	impactAsync: jest.fn().mockResolvedValue(undefined),
	ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

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
	XIcon: () => null,
}));

function panelFixture(id: string, title: string): Panel {
	return {
		id,
		title,
		headline: `${title} headline.`,
		tiles: [],
		rows: [],
		generated_at: 1700000000,
		empty: true,
	};
}

function renderViewer(props: Partial<React.ComponentProps<typeof PanelViewer>> = {}) {
	let tree: ReturnType<typeof create> | undefined;
	act(() => {
		tree = create(
			createElement(PanelViewer, {
				title: "Panels",
				panels: [],
				onDismiss: () => {},
				...props,
			}),
		);
	});
	return tree!.root;
}

describe("PanelViewer", () => {
	it("renders the title and one card per panel", () => {
		const root = renderViewer({
			panels: [panelFixture("a", "Approvals"), panelFixture("g", "Goals")],
		});
		// Host elements only: each stub renders a composite plus a host node.
		const cards = root.findAll(
			(n) =>
				typeof n.type === "string" &&
				(n.props.accessibilityLabel === "Panel: Approvals" ||
					n.props.accessibilityLabel === "Panel: Goals"),
		);
		expect(cards).toHaveLength(2);
		const titles = root
			.findAll((n) => n.type === "Text")
			.map((n) => String(n.props.children ?? ""));
		expect(titles).toContain("Panels");
	});

	it("shows the loading state", () => {
		const root = renderViewer({ isLoading: true });
		const titles = root
			.findAll((n) => n.type === "Text")
			.map((n) => String(n.props.children ?? ""));
		expect(titles).toContain("Loading panels...");
	});

	it("shows the error state", () => {
		const root = renderViewer({ error: "Node unreachable" });
		const titles = root
			.findAll((n) => n.type === "Text")
			.map((n) => String(n.props.children ?? ""));
		expect(titles).toContain("Node unreachable");
	});

	it("shows the empty state with a creation hint", () => {
		const root = renderViewer({ panels: [] });
		const titles = root
			.findAll((n) => n.type === "Text")
			.map((n) => String(n.props.children ?? ""));
		expect(
			titles.some((t) => t.includes("make a panel")),
		).toBe(true);
	});

	it("dismiss calls onDismiss", () => {
		const onDismiss = jest.fn();
		const root = renderViewer({ onDismiss });
		const dismiss = root.findAll(
			(n) =>
				typeof n.type === "string" &&
				n.props.accessibilityLabel === "Dismiss panels",
		);
		expect(dismiss).toHaveLength(1);
		act(() => {
			(dismiss[0].props.onPress as () => void)();
		});
		expect(onDismiss).toHaveBeenCalledTimes(1);
		expect(impactAsync).toHaveBeenCalled();
	});

	it("uses the latest onDismiss after re-render", () => {
		const first = jest.fn();
		const second = jest.fn();
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelViewer, {
					title: "Panels",
					panels: [],
					onDismiss: first,
				}),
			);
		});
		act(() => {
			tree!.update(
				createElement(PanelViewer, {
					title: "Panels",
					panels: [],
					onDismiss: second,
				}),
			);
		});
		const dismiss = tree!.root.findAll(
			(n) =>
				typeof n.type === "string" &&
				n.props.accessibilityLabel === "Dismiss panels",
		)[0];
		act(() => {
			(dismiss.props.onPress as () => void)();
		});
		expect(second).toHaveBeenCalledTimes(1);
		expect(first).not.toHaveBeenCalled();
	});

	it("styles the header, title, and state texts", () => {
		const root = renderViewer();
		const header = root.findAll(
			(n) =>
				typeof n.type === "string" &&
				typeof n.props.style === "object" &&
				n.props.style !== null &&
				(n.props.style as { borderBottomWidth?: number })
					.borderBottomWidth === 1,
		)[0];
		expect(header.props.style).toEqual({
			borderBottomWidth: 1,
			borderBottomColor: "#222222",
		});
		const title = root.findAll(
			(n) => n.type === "Text" && n.props.children === "Panels",
		)[0];
		expect(title.props.style).toEqual([
			{ fontSize: 14 },
			{ color: "#ffffff" },
		]);

		const loadingRoot = renderViewer({ isLoading: true });
		const loading = loadingRoot.findAll(
			(n) => n.type === "Text" && n.props.children === "Loading panels...",
		)[0];
		expect(loading.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#888888" },
		]);

		const errorRoot = renderViewer({ error: "Node is unreachable" });
		const errorText = errorRoot.findAll(
			(n) => n.type === "Text" && n.props.children === "Node is unreachable",
		)[0];
		expect(errorText.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#ff0000" },
		]);

		const emptyRoot = renderViewer({ panels: [] });
		const emptyText = emptyRoot.findAll(
			(n) =>
				n.type === "Text" &&
				typeof n.props.children === "string" &&
				(n.props.children as string).includes("No panels yet"),
		)[0];
		expect(emptyText.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#888888" },
		]);
	});

	it("applies the viewer container styles", () => {
		expect(PanelViewer.displayName).toBe("PanelViewer");
		const root = renderViewer();
		const container = root.findAll(
			(n) =>
				typeof n.type === "string" &&
				n.props.accessibilityLabel === "Panel viewer",
		)[0];
		expect(container.props.style).toMatchObject({
			backgroundColor: "#000000",
			borderColor: "#222222",
			maxHeight: 420,
		});
	});
});
