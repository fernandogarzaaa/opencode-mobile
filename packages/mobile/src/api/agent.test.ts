import { askAgentStream } from "./agent";
import { useConnectionStore } from "../stores/useConnectionStore";

jest.mock("expo-secure-store", () => ({}));

interface CapturedRequest {
	method: string;
	url: string;
	headers: Record<string, string>;
	body: string | undefined;
}

let captured: CapturedRequest | null;
let instances: FakeXMLHttpRequest[];

class FakeXMLHttpRequest {
	static LOADING = 3;
	static DONE = 4;
	method = "";
	url = "";
	headers: Record<string, string> = {};
	body: string | undefined;
	responseText = "";
	readyState = 0;
	status = 200;
	onreadystatechange: (() => void) | null = null;
	onerror: (() => void) | null = null;
	abort = jest.fn();

	open(method: string, url: string) {
		this.method = method;
		this.url = url;
		instances.push(this);
	}

	setRequestHeader(key: string, value: string) {
		this.headers[key] = value;
	}

	send(body?: string) {
		this.body = body;
		captured = {
			method: this.method,
			url: this.url,
			headers: { ...this.headers },
			body: this.body,
		};
	}

	/** Drive the stream as the node would: append an SSE line and fire. */
	emitLine(line: string) {
		this.responseText += line + "\n";
		this.readyState = FakeXMLHttpRequest.LOADING;
		this.onreadystatechange?.();
	}

	/** Set the raw response text (e.g. several lines at once) and fire. */
	emitRaw(text: string) {
		this.responseText = text;
		this.readyState = FakeXMLHttpRequest.LOADING;
		this.onreadystatechange?.();
	}

	/** Finish the response without a done frame. */
	finish(status = 200) {
		this.status = status;
		this.readyState = FakeXMLHttpRequest.DONE;
		this.onreadystatechange?.();
	}
}

function connect() {
	useConnectionStore.setState({
		serverUrl: "http://node.local:8080",
		deviceId: "device-1",
		deviceSecret: "secret-1",
		isConnected: true,
	});
}

function disconnect() {
	useConnectionStore.setState({
		serverUrl: null,
		deviceId: null,
		deviceSecret: null,
		isConnected: false,
	});
}

const handlers = () => ({
	onDelta: jest.fn(),
	onDone: jest.fn(),
	onError: jest.fn(),
});

beforeEach(() => {
	captured = null;
	instances = [];
	(globalThis as Record<string, unknown>).XMLHttpRequest =
		FakeXMLHttpRequest as unknown;
	connect();
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
	disconnect();
});

describe("askAgentStream request body", () => {
	it("posts {prompt} exactly for text-only asks", () => {
		const cancel = askAgentStream("hello", handlers());
		expect(captured?.method).toBe("POST");
		expect(captured?.url).toBe("http://node.local:8080/agent/ask_stream");
		expect(captured?.body).toBe(JSON.stringify({ prompt: "hello" }));
		expect(captured?.headers["Content-Type"]).toBe("application/json");
		cancel();
	});

	it("includes attachments in the body when provided", () => {
		const cancel = askAgentStream("see this", handlers(), {
			attachments: [
				{
					name: "a.png",
					mime_type: "image/png",
					size_bytes: 10,
					base64: "eA==",
				},
			],
		});
		expect(JSON.parse(captured?.body ?? "")).toEqual({
			prompt: "see this",
			attachments: [
				{ name: "a.png", mime_type: "image/png", size_bytes: 10, base64: "eA==" },
			],
		});
		cancel();
	});

	it("omits attachments when the list is empty", () => {
		const cancel = askAgentStream("hello", handlers(), { attachments: [] });
		expect(captured?.body).toBe(JSON.stringify({ prompt: "hello" }));
		cancel();
	});

	it("calls onError without sending when not connected", () => {
		disconnect();
		const h = handlers();
		const cancel = askAgentStream("hello", h);
		expect(h.onError).toHaveBeenCalledTimes(1);
		expect(h.onError.mock.calls[0]?.[0]).toEqual(
			new Error("Not connected to a Shadow Node."),
		);
		expect(captured).toBeNull();
		cancel();
	});

	it.each([
		["serverUrl", { serverUrl: null }],
		["deviceId", { deviceId: null }],
		["deviceSecret", { deviceSecret: null }],
	])("calls onError when only %s is missing", (_label, missing) => {
		useConnectionStore.setState({
			serverUrl: "http://node.local:8080",
			deviceId: "device-1",
			deviceSecret: "secret-1",
			isConnected: true,
			...missing,
		});
		const h = handlers();
		askAgentStream("hello", h);
		expect(h.onError).toHaveBeenCalledTimes(1);
		expect(captured).toBeNull();
	});

	it("returns a cancel function that aborts the request", () => {
		const cancel = askAgentStream("hello", handlers());
		expect(instances).toHaveLength(1);
		cancel();
		expect(instances[0]?.abort).toHaveBeenCalledTimes(1);
	});
});

