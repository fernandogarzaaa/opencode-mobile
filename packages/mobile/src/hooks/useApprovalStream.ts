import { useCallback, useEffect, useRef } from "react";
import type { ApprovalRequest } from "../api/approvals";
import { buildShadowHeaders } from "../lib/shadowAuth";
import { useConnectionStore } from "../stores/useConnectionStore";

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const CONNECTION_TIMEOUT_MS = 30000;
const DEBUG_STREAM = __DEV__;

/**
 * Approval SSE event from the node bus (main.py /agent/stream):
 *   data: {"type":"approval.created","properties":<ApprovalRequest JSON>}
 *   data: {"type":"approval.updated","properties":<ApprovalRequest JSON>}
 * Heartbeats are `:heartbeat` comment lines; the node yields an idle
 * frame every 25s.
 */
export interface ApprovalStreamEvent {
	type: "approval.created" | "approval.updated" | string;
	approval: ApprovalRequest;
}

interface ApprovalStreamHandlers {
	onCreated: (approval: ApprovalRequest) => void;
	onUpdated: (approval: ApprovalRequest) => void;
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

function isApprovalPayload(value: unknown): value is ApprovalRequest {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return typeof v.id === "string" && typeof v.status === "string";
}

/**
 * Subscribe to GET /agent/stream while mounted. Handles reconnect with
 * backoff and never leaks the XHR on unmount.
 */
export function useApprovalStream(handlers: ApprovalStreamHandlers) {
	const { serverUrl, deviceId, deviceSecret, isConnected } =
		useConnectionStore();
	const xhrRef = useRef<XMLHttpRequest | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const lastProcessedIndexRef = useRef(0);
	const isConnectingRef = useRef(false);
	const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
	const isActiveRef = useRef(true);
	const incompleteLineRef = useRef("");
	const connectRef = useRef<() => void>(() => {});

	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;

	const clearTimers = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
		if (connectionTimeoutRef.current) {
			clearTimeout(connectionTimeoutRef.current);
			connectionTimeoutRef.current = null;
		}
	}, []);

	const abortConnection = useCallback(() => {
		if (xhrRef.current) {
			xhrRef.current.abort();
			xhrRef.current = null;
		}
		isConnectingRef.current = false;
	}, []);

	const doScheduleReconnect = useCallback(() => {
		if (!isActiveRef.current || !isConnected) return;

		clearTimers();
		const delay = reconnectDelayRef.current;
		if (DEBUG_STREAM) {
			console.log(`[ApprovalStream] Scheduling reconnect in ${delay}ms`);
		}

		reconnectTimeoutRef.current = setTimeout(() => {
			if (isActiveRef.current && isConnected) {
				connectRef.current();
			}
		}, delay);

		reconnectDelayRef.current = Math.min(
			reconnectDelayRef.current * 2,
			MAX_RECONNECT_DELAY_MS,
		);
	}, [isConnected, clearTimers]);

	const handleLine = useCallback((line: string) => {
		const trimmed = line.trim();
		if (!trimmed || !trimmed.startsWith("data: ")) return;

		const data = trimmed.slice(6);
		if (!data) return;

		try {
			const parsed = JSON.parse(data) as {
				type?: string;
				properties?: unknown;
			};
			if (
				(parsed.type === "approval.created" ||
					parsed.type === "approval.updated") &&
				isApprovalPayload(parsed.properties)
			) {
				if (DEBUG_STREAM) {
					console.log("[ApprovalStream] Event:", parsed.type, parsed.properties.id);
				}
				if (parsed.type === "approval.created") {
					handlersRef.current.onCreated(parsed.properties);
				} else {
					handlersRef.current.onUpdated(parsed.properties);
				}
			}
		} catch {
			if (DEBUG_STREAM) {
				console.warn("[ApprovalStream] JSON parse error:", data.slice(0, 200));
			}
		}
	}, []);

	const connect = useCallback(() => {
		if (!serverUrl || !deviceId || !deviceSecret || !isConnected) return;
		if (isConnectingRef.current || xhrRef.current) return;

		isConnectingRef.current = true;
		clearTimers();

		const url = `${normalizeServerUrl(serverUrl)}/agent/stream`;
		if (DEBUG_STREAM) {
			console.log(`[ApprovalStream] Connecting to: ${url}`);
		}

		const xhr = new XMLHttpRequest();
		xhrRef.current = xhr;
		lastProcessedIndexRef.current = 0;
		incompleteLineRef.current = "";

		connectionTimeoutRef.current = setTimeout(() => {
			if (xhrRef.current === xhr && isConnectingRef.current) {
				console.warn("[ApprovalStream] Connection timeout");
				xhr.abort();
			}
		}, CONNECTION_TIMEOUT_MS);

		xhr.open("GET", url, true);
		// Shadow-signed like every other node endpoint; the node's HMAC
		// verification signs request.url.path only (no query string).
		const shadowHeaders = buildShadowHeaders(deviceId, deviceSecret, "GET", "/agent/stream", "");
		for (const [key, value] of Object.entries(shadowHeaders)) {
			xhr.setRequestHeader(key, value);
		}
		xhr.setRequestHeader("Accept", "text/event-stream");
		xhr.setRequestHeader("Cache-Control", "no-cache");

		xhr.onreadystatechange = () => {
			if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
				if (connectionTimeoutRef.current) {
					clearTimeout(connectionTimeoutRef.current);
					connectionTimeoutRef.current = null;
				}

				if (xhr.status === 200) {
					if (DEBUG_STREAM) {
						console.log("[ApprovalStream] Connected");
					}
					isConnectingRef.current = false;
					reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
				} else {
					console.error(`[ApprovalStream] Connection failed: ${xhr.status}`);
					isConnectingRef.current = false;
				}
			}

			if (
				xhr.readyState === XMLHttpRequest.LOADING ||
				xhr.readyState === XMLHttpRequest.DONE
			) {
				const newData = xhr.responseText.slice(lastProcessedIndexRef.current);
				lastProcessedIndexRef.current = xhr.responseText.length;

				if (newData) {
					const textToParse = incompleteLineRef.current + newData;
					const lines = textToParse.split("\n");
					incompleteLineRef.current = lines.pop() || "";
					for (const line of lines) {
						handleLine(line);
					}
				}
			}

			if (xhr.readyState === XMLHttpRequest.DONE) {
				if (DEBUG_STREAM) {
					console.log("[ApprovalStream] Connection closed");
				}
				xhrRef.current = null;
				isConnectingRef.current = false;

				if (isActiveRef.current && isConnected) {
					doScheduleReconnect();
				}
			}
		};

		xhr.onerror = () => {
			console.error("[ApprovalStream] XHR error");
			if (connectionTimeoutRef.current) {
				clearTimeout(connectionTimeoutRef.current);
				connectionTimeoutRef.current = null;
			}
			xhrRef.current = null;
			isConnectingRef.current = false;

			if (isActiveRef.current && isConnected) {
				doScheduleReconnect();
			}
		};

		xhr.send();
	}, [
		serverUrl,
		deviceId,
		deviceSecret,
		isConnected,
		clearTimers,
		doScheduleReconnect,
		handleLine,
	]);

	connectRef.current = connect;

	useEffect(() => {
		isActiveRef.current = true;

		if (isConnected) {
			connectRef.current();
		}

		return () => {
			isActiveRef.current = false;
			abortConnection();
			clearTimers();
		};
	}, [isConnected, abortConnection, clearTimers]);
}
