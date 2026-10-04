import { create } from "zustand";
import type { ApprovalRequest } from "../api/approvals";

interface ApprovalsState {
	/** Pending approval requests, newest first. Never holds decided items. */
	items: ApprovalRequest[];
	/** Replace the whole pending list (from a fetch). */
	setItems: (items: ApprovalRequest[]) => void;
	/**
	 * Merge one streamed approval: pending items are prepended/replaced,
	 * decided items are removed from the pending list.
	 */
	upsert: (approval: ApprovalRequest) => void;
	/** Drop one item by id (after a local decision). */
	remove: (id: string) => void;
}

export const useApprovalsStore = create<ApprovalsState>()((set) => ({
	items: [],

	setItems: (items) =>
		set({ items: items.filter((a) => a.status === "pending") }),

	upsert: (approval) =>
		set((state) => {
			if (approval.status !== "pending") {
				return { items: state.items.filter((a) => a.id !== approval.id) };
			}
			const exists = state.items.some((a) => a.id === approval.id);
			return {
				items: exists
					? state.items.map((a) => (a.id === approval.id ? approval : a))
					: [approval, ...state.items],
			};
		}),

	remove: (id) =>
		set((state) => ({ items: state.items.filter((a) => a.id !== id) })),
}));
