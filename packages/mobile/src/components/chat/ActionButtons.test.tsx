import { createElement } from "react";
import {
	create,
	act,
	type ReactTestInstance,
} from "react-test-renderer";
import type { ApprovalRequest } from "@/api/approvals";
import { approvalsApi } from "@/api/approvals";
import { ApiError } from "@/lib/httpClient";
import { useApprovalsStore } from "@/stores/useApprovalsStore";
import { ActionButtons } from "./ActionButtons";

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
		Animated: { View: stub("Animated.View") },
	};
});

jest.mock("expo-haptics", () => ({
	impactAsync: jest.fn().mockResolvedValue(undefined),
	notificationAsync: jest.fn().mockResolvedValue(undefined),
	ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
	NotificationFeedbackType: { Success: "success", Error: "error" },
}));

jest.mock("@/theme", () => {
	const proxy = new Proxy(
		{},
		{ get: (_t, k) => (typeof k === "string" ? Number(k) || 0 : 0) },
	);
	return {
		useTheme: () => ({
			colors: {
				primary: "#00aaff",
				primaryForeground: "#ffffff",
				muted: "#111111",
				mutedForeground: "#888888",
				background: "#000000",
				foreground: "#ffffff",
				destructive: "#ff0000",
				warning: "#ffaa00",
				success: "#00ff00",
			},
			isDark: true,
		}),
		typography: { micro: { fontSize: 11 }, uiLabel: { fontSize: 14 } },
		fontStyle: () => ({}),
		Radius: proxy,
		Spacing: proxy,
	};
});

jest.mock("@/components/icons", () => ({
	CheckIcon: () => null,
	XIcon: () => null,
}));

jest.mock("@/utils/colors", () => ({
	withOpacity: (c: string) => c,
	OPACITY: {},
}));

jest.mock("@/api/approvals", () => ({
	approvalsApi: {
		approve: jest.fn(),
		listPending: jest.fn(),
	},
}));

jest.mock("@/lib/httpClient", () => {
	class MockApiError extends Error {
		status: number;
		constructor(message: string, status: number) {
			super(message);
			this.name = "ApiError";
			this.status = status;
		}
	}
	return { ApiError: MockApiError };
});

const mockApprove = approvalsApi.approve as jest.Mock;
const mockListPending = approvalsApi.listPending as jest.Mock;

function approvalFixture(
	overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
	return {
		id: "appr-1",
		action: { tool_name: "write_file", description: "Write release notes" },
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
		created_at: "2026-10-11T11:59:00Z",
		decided_at: null,
		expires_at: null,
		thread_id: null,
		tool_call_id: null,
		execution_id: null,
		verification_status: null,
		...overrides,
	};
}

function decidedFixture(a: ApprovalRequest): ApprovalRequest {
	return { ...a, status: "approved", decided_at: "2026-10-11T12:00:00Z" };
}

function renderButtons() {
	let tree: ReturnType<typeof create> | undefined;
	act(() => {
		tree = create(createElement(ActionButtons));
	});
	return tree!;
}

/** Composite Pressable nodes only (skip the host stubs they render). */
function pressables(root: ReactTestInstance) {
	return root
		.findAllByProps({ accessibilityRole: "button" })
		.filter((n) => typeof n.type !== "string");
}

function approveButtons(root: ReactTestInstance) {
	return pressables(root).filter((n) =>
		String(n.props.accessibilityLabel ?? "").startsWith("Approve:"),
	);
}

function dismissButtons(root: ReactTestInstance) {
	return pressables(root).filter((n) =>
		String(n.props.accessibilityLabel ?? "").startsWith("Dismiss:"),
	);
}

beforeEach(() => {
	jest.clearAllMocks();
	useApprovalsStore.setState({ items: [] });
});

afterEach(() => {
	useApprovalsStore.setState({ items: [] });
});

