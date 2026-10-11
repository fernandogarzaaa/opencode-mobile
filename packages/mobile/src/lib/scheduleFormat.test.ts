import {
	countEnabledTasks,
	formatNextRun,
	looksLikeScheduleRequest,
	recurrenceLabel,
} from "./scheduleFormat";

describe("looksLikeScheduleRequest", () => {
	it("matches the canonical trigger", () => {
		expect(looksLikeScheduleRequest("remind me every weekday at 7am")).toBe(
			true,
		);
	});

	it("matches case-insensitively with extra whitespace", () => {
		expect(looksLikeScheduleRequest("Remind   me tomorrow")).toBe(true);
	});

	it("rejects messages without the trigger", () => {
		expect(looksLikeScheduleRequest("set an alarm for 7am")).toBe(false);
		expect(looksLikeScheduleRequest("remember me when you can")).toBe(false);
		expect(looksLikeScheduleRequest("")).toBe(false);
	});

	it("requires a word boundary on both sides", () => {
		expect(looksLikeScheduleRequest("remind meter")).toBe(false);
	});
});

describe("recurrenceLabel", () => {
	it("labels every node recurrence", () => {
		expect(recurrenceLabel("none")).toBe("One time");
		expect(recurrenceLabel("hourly")).toBe("Hourly");
		expect(recurrenceLabel("daily")).toBe("Daily");
		expect(recurrenceLabel("weekdays")).toBe("Weekdays");
		expect(recurrenceLabel("weekly")).toBe("Weekly");
	});

	it("falls back for ambient tasks and unknown values", () => {
		expect(recurrenceLabel(null)).toBe("Ambient");
		expect(recurrenceLabel("monthly")).toBe("Ambient");
	});
});

describe("formatNextRun", () => {
	// Fixed "now": 2026-10-11 12:00:00 local.
	const NOW = new Date(2026, 9, 11, 12, 0, 0).getTime();
	const epoch = (ms: number) => ms / 1000;

	it("returns null when disabled or unscheduled", () => {
		expect(formatNextRun(epoch(NOW + 3600000), false, NOW)).toBeNull();
		expect(formatNextRun(null, true, NOW)).toBeNull();
	});

	it("says due now for past or imminent runs", () => {
		expect(formatNextRun(epoch(NOW - 1000), true, NOW)).toBe("Due now");
		expect(formatNextRun(epoch(NOW + 30000), true, NOW)).toBe("Due now");
	});

	it("shows minutes for sub-hour runs", () => {
		expect(formatNextRun(epoch(NOW + 30 * 60000), true, NOW)).toBe("In 30m");
	});

	it("shows today with clock time", () => {
		expect(formatNextRun(epoch(NOW + 3 * 3600000), true, NOW)).toBe(
			"Today 3:00 PM",
		);
	});

	it("shows tomorrow with clock time", () => {
		expect(formatNextRun(epoch(NOW + 20 * 3600000), true, NOW)).toBe(
			"Tomorrow 8:00 AM",
		);
	});

	it("shows weekday for runs within a week", () => {
		// +3 days: Wednesday Oct 14.
		expect(formatNextRun(epoch(NOW + 3 * 86400000), true, NOW)).toBe(
			"Wed 12:00 PM",
		);
	});

	it("names each weekday correctly", () => {
		// Oct 11 2026 is a Sunday; walk the week at 3:30 PM (after NOW).
		const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		for (let i = 0; i < 7; i++) {
			const at = new Date(2026, 9, 11 + i, 15, 30, 0).getTime();
			const line = formatNextRun(epoch(at), true, NOW);
			if (i === 0) {
				expect(line).toBe("Today 3:30 PM");
			} else if (i === 1) {
				expect(line).toBe("Tomorrow 3:30 PM");
			} else {
				expect(line).toBe(`${names[i]} 3:30 PM`);
			}
		}
	});

	it("hits the minute and hour boundaries", () => {
		// Exactly 60 minutes out: the <60 branch is exclusive.
		expect(formatNextRun(epoch(NOW + 60 * 60000), true, NOW)).toBe(
			"Today 1:00 PM",
		);
		// Exactly now-ish edge: zero and negative diffs are due.
		expect(formatNextRun(epoch(NOW), true, NOW)).toBe("Due now");
	});

	it("treats an undefined next run as unscheduled", () => {
		expect(
			formatNextRun(undefined as unknown as null, true, NOW),
		).toBeNull();
	});

	it("names Sunday and Monday from a Friday reference", () => {
		// Friday Oct 9 2026, 12:00 local; +2d = Sunday, +3d = Monday.
		const friday = new Date(2026, 9, 9, 12, 0, 0).getTime();
		expect(formatNextRun(epoch(friday + 2 * 86400000), true, friday)).toBe(
			"Sun 12:00 PM",
		);
		expect(formatNextRun(epoch(friday + 3 * 86400000), true, friday)).toBe(
			"Mon 12:00 PM",
		);
	});

	it("rounds a single minute up to In 1m, not due", () => {
		// 90s out: diffMin is 1, which is not < 1.
		expect(formatNextRun(epoch(NOW + 90000), true, NOW)).toBe("In 1m");
	});

	it("shows a date for runs beyond a week", () => {
		// +10 days: Oct 21.
		const line = formatNextRun(epoch(NOW + 10 * 86400000), true, NOW);
		expect(line).toMatch(/^10\/21 \d{1,2}:\d{2} (AM|PM)$/);
	});
});

describe("countEnabledTasks", () => {
	it("counts only enabled tasks", () => {
		expect(
			countEnabledTasks([
				{ enabled: true },
				{ enabled: false },
				{ enabled: true },
			]),
		).toBe(2);
	});

	it("returns 0 for an empty list", () => {
		expect(countEnabledTasks([])).toBe(0);
	});
});
