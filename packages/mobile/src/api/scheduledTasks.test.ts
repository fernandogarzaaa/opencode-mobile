import { useConnectionStore } from "../stores/useConnectionStore";
import {
	isAmbientTaskId,
	isReminderTask,
	scheduledTasksApi,
	type ScheduledTask,
} from "./scheduledTasks";

jest.mock("expo-secure-store", () => ({}));

/** Minimal XMLHttpRequest double: captures the request, lets tests answer. */
class FakeXMLHttpRequest {
	static DONE = 4;
	method = "";
	url = "";
	headers: Record<string, string> = {};
	body: string | null = null;
	responseText = "";
	status = 200;
	statusText = "OK";
	readyState = 0;
	onreadystatechange: (() => void) | null = null;
	onerror: (() => void) | null = null;
	ontimeout: (() => void) | null = null;
	timeout = 0;
	abort = jest.fn();

	open(method: string, url: string) {
		this.method = method;
		this.url = url;
	}

	setRequestHeader(key: string, value: string) {
		this.headers[key] = value;
	}

	getAllResponseHeaders() {
		return "content-type: application/json\r\n";
	}

	send(body?: string | null) {
		this.body = body ?? null;
	}

	/** Answer the request as the node would. */
	respond(status: number, payload: unknown) {
		this.status = status;
		this.statusText = status === 200 || status === 201 ? "OK" : "Error";
		this.responseText = JSON.stringify(payload);
		this.readyState = FakeXMLHttpRequest.DONE;
		this.onreadystatechange?.();
	}
}

let instances: FakeXMLHttpRequest[] = [];

function taskFixture(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
	return {
		id: "r1",
		kind: "reminder",
		title: "Standup",
		description: "",
		cadence: "Every weekday at 9:00 AM",
		recurrence: "weekdays",
		enabled: true,
		status: "pending",
		next_run: 1790000000,
		last_run: null,
		due_at: 1790000000,
		note: "",
		...overrides,
	};
}

beforeEach(() => {
	instances = [];
	const XHRMock = function (this: unknown) {
		const inst = new FakeXMLHttpRequest();
		instances.push(inst);
		return inst;
	} as unknown as { DONE: number; new (): FakeXMLHttpRequest };
	XHRMock.DONE = FakeXMLHttpRequest.DONE;
	(globalThis as Record<string, unknown>).XMLHttpRequest = XHRMock;
	useConnectionStore.setState({
		serverUrl: "http://node.test:8000",
		deviceId: null,
		deviceSecret: null,
		isConnected: true,
	});
});

afterEach(() => {
	delete (globalThis as Record<string, unknown>).XMLHttpRequest;
	jest.clearAllMocks();
});

function lastRequest() {
	expect(instances).toHaveLength(1);
	return instances[0];
}

describe("scheduledTasksApi.list", () => {
	it("GETs /scheduled-tasks and returns the parsed list", async () => {
		const tasks = [taskFixture()];
		const promise = scheduledTasksApi.list();
		lastRequest().respond(200, tasks);
		await expect(promise).resolves.toEqual(tasks);
		expect(lastRequest().method).toBe("GET");
		expect(lastRequest().url).toBe("http://node.test:8000/scheduled-tasks");
	});
});

describe("scheduledTasksApi.get", () => {
	it("URL-encodes the task id", async () => {
		const task = taskFixture({ id: "ambient:morning_brief" });
		const promise = scheduledTasksApi.get("ambient:morning_brief");
		lastRequest().respond(200, task);
		await expect(promise).resolves.toEqual(task);
		expect(lastRequest().url).toBe(
			"http://node.test:8000/scheduled-tasks/ambient%3Amorning_brief",
		);
	});
});

describe("scheduledTasksApi.create", () => {
	it("POSTs the reminder payload", async () => {
		const created = taskFixture();
		const promise = scheduledTasksApi.create({
			title: "Standup",
			note: "team",
			due_at: 1790000000,
			recurrence: "weekdays",
		});
		const req = lastRequest();
		expect(req.method).toBe("POST");
		expect(req.url).toBe("http://node.test:8000/scheduled-tasks");
		expect(JSON.parse(req.body ?? "{}")).toEqual({
			title: "Standup",
			note: "team",
			due_at: 1790000000,
			recurrence: "weekdays",
		});
		req.respond(201, created);
		await expect(promise).resolves.toEqual(created);
	});
});

