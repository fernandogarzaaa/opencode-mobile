import { apiGet, apiPost } from "../lib/httpClient";

/**
 * Shadow Node approval contract (verified against
 * apps/shadow-node/shadow_node/main.py and
 * packages/agent-core/agent_core/models.py ApprovalRequest).
 *
 * - GET  /approvals?status=pending  -> page envelope {items, count, next_cursor}
 * - GET  /approvals/receipt?thread_id=X&tool_call_id=Y -> {approval, card} | 404
 * - POST /approvals/{id}/approve -> decided ApprovalRequest | 409 if already decided
 * - POST /approvals/{id}/deny {reason} -> decided ApprovalRequest | 409 if already decided
 */

export type RiskLabel = "low" | "medium" | "high" | "blocked";

export type ApprovalStatus =
	| "pending"
	| "approved"
	| "denied"
	| "expired"
	| "consumed";

export interface ApprovalAction {
	tool_name: string;
	description?: string;
	destructive?: boolean;
	[key: string]: unknown;
}

export interface ApprovalRequest {
	id: string;
	action: ApprovalAction;
	reason: string;
	action_preview: string;
	data_used_preview: string[];
	model_used_preview: string | null;
	destination_preview: string | null;
	risk_label: RiskLabel;
	kind: string;
	requires_double_confirmation: boolean;
	status: ApprovalStatus;
	deny_reason: string | null;
	created_at: string;
	decided_at: string | null;
	expires_at: string | null;
	thread_id: string | null;
	tool_call_id: string | null;
	execution_id: string | null;
	verification_status: string | null;
}

export interface ApprovalPage {
	items: ApprovalRequest[];
	count: number;
	next_cursor: string | null;
}

export interface ApprovalReceipt {
	approval: ApprovalRequest;
	card: Record<string, unknown>;
}

export const approvalsApi = {
	/** Pending approvals, page envelope. */
	listPending: (): Promise<ApprovalPage> =>
		apiGet<ApprovalPage>("/approvals", { status: "pending" }),

	/** Single approve; throws ApiError(409) when already decided. */
	approve: (id: string): Promise<ApprovalRequest> =>
		apiPost<ApprovalRequest>(`/approvals/${encodeURIComponent(id)}/approve`),

	/** Deny with a non-empty reason; throws ApiError(409) when already decided. */
	deny: (id: string, reason: string): Promise<ApprovalRequest> =>
		apiPost<ApprovalRequest>(`/approvals/${encodeURIComponent(id)}/deny`, {
			reason,
		}),

	/**
	 * Idempotency receipt lookup: recover the decided approval when the
	 * decide response was lost (404 when no receipt exists).
	 */
	receipt: (threadId: string, toolCallId: string): Promise<ApprovalReceipt> =>
		apiGet<ApprovalReceipt>("/approvals/receipt", {
			thread_id: threadId,
			tool_call_id: toolCallId,
		}),
};
