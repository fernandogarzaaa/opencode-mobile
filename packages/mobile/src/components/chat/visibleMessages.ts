import type { Message, MessagePart } from "./types";

/**
 * Visible-message filter, adapted from OpenDots' chat filter
 * (`src/client/Chat.tsx` lines 209-219, MIT (c) Atai Barkai): hide internal
 * receipts and show only user/assistant messages with text content or with
 * tool calls (which `ChatMessage` renders as first-class cards via
 * `ToolPart`).
 *
 * A message is hidden when it carries no user-visible content: run
 * bookkeeping parts (`step-start` / `step-finish`) or lone `tool-result`
 * receipts with neither text nor a tool call. Streaming messages stay
 * visible while their content arrives to avoid flicker.
 */

function partText(part: MessagePart): string {
	const text = part.content ?? part.text;
	return typeof text === "string" ? text : "";
}

function hasTextContent(message: Message): boolean {
	if (typeof message.content === "string" && message.content.trim().length > 0) {
		return true;
	}
	return !!message.parts?.some(
		(part) => part.type === "text" && partText(part).trim().length > 0,
	);
}

function hasToolCall(message: Message): boolean {
	return !!message.parts?.some(
		(part) => part.type === "tool" || part.type === "tool-call",
	);
}

export function isMessageVisible(message: Message): boolean {
	if (message.role !== "user" && message.role !== "assistant") {
		return false;
	}
	if (message.isStreaming) {
		return true;
	}
	if (hasTextContent(message)) {
		return true;
	}
	return message.role === "assistant" && hasToolCall(message);
}

export function visibleMessages(messages: Message[]): Message[] {
	return messages.filter(isMessageVisible);
}