describe("scheduledTasksApi.update", () => {
	it("PATCHes the task id with the patch body", async () => {
		const updated = taskFixture({ enabled: false });
		const promise = scheduledTasksApi.update("r1", { enabled: false });
		const req = lastRequest();
		expect(req.method).toBe("PATCH");
		expect(req.url).toBe("http://node.test:8000/scheduled-tasks/r1");
		expect(JSON.parse(req.body ?? "{}")).toEqual({ enabled: false });
		req.respond(200, updated);
		await expect(promise).resolves.toEqual(updated);
	});

	it("surfaces the node 422 for ambient non-enabled patches", async () => {
		const promise = scheduledTasksApi.update("ambient:feed_digest", {
			title: "x",
		});
		lastRequest().respond(422, { detail: "ambient tasks only support 'enabled'" });
		await expect(promise).rejects.toThrow(
			"ambient tasks only support 'enabled'",
		);
	});
});

describe("scheduledTasksApi.remove", () => {
	it("DELETEs the reminder", async () => {
		const promise = scheduledTasksApi.remove("r1");
		const req = lastRequest();
		expect(req.method).toBe("DELETE");
		expect(req.url).toBe("http://node.test:8000/scheduled-tasks/r1");
		req.respond(200, { deleted_task: "r1" });
		await expect(promise).resolves.toEqual({ deleted_task: "r1" });
	});

	it("rejects when the node refuses an ambient delete", async () => {
		const promise = scheduledTasksApi.remove("ambient:reminder_check");
		lastRequest().respond(422, {
			detail: "builtin ambient tasks cannot be deleted; disable them instead",
		});
		await expect(promise).rejects.toThrow(
			"builtin ambient tasks cannot be deleted",
		);
	});
});

describe("scheduledTasksApi.parse", () => {
	it("POSTs the text and returns a parsed proposal", async () => {
		const result = {
			status: "parsed",
			proposal: {
				title: "Water plants",
				note: "",
				due_at: 1790000000,
				recurrence: "weekdays",
				plain_cadence: "Every weekday at 7:00 AM",
			},
			question: null,
		};
		const promise = scheduledTasksApi.parse("remind me every weekday at 7am");
		const req = lastRequest();
		expect(req.method).toBe("POST");
		expect(req.url).toBe("http://node.test:8000/reminders/parse");
		expect(JSON.parse(req.body ?? "{}")).toEqual({
			text: "remind me every weekday at 7am",
		});
		req.respond(200, result);
		await expect(promise).resolves.toEqual(result);
	});

	it("returns the clarifying question when the node cannot parse", async () => {
		const result = {
			status: "needs_clarification",
			proposal: null,
			question: "What time should I remind you?",
		};
		const promise = scheduledTasksApi.parse("remind me sometime");
		lastRequest().respond(200, result);
		const parsed = await promise;
		expect(parsed.status).toBe("needs_clarification");
		expect(parsed.question).toBe("What time should I remind you?");
	});
});

describe("task id helpers", () => {
	it("isAmbientTaskId detects the ambient prefix", () => {
		expect(isAmbientTaskId("ambient:morning_brief")).toBe(true);
		expect(isAmbientTaskId("r1")).toBe(false);
		expect(isAmbientTaskId("")).toBe(false);
	});

	it("isReminderTask follows the kind field", () => {
		expect(isReminderTask(taskFixture())).toBe(true);
		expect(
			isReminderTask(
				taskFixture({ id: "ambient:x", kind: "ambient_task", recurrence: null }),
			),
		).toBe(false);
	});
});

describe("httpClient __DEV__ guard", () => {
	it("does not log when __DEV__ is undefined (jest node env)", async () => {
		const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		try {
			const promise = scheduledTasksApi.list();
			lastRequest().respond(200, []);
			await promise;
			expect(logSpy).not.toHaveBeenCalled();
		} finally {
			logSpy.mockRestore();
		}
	});

	it("logs requests when __DEV__ is true at import time", async () => {
		(globalThis as Record<string, unknown>).__DEV__ = true;
		try {
			let isolatedApi: typeof scheduledTasksApi | undefined;
			jest.isolateModules(() => {
				const storeMod =
					// eslint-disable-next-line @typescript-eslint/no-require-imports
					require("../stores/useConnectionStore") as typeof import("../stores/useConnectionStore");
				storeMod.useConnectionStore.setState({
					serverUrl: "http://node.test:8000",
					deviceId: null,
					deviceSecret: null,
					isConnected: true,
				});
				const apiMod =
					// eslint-disable-next-line @typescript-eslint/no-require-imports
					require("./scheduledTasks") as typeof import("./scheduledTasks");
				isolatedApi = apiMod.scheduledTasksApi;
			});
			const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
			try {
				const promise = isolatedApi!.list();
				lastRequest().respond(200, []);
				await promise;
				expect(logSpy).toHaveBeenCalled();
			} finally {
				logSpy.mockRestore();
			}
		} finally {
			delete (globalThis as Record<string, unknown>).__DEV__;
		}
	});
});
