import { createElement } from "react";
import { create, act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import type { ApprovalRequest } from "@/api/approvals";
import { BackgroundTaskPills } from "./BackgroundTaskPills";
import { pillLabelFor } from "./backgroundTaskPillLabel";
import { backgroundTaskPillsStyles } from "./BackgroundTaskPills.styles";
import { openApprovalsInbox } from "@/lib/approvalNotifications";
import { useApprovalsStore } from "@/stores/useApprovalsStore";

// Host components render as string-typed elements. findAllByProps matches
// both a stub composite and the host element it renders, so queries filter
// to composite instances (function type) to count each pill once.
// jest.requireActual is used instead of a bare require() per the
// no-require-imports rule.
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

function compositePills(tree: { root: ReactTestInstance }) {
	return tree.root
		.findAllByProps({ accessibilityRole: "button" })
		.filter((node) => typeof node.type !== "string");
}

function stubOf(displayName: string) {
	return (node: ReactTestInstance) =>
		typeof node.type !== "string" &&
		(node.type as { displayName?: string }).displayName === displayName;
}

jest.mock("expo-haptics", () => ({
	impactAsync: jest.fn().mockResolvedValue(undefined),
	ImpactFeedbackStyle: { Light: "light" },
}));

jest.mock("@/theme", () => ({
	useTheme: () => ({
		colors: {
			muted: "#111111",
			primary: "#00aaff",
			mutedForeground: "#888888",
		},
	}),
	typography: { micro: { fontSize: 11 } },
}));

jest.mock("@/components/icons", () => ({
	LoaderIcon: () => null,
}));

jest.mock("@/lib/approvalNotifications", () => ({
	openApprovalsInbox: jest.fn(),
}));

const mockOpenApprovalsInbox = openApprovalsInbox as jest.Mock;

function approvalFixture(
	overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
	return {
		id: "appr-1",
		action: { tool_name: "write_file", description: "Write a file" },
		reason: "test",
		action_preview: "",
		data_used_preview: [],
		model_used_preview: null,
		destination_preview: null,
		risk_label: "low",
		kind: "tool",
		requires_double_confirmation: false,
		status: "pending",
		deny_reason: null,
		created_at: "2026-10-11T00:00:00Z",
		decided_at: null,
		expires_at: null,
		thread_id: null,
		tool_call_id: null,
		execution_id: null,
		verification_status: null,
		...overrides,
	};
}

function renderPills(): ReactTestRenderer {
	let tree: ReactTestRenderer | null = null;
	act(() => {
		tree = create(createElement(BackgroundTaskPills));
	});
	if (!tree) throw new Error("render failed");
	return tree;
}

beforeEach(() => {
	useApprovalsStore.setState({ items: [] });
	mockOpenApprovalsInbox.mockClear();
});

describe("pillLabelFor", () => {
	it("formats tool name and activity", () => {
		expect(pillLabelFor(approvalFixture())).toBe(
			"write_file: awaiting approval",
		);
	});

	it("falls back to 'task' when the tool name is blank", () => {
		// Kills the mutant that drops the fallback and renders ": awaiting".
		const approval = approvalFixture({
			action: { tool_name: "   " },
		});
		expect(pillLabelFor(approval)).toBe("task: awaiting approval");
	});
});

describe("backgroundTaskPillsStyles", () => {
	it("applies the row layout classes", () => {
		expect(backgroundTaskPillsStyles.row({})).toBe(
			"flex-row gap-2 px-4 pb-2",
		);
	});

	it("applies the pill layout classes", () => {
		expect(backgroundTaskPillsStyles.pill({})).toBe(
			"flex-row items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full max-w-[240px]",
		);
	});
});

describe("BackgroundTaskPills", () => {
	it("renders nothing when there are no pending approvals", () => {
		const tree = renderPills();
		expect(tree.toJSON()).toBeNull();
	});

	it("renders a row (not null) when approvals are pending", () => {
		// Kills the mutants that force the empty guard true: an empty
		// store must render null, a non-empty store must render a row.
		useApprovalsStore.setState({ items: [approvalFixture()] });
		const tree = renderPills();
		const json = tree.toJSON() as { type: string } | null;
		expect(json).not.toBeNull();
		expect(json?.type).toBe("ScrollView");
	});

	it("renders one pill per pending approval", () => {
		useApprovalsStore.setState({
			items: [
				approvalFixture({ id: "a1", action: { tool_name: "write_file" } }),
				approvalFixture({ id: "a2", action: { tool_name: "run_cmd" } }),
			],
		});
		const tree = renderPills();
		const pills = compositePills(tree);
		expect(pills).toHaveLength(2);
		expect(pills[0].props.accessibilityLabel).toContain(
			"write_file: awaiting approval",
		);
		expect(pills[1].props.accessibilityLabel).toContain(
			"run_cmd: awaiting approval",
		);
	});

	it("hides the horizontal scroll indicator", () => {
		useApprovalsStore.setState({ items: [approvalFixture()] });
		const tree = renderPills();
		const row = tree.root.findAll(stubOf("ScrollView"))[0];
		expect(row.props.showsHorizontalScrollIndicator).toBe(false);
	});

	it("styles the pill with the muted background", () => {
		useApprovalsStore.setState({ items: [approvalFixture()] });
		const tree = renderPills();
		const pill = compositePills(tree)[0];
		expect(pill.props.style).toEqual({ backgroundColor: "#111111" });
	});

	it("styles the label with micro typography and the primary color", () => {
		useApprovalsStore.setState({ items: [approvalFixture()] });
		const tree = renderPills();
		const label = tree.root.findAll(stubOf("Text"))[0];
		expect(label.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#00aaff" },
		]);
	});

	it("opens the approvals inbox with the approval id on tap", () => {
		useApprovalsStore.setState({
			items: [approvalFixture({ id: "tap-me" })],
		});
		const tree = renderPills();
		const pill = compositePills(tree)[0];
		act(() => {
			(pill.props.onPress as () => void)();
		});
		expect(mockOpenApprovalsInbox).toHaveBeenCalledTimes(1);
		expect(mockOpenApprovalsInbox).toHaveBeenCalledWith("tap-me");
	});

	it("drops the pill when the approval is decided", () => {
		const pending = approvalFixture({ id: "decide-me" });
		useApprovalsStore.setState({ items: [pending] });
		const tree = renderPills();
		expect(
			compositePills(tree),
		).toHaveLength(1);

		// The store removes decided items; the pill must vanish with it.
		act(() => {
			useApprovalsStore.getState().upsert({ ...pending, status: "approved" });
		});
		expect(
			compositePills(tree),
		).toHaveLength(0);
	});
});