describe("askAgentStream SSE handling", () => {
	it("delivers two frames arriving in a single chunk", () => {
		const h = handlers();
		askAgentStream("hello", h);
		const xhr = instances[0]!;
		xhr.emitRaw(
			'data: {"type":"agent.message.delta","properties":{"delta":"Hel"}}\n' +
				'data: {"type":"agent.message.delta","properties":{"delta":"lo"}}\n',
		);
		expect(h.onDelta.mock.calls.map((c) => c[0])).toEqual(["Hel", "lo"]);
	});

	it("reassembles a frame split across chunks", () => {
		const h = handlers();
		askAgentStream("hello", h);
		const xhr = instances[0]!;
		const frame =
			'data: {"type":"agent.message.delta","properties":{"delta":"hi"}}';
		xhr.emitRaw(frame.slice(0, 20));
		expect(h.onDelta).not.toHaveBeenCalled();
		xhr.emitRaw(frame.slice(0, 20) + frame.slice(20) + "\n");
		expect(h.onDelta.mock.calls.map((c) => c[0])).toEqual(["hi"]);
	});

	it("ignores lines after the done frame within one chunk", () => {
		const h = handlers();
		askAgentStream("hello", h);
		const xhr = instances[0]!;
		xhr.emitRaw(
			'data: {"type":"agent.message.done","properties":{}}\n' +
				'data: {"type":"agent.message.delta","properties":{"delta":"late"}}\n',
		);
		expect(h.onDone).toHaveBeenCalledTimes(1);
		expect(h.onDelta).not.toHaveBeenCalled();
	});

	it("ignores malformed JSON lines without failing the stream", () => {
		const h = handlers();
		askAgentStream("hello", h);
		const xhr = instances[0]!;
		xhr.emitLine("data: {not json");
		xhr.emitLine(
			'data: {"type":"agent.message.delta","properties":{"delta":"ok"}}',
		);
		expect(h.onDelta).toHaveBeenCalledTimes(1);
		expect(h.onError).not.toHaveBeenCalled();
	});

	it("ignores non-SSE lines", () => {
		const h = handlers();
		askAgentStream("hello", h);
		const xhr = instances[0]!;
		xhr.emitLine(": keep-alive");
		xhr.emitLine("");
		expect(h.onDelta).not.toHaveBeenCalled();
		expect(h.onError).not.toHaveBeenCalled();
	});

	it("maps the done frame to onDone", () => {
		const h = handlers();
		askAgentStream("hello", h);
		const xhr = instances[0]!;
		xhr.emitLine(
			'data: {"type":"agent.message.done","properties":{"sessionID":"s1","messageID":"m1","answer":"done","sources":[{"attribution":"a"}],"model_used":"m","route":"r"}}',
		);
		expect(h.onDone).toHaveBeenCalledTimes(1);
		expect(h.onDone.mock.calls[0]?.[0]).toEqual({
			sessionID: "s1",
			messageID: "m1",
			answer: "done",
			sources: [{ attribution: "a" }],
			model_used: "m",
			route: "r",
		});
	});

	it("defaults missing done-frame fields to empty values", () => {
		const h = handlers();
		askAgentStream("hello", h);
		const xhr = instances[0]!;
		xhr.emitLine('data: {"type":"agent.message.done","properties":{}}');
		expect(h.onDone.mock.calls[0]?.[0]).toEqual({
			sessionID: "",
			messageID: "",
			answer: "",
			sources: [],
			model_used: "",
			route: "",
		});
	});

	it("stops delivering after the done frame", () => {
		const h = handlers();
		askAgentStream("hello", h);
		const xhr = instances[0]!;
		xhr.emitLine('data: {"type":"agent.message.done","properties":{}}');
		xhr.emitLine(
			'data: {"type":"agent.message.delta","properties":{"delta":"late"}}',
		);
		expect(h.onDelta).not.toHaveBeenCalled();
	});

	it("fails when the stream ends without a done frame (HTTP 200)", () => {
		const h = handlers();
		askAgentStream("hello", h);
		instances[0]!.finish(200);
		expect(h.onError).toHaveBeenCalledTimes(1);
		expect(h.onError.mock.calls[0]?.[0]).toEqual(
			new Error("Stream ended without a final answer."),
		);
	});

	it("reports the HTTP status when the stream fails", () => {
		const h = handlers();
		askAgentStream("hello", h);
		instances[0]!.finish(500);
		expect(h.onError.mock.calls[0]?.[0]).toEqual(
			new Error("Ask failed (HTTP 500)."),
		);
	});

	it("fails on network error", () => {
		const h = handlers();
		askAgentStream("hello", h);
		instances[0]!.onerror?.();
		expect(h.onError.mock.calls[0]?.[0]).toEqual(
			new Error("Network request failed."),
		);
	});

	it("times out after silence", () => {
		const h = handlers();
		askAgentStream("hello", h);
		jest.advanceTimersByTime(120000);
		expect(h.onError).toHaveBeenCalledTimes(1);
		expect(h.onError.mock.calls[0]?.[0]).toEqual(
			new Error("Ask request timed out waiting for the node."),
		);
	});

	it("does not time out after the done frame", () => {
		const h = handlers();
		askAgentStream("hello", h);
		instances[0]!.emitLine(
			'data: {"type":"agent.message.done","properties":{}}',
		);
		jest.advanceTimersByTime(120000);
		expect(h.onError).not.toHaveBeenCalled();
	});
});
