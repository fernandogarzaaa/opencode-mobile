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

function setItems(items: ApprovalRequest[]) {
	act(() => {
		useApprovalsStore.setState({ items });
	});
}

beforeEach(() => {
	jest.clearAllMocks();
	setItems([]);
});

afterEach(() => {
	setItems([]);
});

describe("ActionButtons", () => {
	it("renders nothing when there are no pending approvals", () => {
		const tree = renderButtons();
		expect(tree.toJSON()).toBeNull();
	});

	it("renders one approve button per actionable approval", () => {
		setItems([
			approvalFixture({ id: "a1" }),
			approvalFixture({
				id: "a2",
				action: { tool_name: "shell", description: "Run tests" },
			}),
		]);
		const tree = renderButtons();
		const buttons = approveButtons(tree.root);
		expect(buttons).toHaveLength(2);
		expect(buttons[0].props.accessibilityLabel).toContain(
			"Write release notes",
		);
		expect(buttons[1].props.accessibilityLabel).toContain("Run tests");
	});

	it("skips blocked and expired approvals", () => {
		setItems([
			approvalFixture({ id: "ok" }),
			approvalFixture({ id: "blocked", risk_label: "blocked" }),
			approvalFixture({
				id: "expired",
				expires_at: "2020-01-01T00:00:00Z",
			}),
		]);
		const tree = renderButtons();
		expect(approveButtons(tree.root)).toHaveLength(1);
	});

	it("approves through the approval gate on tap", async () => {
		const approval = approvalFixture();
		setItems([approval]);
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
		setItems([approval]);
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
		setItems([approvalFixture({ id: "a1" }), approvalFixture({ id: "a2" })]);
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
		setItems([approval]);
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
		setItems([approval]);
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

	it("blocks a second tap while an approval is in flight", async () => {
		const approval = approvalFixture();
		setItems([approval]);
		let resolveApprove!: (v: ApprovalRequest) => void;
		mockApprove.mockImplementation(
			() =>
				new Promise<ApprovalRequest>((res) => {
					resolveApprove = res;
				}),
		);

		const tree = renderButtons();
		const [button] = approveButtons(tree.root);
		let first: Promise<void>, second: Promise<void>;
		act(() => {
			first = (button.props.onPress as () => Promise<void>)();
			second = (button.props.onPress as () => Promise<void>)();
		});
		resolveApprove(decidedFixture(approval));
		await act(async () => {
			await first;
			await second;
		});

		expect(mockApprove).toHaveBeenCalledTimes(1);
	});

	it("shows an inline error for a non-409 API failure without refetching", async () => {
		const approval = approvalFixture();
		setItems([approval]);
		mockApprove.mockRejectedValue(new ApiError("server error", 500));

		const tree = renderButtons();
		const [button] = approveButtons(tree.root);
		await act(async () => {
			await (button.props.onPress as () => Promise<void>)();
		});

		expect(mockListPending).not.toHaveBeenCalled();
		expect(approveButtons(tree.root)).toHaveLength(1);
	});

	it("drops the row when the 409 recovery refetch also fails", async () => {
		const approval = approvalFixture();
		setItems([approval]);
		mockApprove.mockRejectedValue(new ApiError("conflict", 409));
		mockListPending.mockRejectedValue(new Error("network down"));

		const tree = renderButtons();
		const [button] = approveButtons(tree.root);
		await act(async () => {
			await (button.props.onPress as () => Promise<void>)();
		});

		expect(useApprovalsStore.getState().items).toHaveLength(0);
		expect(approveButtons(tree.root)).toHaveLength(0);
	});

	it("clears the error and the busy state on a successful retry", async () => {
		const approval = approvalFixture();
		setItems([approval]);
		mockApprove.mockRejectedValueOnce(new Error("network down"));
		mockApprove.mockResolvedValue(decidedFixture(approval));

		const tree = renderButtons();
		let [button] = approveButtons(tree.root);
		await act(async () => {
			await (button.props.onPress as () => Promise<void>)();
		});
		// First attempt failed; the button is usable again.
		[button] = approveButtons(tree.root);
		await act(async () => {
			await (button.props.onPress as () => Promise<void>)();
		});

		expect(mockApprove).toHaveBeenCalledTimes(2);
		expect(approveButtons(tree.root)).toHaveLength(0);
	});

	it("keeps another item's confirm state when dismissing a row", async () => {
		const confirming = approvalFixture({
			id: "confirm-me",
			action: { tool_name: "delete", description: "Delete production DB" },
			requires_double_confirmation: true,
		});
		const other = approvalFixture({
			id: "other",
			action: { tool_name: "write", description: "Write release notes" },
		});
		setItems([confirming, other]);
		mockApprove.mockResolvedValue(decidedFixture(confirming));

		const tree = renderButtons();
		const [confirmButton] = approveButtons(tree.root).filter((n) =>
			String(n.props.accessibilityLabel).includes("Delete production DB"),
		);
		// Arm the double confirmation.
		await act(async () => {
			await (confirmButton.props.onPress as () => Promise<void>)();
		});
		// Dismiss the other row; the confirm state must survive.
		const [dismissOther] = dismissButtons(tree.root).filter((n) =>
			String(n.props.accessibilityLabel).includes("Write release notes"),
		);
		act(() => {
			(dismissOther.props.onPress as () => void)();
		});

		const [stillConfirming] = pressables(tree.root).filter((n) =>
			String(n.props.accessibilityLabel ?? "").startsWith(
				"Confirm approval:",
			),
		);
		expect(stillConfirming).toBeDefined();
		await act(async () => {
			await (stillConfirming.props.onPress as () => Promise<void>)();
		});
		expect(mockApprove).toHaveBeenCalledTimes(1);
		expect(mockApprove).toHaveBeenCalledWith("confirm-me");
	});

	it("still dismisses when haptics fails", async () => {
		const { impactAsync } = jest.requireMock("expo-haptics") as {
			impactAsync: jest.Mock;
		};
		impactAsync.mockRejectedValueOnce(new Error("haptics down"));
		setItems([approvalFixture()]);

		const tree = renderButtons();
		const [dismiss] = dismissButtons(tree.root);
		await act(async () => {
			await (dismiss.props.onPress as () => void)();
		});

		expect(approveButtons(tree.root)).toHaveLength(0);
	});
});
