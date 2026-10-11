import type { AttachedFile } from "../components/chat/FileAttachment";

/**
 * Wire shape for chat attachments sent to the Shadow Node.
 *
 * API contract (defined client-side; node-side media handling is a
 * follow-up item in the node repo):
 *   POST /agent/ask_stream { prompt: string, attachments?: AskAttachment[] }
 * The node ignores unknown JSON fields today, so sending attachments is
 * forward-compatible: once the node reads them, no client change is needed.
 * No cloud upload is involved; bytes travel with the ask request to the
 * user's own node, matching the local-first architecture.
 */
export interface AskAttachment {
	/** Original file name, e.g. "screenshot.png". */
	name: string;
	/** MIME type, e.g. "image/png". */
	mime_type: string;
	/** Size in bytes. */
	size_bytes: number;
	/** Base64-encoded content. Omitted when the file could not be read. */
	base64?: string;
}

/**
 * Map composer attachments to the wire shape. Pure: no I/O, no state.
 * Files the picker could not read (no base64) are still sent with their
 * metadata so the node can reference them once it handles media.
 * Returns undefined when there is nothing to send, so the request body
 * stays exactly { prompt } for text-only asks.
 */
export function toAskAttachments(
	files: AttachedFile[] | undefined,
): AskAttachment[] | undefined {
	if (!files || files.length === 0) {
		return undefined;
	}
	return files.map((file) => ({
		name: file.name,
		mime_type: file.type,
		size_bytes: file.size,
		...(file.base64 ? { base64: file.base64 } : {}),
	}));
}
