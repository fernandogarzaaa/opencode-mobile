import type { ApprovalRequest } from "@/api/approvals";
import {
	actionLabelFor,
	isActionable,
	riskTier,
} from "./actionButtonLogic";

const NOW = Date.parse("2026-10-11T12:00:00Z");

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

describe("actionLabelFor", () => {
	it("prefers the node description over the tool name", () => {
		expect(actionLabelFor(approvalFixture())).toBe("Write release notes");
	});

	it("falls back to the tool name when there is no description", () => {
		const a = approvalFixture({
			action: { tool_name: "shell_exec" },
		});
		expect(actionLabelFor(a)).toBe("shell_exec");
	});

	it("trims whitespace", () => {
		const a = approvalFixture({
			action: { tool_name: "x", description: "  padded  " },
		});
		expect(actionLabelFor(a)).toBe("padded");
	});

	it("truncates long labels with an ellipsis", () => {
		const long = "a".repeat(100);
		const a = approvalFixture({
			action: { tool_name: "x", description: long },
		});
		const label = actionLabelFor(a);
		expect(label.length).toBeLessThanOrEqual(48);
		expect(label.endsWith("...")).toBe(true);
	});

	it("keeps labels at exactly the limit intact", () => {
		const exact = "b".repeat(48);
		const a = approvalFixture({
			action: { tool_name: "x", description: exact },
		});
		expect(actionLabelFor(a)).toBe(exact);
	});
});

describe("isActionable", () => {
	it("accepts a plain pending approval", () => {
		expect(isActionable(approvalFixture(), NOW)).toBe(true);
	});

	it("rejects non-pending statuses", () => {
		for (const status of ["approved", "denied", "expired", "consumed"] as const) {
			expect(isActionable(approvalFixture({ status }), NOW)).toBe(false);
		}
	});

	it("rejects blocked approvals", () => {
		expect(
			isActionable(approvalFixture({ risk_label: "blocked" }), NOW),
		).toBe(false);
	});

	it("rejects expired approvals", () => {
		expect(
			isActionable(
				approvalFixture({ expires_at: "2026-10-11T11:00:00Z" }),
				NOW,
			),
		).toBe(false);
	});

	it("accepts approvals expiring in the future", () => {
		expect(
			isActionable(
				approvalFixture({ expires_at: "2026-10-11T13:00:00Z" }),
				NOW,
			),
		).toBe(true);
	});

	it("accepts approvals without an expiry", () => {
		expect(isActionable(approvalFixture({ expires_at: null }), NOW)).toBe(
			true,
		);
	});
});

describe("riskTier", () => {
	it("maps low to low", () => {
		expect(riskTier(approvalFixture({ risk_label: "low" }))).toBe("low");
	});

	it("maps medium to medium", () => {
		expect(riskTier(approvalFixture({ risk_label: "medium" }))).toBe(
			"medium",
		);
	});

	it("maps high to high", () => {
		expect(riskTier(approvalFixture({ risk_label: "high" }))).toBe("high");
	});

	it("never surfaces blocked as a tier", () => {
		expect(riskTier(approvalFixture({ risk_label: "blocked" }))).toBe(
			"low",
		);
	});
});
