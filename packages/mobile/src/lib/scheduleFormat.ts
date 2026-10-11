/**
 * Pure helpers for the scheduled-tasks surface (Hark backlog item 4).
 * No React, no network: safe to unit test and to run through the
 * mutation gate.
 */

/**
 * Cheap client-side trigger: does this chat message look like a scheduling
 * request worth sending to POST /reminders/parse? Mirrors the node's
 * `_TRIGGER` regex ("remind me"); the node parser is the source of truth
 * and rejects anything it cannot parse deterministically.
 */
export function looksLikeScheduleRequest(text: string): boolean {
	return /\bremind\s+me\b/i.test(text);
}

/** Human label for a node recurrence value. */
export function recurrenceLabel(recurrence: string | null): string {
	switch (recurrence) {
		case "hourly":
			return "Hourly";
		case "daily":
			return "Daily";
		case "weekdays":
			return "Weekdays";
		case "weekly":
			return "Weekly";
		case "none":
			return "One time";
		default:
			return "Ambient";
	}
}

function formatClock(epochSeconds: number): string {
	const d = new Date(epochSeconds * 1000);
	let h = d.getHours();
	const m = d.getMinutes();
	const ap = h < 12 ? "AM" : "PM";
	h = h % 12 || 12;
	return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Glanceable next-run line for a task row. Returns null when the task is
 * not scheduled (disabled or no next run), so the row can omit the line.
 */
export function formatNextRun(
	nextRun: number | null,
	enabled: boolean,
	nowMs: number = Date.now(),
): string | null {
	if (!enabled || nextRun === null || nextRun === undefined) return null;
	const diffMs = nextRun * 1000 - nowMs;
	if (diffMs <= 0) return "Due now";
	const diffMin = Math.floor(diffMs / 60000);
	if (diffMin < 1) return "Due now";
	if (diffMin < 60) return `In ${diffMin}m`;
	const diffHours = Math.floor(diffMin / 60);
	const runDate = new Date(nextRun * 1000);
	const nowDate = new Date(nowMs);
	const sameDay = runDate.toDateString() === nowDate.toDateString();
	const tomorrow = new Date(nowMs + 86400000).toDateString();
	if (sameDay) return `Today ${formatClock(nextRun)}`;
	if (runDate.toDateString() === tomorrow)
		return `Tomorrow ${formatClock(nextRun)}`;
	if (diffHours < 24) return `In ${diffHours}h`;
	if (diffHours < 48) return `Tomorrow ${formatClock(nextRun)}`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 7) return `${WEEKDAYS[runDate.getDay()]} ${formatClock(nextRun)}`;
	return `${runDate.getMonth() + 1}/${runDate.getDate()} ${formatClock(nextRun)}`;
}

/**
 * Count of enabled tasks for the menu-row badge. Ambient tasks count too:
 * they are schedules the user chose to keep on.
 */
export function countEnabledTasks(
	tasks: Array<{ enabled: boolean }>,
): number {
	return tasks.filter((t) => t.enabled).length;
}
