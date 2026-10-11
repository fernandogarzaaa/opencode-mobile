import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { impactAsync } from "expo-haptics";
import type { PanelProposal } from "@/api/panels";
import { PanelProposalCard } from "./PanelProposalCard";

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
	},
}));

jest.mock("@/components/icons", () => ({
	LayersIcon: () => null,
	CheckIcon: () => null,
	XIcon: () => null,
}));

const proposal: PanelProposal = {
	name: "My goals panel",
	source: "goals",
	filter: "overdue",
	sort: "newest",
	limit: 5,
	matched: ["goals", "overdue"],
};

function pressables(root: ReactTestInstance) {
	return root.findAll((n) => n.type === "Pressable");
}

describe("PanelProposalCard", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("renders the proposal name and summary", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: () => {},
					onCancel: () => {},
				}),
			);
		});
		const t = tree!.root
			.findAll((n) => n.type === "Text")
			.map((n) => String(n.props.children ?? ""));
		expect(t).toContain("My goals panel");
		expect(t).toContain("Top 5 overdue goals, newest first");
		expect(t).toContain("Create this panel?");
	});

	it("confirm calls onConfirm with haptics", () => {
		const onConfirm = jest.fn();
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm,
					onCancel: () => {},
				}),
			);
		});
		const confirm = pressables(tree!.root).find((p) =>
			String(p.props.accessibilityLabel ?? "").startsWith("Confirm panel"),
		);
		expect(confirm).toBeDefined();
		act(() => {
			(confirm!.props.onPress as () => void)();
		});
		expect(onConfirm).toHaveBeenCalledTimes(1);
		expect(impactAsync).toHaveBeenCalled();
	});

	it("cancel calls onCancel", () => {
		const onCancel = jest.fn();
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: () => {},
					onCancel,
				}),
			);
		});
		const cancel = pressables(tree!.root).find(
			(p) => p.props.accessibilityLabel === "Cancel panel proposal",
		);
		expect(cancel).toBeDefined();
		act(() => {
			(cancel!.props.onPress as () => void)();
		});
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(impactAsync).toHaveBeenCalled();
	});

	it("uses the latest onConfirm after re-render", () => {
		const first = jest.fn();
		const second = jest.fn();
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: first,
					onCancel: () => {},
				}),
			);
		});
		act(() => {
			tree!.update(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: second,
					onCancel: () => {},
				}),
			);
		});
		const confirm = pressables(tree!.root).find((p) =>
			String(p.props.accessibilityLabel ?? "").startsWith("Confirm panel"),
		);
		act(() => {
			(confirm!.props.onPress as () => void)();
		});
		expect(second).toHaveBeenCalledTimes(1);
		expect(first).not.toHaveBeenCalled();
	});

	it("uses the latest onCancel after re-render", () => {
		const first = jest.fn();
		const second = jest.fn();
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: () => {},
					onCancel: first,
				}),
			);
		});
		act(() => {
			tree!.update(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: () => {},
					onCancel: second,
				}),
			);
		});
		const cancel = pressables(tree!.root).find(
			(p) => p.props.accessibilityLabel === "Cancel panel proposal",
		);
		act(() => {
			(cancel!.props.onPress as () => void)();
		});
		expect(second).toHaveBeenCalledTimes(1);
		expect(first).not.toHaveBeenCalled();
	});

	it("styles the header, name, and summary texts", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: () => {},
					onCancel: () => {},
				}),
			);
		});
		const textByContent = (content: string) =>
			tree!.root.findAll(
				(n) => n.type === "Text" && n.props.children === content,
			)[0];
		expect(textByContent("Create this panel?").props.style).toEqual([
			{ fontSize: 14 },
			{ color: "#ffffff" },
		]);
		expect(textByContent("My goals panel").props.style).toEqual([
			{ fontSize: 14 },
			{ color: "#ffffff" },
		]);
		const summary = tree!.root.findAll(
			(n) =>
				n.type === "Text" &&
				typeof n.props.children === "string" &&
				(n.props.children as string).includes("overdue"),
		)[0];
		expect(summary.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#888888" },
		]);
	});

	it("disables buttons and shows progress while confirming", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: () => {},
					onCancel: () => {},
					isConfirming: true,
				}),
			);
		});
		const buttons = pressables(tree!.root);
		expect(buttons.every((b) => b.props.disabled === true)).toBe(true);
		const t = tree!.root
			.findAll((n) => n.type === "Text")
			.map((n) => String(n.props.children ?? ""));
		expect(t).toContain("Creating...");
	});

	it("leaves the buttons enabled by default (isConfirming=false)", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: () => {},
					onCancel: () => {},
				}),
			);
		});
		const buttons = pressables(tree!.root);
		expect(buttons).toHaveLength(2);
		expect(buttons.every((b) => b.props.disabled === false)).toBe(true);
		const t = tree!.root
			.findAll((n) => n.type === "Text")
			.map((n) => String(n.props.children ?? ""));
		expect(t).toContain("Create panel");
	});

	it("applies the card container styles", () => {
		let tree: ReturnType<typeof create>;
		act(() => {
			tree = create(
				createElement(PanelProposalCard, {
					proposal,
					onConfirm: () => {},
					onCancel: () => {},
				}),
			);
		});
		const card = tree!.root.findAll(
			(n) =>
				typeof n.type === "string" &&
				n.props.accessibilityLabel === "Panel proposal",
		)[0];
		expect(card.props.style).toMatchObject({
			backgroundColor: "#0a0a0a",
			borderColor: "#222222",
			borderWidth: 1,
		});
	});
});
