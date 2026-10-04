import { buildShadowHeaders } from "../lib/shadowAuth";
import { getConnectionState } from "../stores/useConnectionStore";

/**
 * Shadow Node agent API.
 *
 * Server contract (apps/shadow-node/shadow_node/main.py):
 *   POST /agent/ask_stream {prompt: string, allow_cloud?: bool,
 *     cloud_approval?: bool, session_id?: string|null}
 * returns SSE frames:
 *   data: {"type":"agent.message.delta","properties":{"sessionID","messageID","delta"}}
 *   ... then ...
 *   data: {"type":"agent.message.done","properties":{"sessionID","messageID",
 *     "answer","sources","model_used","route"}}
 * Chunking is delivery-level (160-char slices of the final answer), not
 * token-level generation: deltas are safe to concatenate verbatim.
 *
 * `sources` items are the node's SearchResult objects
 * (packages/memory-engine/memory_engine/models.py): each carries at least
 * `attribution` (e.g. "Title (kind)") and `explanation`.
 */

export interface AgentSource {
	/** Human-readable citation label, e.g. "Title (kind)". */
	attribution?: string;
	/** Why this source was retrieved. */
	explanation?: string;
	score?: number;
	freshness?: number;
	untrusted_context?: boolean;
	[key: string]: unknown;
}

export interface AskStreamDone {
	sessionID: string;
	messageID: string;
	answer: string;
	sources: AgentSource[];
	model_used: string;
	route: string;
}

export interface AskStreamHandlers {
	/** Called for every agent.message.delta chunk, in order. */
	onDelta: (delta: string) => void;
	/** Called once on agent.message.done. */
	onDone: (done: AskStreamDone) => void;
	/** Called on transport/HTTP failure (never after onDone or cancel). */
	onError: (error: Error) => void;
}

function normalizeServerUrl(serverUrl: string): string {
	let normalized = serverUrl.trim();
	if (
		!normalized.startsWith("http://") &&
		!normalized.startsWith("https://")
	) {
		normalized = `http://${normalized}`;
	}
	if (normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

interface SseFrame {
	type?: string;
	properties?: {
		sessionID?: string;
		messageID?: string;
		delta?: string;
		answer?: string;
		sources?: AgentSource[];
		model_used?: string;
		route?: string;
	};
}

/**
 * POST /agent/ask_stream with {prompt} and stream the SSE answer.
 * Returns a cancel function (aborts the XHR; no further callbacks fire).
 */
export function askAgentStream(
	prompt: string,
	handlers: AskStreamHandlers,
): () => void {
	const { serverUrl, deviceId, deviceSecret } = getConnectionState();
	if (!serverUrl || !deviceId || !deviceSecret) {
		handlers.onError(new Error("Not connected to a Shadow Node."));
		return () => {};
	}

	const path = "/agent/ask_stream";
	const url = `${normalizeServerUrl(serverUrl)}${path}`;
	const body = JSON.stringify({ prompt });

	const xhr = new XMLHttpRequest();
	let settled = false;
	let processedLength = 0;
	let incompleteLine = "";
	// Cloud-routed answers can take a while; fail only on total silence.
	const TIMEOUT_MS = 120000;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const clearTimer = () => {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	const fail = (error: Error) => {
		if (settled) return;
		settled = true;
		clearTimer();
		try {
			xhr.abort();
		} catch {
			// ignore: abort after completion throws on some RN builds
		}
		handlers.onError(error);
	};

	const handleLine = (line: string) => {
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) return;
		const payload = trimmed.slice("data:".length).trim();
		if (!payload) return;
		let frame: SseFrame;
		try {
			frame = JSON.parse(payload) as SseFrame;
		} catch {
			return;
		}
		if (frame.type === "agent.message.delta") {
			const delta = frame.properties?.delta;
			if (typeof delta === "string" && delta.length > 0) {
				handlers.onDelta(delta);
			}
		} else if (frame.type === "agent.message.done") {
			const p = frame.properties ?? {};
			settled = true;
			clearTimer();
			try {
				xhr.abort();
			} catch {
				// ignore
			}
			handlers.onDone({
				sessionID: typeof p.sessionID === "string" ? p.sessionID : "",
				messageID: typeof p.messageID === "string" ? p.messageID : "",
				answer: typeof p.answer === "string" ? p.answer : "",
				sources: Array.isArray(p.sources) ? p.sources : [],
				model_used: typeof p.model_used === "string" ? p.model_used : "",
				route: typeof p.route === "string" ? p.route : "",
			});
		}
	};

	const pump = () => {
		const text = xhr.responseText ?? "";
		if (text.length <= processedLength) return;
		const newData = text.slice(processedLength);
		processedLength = text.length;
		const chunk = incompleteLine + newData;
		const lines = chunk.split("\n");
		incompleteLine = lines.pop() ?? "";
		for (const line of lines) {
			handleLine(line);
			if (settled) return;
		}
	};

	xhr.open("POST", url, true);
	// Shadow-signed like every other node endpoint: the node signs
	// request.url.path only (no query string), body is the exact JSON text.
	const shadowHeaders = buildShadowHeaders(
		deviceId,
		deviceSecret,
		"POST",
		path,
		body,
	);
	for (const [key, value] of Object.entries(shadowHeaders)) {
		xhr.setRequestHeader(key, value);
	}
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.setRequestHeader("Accept", "text/event-stream");
	xhr.setRequestHeader("Cache-Control", "no-cache");

	timeoutId = setTimeout(() => {
		fail(new Error("Ask request timed out waiting for the node."));
	}, TIMEOUT_MS);

	xhr.onreadystatechange = () => {
		if (
			xhr.readyState === XMLHttpRequest.LOADING ||
			xhr.readyState === XMLHttpRequest.DONE
		) {
			if (!settled) pump();
		}
		if (xhr.readyState === XMLHttpRequest.DONE && !settled) {
			pump();
			if (!settled) {
				fail(
					new Error(
						xhr.status >= 200 && xhr.status < 300
							? "Stream ended without a final answer."
							: `Ask failed (HTTP ${xhr.status}).`,
					),
				);
			}
		}
	};
	xhr.onerror = () => {
		fail(new Error("Network request failed."));
	};

	xhr.send(body);

	return () => {
		if (settled) return;
		settled = true;
		clearTimer();
		try {
			xhr.abort();
		} catch {
			// ignore
		}
	};
}

export const agentApi = {
	askStream: askAgentStream,
};
