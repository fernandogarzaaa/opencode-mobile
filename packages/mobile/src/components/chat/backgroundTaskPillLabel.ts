import type { ApprovalRequest } from "@/api/approvals";

/**
 * Compact "name: current activity" label for one background task,
 * mirroring Hark's subagent status pills. The activity is always
 * "awaiting approval" because a pill only exists while its approval
 * is pending: the store drops decided items, so pills disappear on
 * completion with no extra logic at the call site.
 */
export function pillLabelFor(approval: ApprovalRequest): string {
	const name = approval.action.tool_name.trim() || "task";
	return `${name}: awaiting approval`;
}
