import type { AttachedFile } from "./FileAttachment";
import { toAskAttachments } from "../../api/attachments";

/**
 * Pure send-path helpers for the chat composer. The screen owns loading
 * and connection state; these functions decide what may be sent and what
 * the user message carries.
 */

/**
 * Whether the composer may send: needs text, attachments, or both.
 * Mirrors ChatInput's canSend minus the loading state (owned by the screen).
 */
export function canSendChatMessage(
	text: string,
	files?: AttachedFile[],
): boolean {
	return text.trim().length > 0 || (files?.length ?? 0) > 0;
}

/**
 * Build the wire options for agentApi.askStream from composer attachments.
 * Returns undefined for text-only sends so the request body is unchanged.
 */
export function askAttachmentOptions(files?: AttachedFile[]) {
	const attachments = toAskAttachments(files);
	return attachments ? { attachments } : undefined;
}