describe("ActionButtons", () => {
	it("renders nothing when there are no pending approvals", () => {
		const tree = renderButtons();
		expect(tree.toJSON()).toBeNull();
	});

	it("renders one approve button per actionable approval", () => {
		useApprovalsStore.setState({
			items: [
				approvalFixture({ id: "a1" }),
				approvalFixture({
					id: "a2",
					action: { tool_name: "shell", description: "Run tests" },
				}),
			],
		});
		const tree = renderButtons();
		const buttons = approveButtons(tree.root);
		expect(buttons).toHaveLength(2);
		expect(buttons[0].props.accessibilityLabel).toContain(
			"Write release notes",
		);
		expect(buttons[1].props.accessibilityLabel).toContain("Run tests");
	});

	it("skips blocked and expired approvals", () => {
		useApprovalsStore.setState({
			items: [
				approvalFixture({ id: "ok" }),
				approvalFixture({ id: "blocked", risk_label: "blocked" }),
				approvalFixture({
					id: "expired",
					expires_at: "2020-01-01T00:00:00Z",
				}),
			],
		});
		const tree = renderButtons();
		expect(approveButtons(tree.root)).toHaveLength(1);
	});

	it("approves through the approval gate on tap", async () => {
		const approval = approvalFixture();
		useApprovalsStore.setState({ items: [approval] });
		mockApprove.mockResolvedValue(decidedFixture(approval));

		const tree = renderButtons();
		const [button] = approveButtons(tree.root);
		await act(async () => {
			await (button.props.onPress as () => Promise<void>)();
		});

		expect(mockApprove).toHaveBeenCalledTimes(1);
		expect(mockApprove).toHaveBeenCalledWith("appr-1");
		// Decided items leave the store, so the row disappears.
		expect(approveButtons(tree.root)).toHaveLength(0);
	});

	it("asks for a second tap when double confirmation is required", async () => {
		const approval = approvalFixture({
			id: "danger",
			requires_double_confirmation: true,
			risk_label: "high",
		});
		useApprovalsStore.setState({ items: [approval] });
		mockApprove.mockResolvedValue(decidedFixture(approval));

		const tree = renderButtons();
		let [button] = approveButtons(tree.root);

		await act(async () => {
			await (button.props.onPress as () => Promise<void>)();
		});
		// First tap arms confirmation instead of approving.
		expect(mockApprove).not.toHaveBeenCalled();
		[button] = pressables(tree.root).filter((n) =>
			String(n.props.accessibilityLabel ?? "").startsWith(
				"Confirm approval:",
			),
		);
		expect(button).toBeDefined();

		await act(async () => {
			await (button.props.onPress as () => Promise<void>)();
		});
		expect(mockApprove).toHaveBeenCalledTimes(1);
		expect(mockApprove).toHaveBeenCalledWith("danger");
	});

	it("dismisses a single row without touching the approval", () => {
		useApprovalsStore.setState({
			items: [
				approvalFixture({ id: "a1" }),
				approvalFixture({ id: "a2" }),
			],
		});
		const tree = renderButtons();
		expect(approveButtons(tree.root)).toHaveLength(2);

		const [dismiss] = dismissButtons(tree.root).filter((n) =>
			String(n.props.accessibilityLabel).includes("Write release notes"),
		);
		act(() => {
			(dismiss.props.onPress as () => void)();
		});

		expect(approveButtons(tree.root)).toHaveLength(1);
		expect(mockApprove).not.toHaveBeenCalled();
		// The approval itself is untouched in the store.
		expect(useApprovalsStore.getState().items).toHaveLength(2);
	});

	it("refetches the pending list when the decision raced (409)", async () => {
		const approval = approvalFixture();
		useApprovalsStore.setState({ items: [approval] });
		mockApprove.mockRejectedValue(new ApiError("conflict", 409));
		mockListPending.mockResolvedValue({ items: [], count: 0, next_cursor: null });

		const tree = renderButtons();
		const [button] = approveButtons(tree.root);
		await act(async () => {
			await (button.props.onPress as () => Promise<void>)();
		});

		expect(mockListPending).toHaveBeenCalledTimes(1);
		expect(approveButtons(tree.root)).toHaveLength(0);
	});

	it("shows an inline error when approval fails", async () => {
		const approval = approvalFixture();
		useApprovalsStore.setState({ items: [approval] });
		mockApprove.mockRejectedValue(new Error("network down"));

		const tree = renderButtons();
		const [button] = approveButtons(tree.root);
		await act(async () => {
			await (button.props.onPress as () => Promise<void>)();
		});

		const texts = tree.root
			.findAllByType("Text" as never)
			.map((n) =>
				Array.isArray(n.props.children)
					? (n.props.children as unknown[]).join("")
					: String(n.props.children ?? ""),
			);
		expect(texts.some((t) => t.includes("Approval failed"))).toBe(true);
		// The button stays so the user can retry.
		expect(approveButtons(tree.root)).toHaveLength(1);
	});
});
