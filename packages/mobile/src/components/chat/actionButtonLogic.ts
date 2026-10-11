import type { ApprovalRequest, RiskLabel } from "@/api/approvals";

const MAX_LABEL_LENGTH = 48;

/**
 * Short human-readable label for one action button, derived from the
 * approval the button will decide. Prefers the node's own description
 * over the raw tool name. Truncated so a row of buttons never
 * overwhelms the chat.
 */
export function actionLabelFor(approval: ApprovalRequest): string {
	const raw =
		approval.action.description?.trim() || approval.action.tool_name.trim();
	if (raw.length <= MAX_LABEL_LENGTH) return raw;
	return `${raw.slice(0, MAX_LABEL_LENGTH - 3).trimEnd()}...`;
}

/**
 * Whether an approval can be decided from an inline chat button.
 * Blocked approvals can never run, expired ones are dead, and only
 * pending items are actionable. The store only holds pending items,
 * but the check is defensive so the row never shows a dead button.
 */
export function isActionable(
	approval: ApprovalRequest,
	nowMs: number,
): boolean {
	if (approval.status !== "pending") return false;
	if (approval.risk_label === "blocked") return false;
	if (approval.expires_at) {
		const expiresAtMs = Date.parse(approval.expires_at);
		if (!Number.isNaN(expiresAtMs) && expiresAtMs <= nowMs) return false;
	}
	return true;
}

/** Risk tier used for the button's status dot. */
export function riskTier(approval: ApprovalRequest): Exclude<RiskLabel, "blocked"> {
	switch (approval.risk_label) {
		case "medium":
			return "medium";
		case "high":
			return "high";
		default:
			return "low";
	}
}
