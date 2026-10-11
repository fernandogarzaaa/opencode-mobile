import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/httpClient";

/**
 * Client for the node's unified scheduled-tasks surface (Hark backlog item 4,
 * node half: fernandogarzaaa/SHADOW-AI#85).
 *
 * One shape for everything on a schedule: user reminders (recurring or not)
 * plus the node's builtin ambient tasks. Endpoint contract:
 * - POST /reminders/parse            {text} -> parse result
 * - GET /scheduled-tasks             -> ScheduledTask[]
 * - POST /scheduled-tasks            {title, note, due_at, recurrence, enabled} -> ScheduledTask
 * - PATCH /scheduled-tasks/{id}      partial update (ambient: enabled only)
 * - DELETE /scheduled-tasks/{id}     reminders only (ambient -> 422)
 *
 * Ambient task ids are prefixed "ambient:" on the wire.
 */

export interface ScheduledTask {
	id: string;
	kind: "reminder" | "ambient_task";
	title: string;
	description: string;
	/** Plain-words cadence, e.g. "Every weekday at 7:00 AM". */
	cadence: string;
	/** Reminder recurrence ("none" | "hourly" | "daily" | "weekdays" | "weekly"); null for ambient. */
	recurrence: string | null;
	enabled: boolean;
	/** Reminder status ("pending" | ...); null for ambient. */
	status: string | null;
	/** Epoch seconds of next run; null when not scheduled. */
	next_run: number | null;
	/** Epoch seconds of last run/fire; null when never. */
	last_run: number | null;
	/** Reminder first/next due (epoch seconds); null for ambient. */
	due_at: number | null;
	note: string;
}

export interface ScheduledTaskCreate {
	title: string;
	note?: string;
	due_at: number;
	recurrence?: string;
	enabled?: boolean;
}

export interface ScheduledTaskUpdate {
	title?: string;
	note?: string;
	due_at?: number;
	recurrence?: string;
	status?: string;
	enabled?: boolean;
}

export interface ScheduleProposal {
	title: string;
	note: string;
	/** Epoch seconds. */
	due_at: number;
	recurrence: string;
	/** Plain-words cadence, e.g. "Every weekday at 7:00 AM". */
	plain_cadence: string;
}

export type ScheduleParseStatus =
	| "parsed"
	| "needs_clarification"
	| "not_a_request";

export interface ScheduleParseResult {
	status: ScheduleParseStatus;
	proposal: ScheduleProposal | null;
	question: string | null;
}

export const SCHEDULE_RECURRENCES = [
	"none",
	"hourly",
	"daily",
	"weekdays",
	"weekly",
] as const;

export type ScheduleRecurrence = (typeof SCHEDULE_RECURRENCES)[number];

/** True for the unified ids of builtin ambient tasks ("ambient:<name>"). */
export function isAmbientTaskId(id: string): boolean {
	return id.startsWith("ambient:");
}

/** True for reminder tasks (anything that is not an ambient id). */
export function isReminderTask(task: ScheduledTask): boolean {
	return task.kind === "reminder";
}

export const scheduledTasksApi = {
	/** Every scheduled thing in one shape, soonest next run first. */
	async list(): Promise<ScheduledTask[]> {
		return apiGet<ScheduledTask[]>("/scheduled-tasks");
	},

	async get(taskId: string): Promise<ScheduledTask> {
		return apiGet<ScheduledTask>(
			`/scheduled-tasks/${encodeURIComponent(taskId)}`,
		);
	},

	/** Create a reminder. Ambient tasks are builtin and cannot be created. */
	async create(data: ScheduledTaskCreate): Promise<ScheduledTask> {
		return apiPost<ScheduledTask>("/scheduled-tasks", data);
	},

	/**
	 * Partial update. For ambient tasks only `enabled` is accepted
	 * (the node rejects anything else with 422).
	 */
	async update(
		taskId: string,
		patch: ScheduledTaskUpdate,
	): Promise<ScheduledTask> {
		return apiPatch<ScheduledTask>(
			`/scheduled-tasks/${encodeURIComponent(taskId)}`,
			patch,
		);
	},

	/** Delete a reminder. Builtin ambient tasks cannot be deleted (422). */
	async remove(taskId: string): Promise<{ deleted_task: string }> {
		return apiDelete<{ deleted_task: string }>(
			`/scheduled-tasks/${encodeURIComponent(taskId)}`,
		);
	},

	/**
	 * Parse a natural-language scheduling request ("remind me every weekday
	 * at 7am") into a structured proposal, or a clarifying question.
	 * Deterministic on the node; ambiguous input is never guessed.
	 */
	async parse(text: string): Promise<ScheduleParseResult> {
		return apiPost<ScheduleParseResult>("/reminders/parse", { text });
	},
};
