import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { ScheduledTask } from "@/api/scheduledTasks";
import { ScheduledTaskRow } from "./ScheduledTaskRow";

jest.mock("expo-secure-store", () => ({}));

jest.mock("react-native", () => {
	const React = jest.requireActual("react") as typeof import("react");
	const stub = (name: string) => {
		const Stub = (props: { children?: unknown; [key: string]: unknown }) =>
			React.createElement(name, props, props.children as never);
		Stub.displayName = name;
		return Stub;
	};
	return {
		View: stub("View"),
		Text: stub("Text"),
		Pressable: stub("Pressable"),
		Switch: stub("Switch"),
		StyleSheet: { create: (s: unknown) => s },
	};
});

jest.mock("expo-haptics", () => ({
	impactAsync: jest.fn().mockResolvedValue(undefined),
	ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

jest.mock("@/theme", () => ({
	useTheme: () => ({
		colors: {
			primary: "#00aaff",
			primaryForeground: "#ffffff",
			muted: "#111111",
			mutedForeground: "#888888",
			background: "#000000",
			foreground: "#ffffff",
			card: "#222222",
			border: "#333333",
			destructive: "#ff0000",
		},
		isDark: true,
	}),
	typography: { micro: { fontSize: 11 }, uiLabel: { fontSize: 14 } },
}));

jest.mock("@/components/icons", () => ({
	EditIcon: () => null,
	TrashIcon: () => null,
}));

jest.mock("@/components/ui", () => ({
	IconButton: (props: { accessibilityLabel: string; onPress?: () => void }) =>
		createElement("IconButton", props),
}));

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
		next_run: Date.now() / 1000 + 3600,
		last_run: null,
		due_at: Date.now() / 1000 + 3600,
		note: "",
		...overrides,
	};
}

function renderRow(task: ScheduledTask) {
	const handlers = {
		onToggle: jest.fn(),
		onEdit: jest.fn(),
		onDelete: jest.fn(),
	};
	let renderer: ReturnType<typeof create> | null = null;
	act(() => {
		renderer = create(createElement(ScheduledTaskRow, { task, ...handlers }));
	});
	return { renderer: renderer as unknown as ReturnType<typeof create>, handlers };
}

function textsOf(root: ReactTestInstance): string[] {
	return root
		.findAllByType("Text")
		.map((n) => {
			const children = n.props.children;
			return Array.isArray(children) ? children.join("") : String(children ?? "");
		});
}

describe("ScheduledTaskRow", () => {
	it("renders title, cadence, and next-run line for a reminder", () => {
		const { renderer } = renderRow(taskFixture());
		const texts = textsOf(renderer.root);
		expect(texts.some((t) => t.includes("Standup"))).toBe(true);
		expect(texts.some((t) => t.includes("Every weekday at 9:00 AM"))).toBe(
			true,
		);
		expect(texts.some((t) => /Today|In \d+m|Due now/.test(t))).toBe(true);
	});

	it("offers edit and delete actions for reminders", () => {
		const { renderer, handlers } = renderRow(taskFixture());
		const buttons = renderer.root.findAllByType("IconButton");
		expect(buttons).toHaveLength(2);
		act(() => {
			(buttons[0].props.onPress as () => void)();
			(buttons[1].props.onPress as () => void)();
		});
		expect(handlers.onEdit).toHaveBeenCalledTimes(1);
		expect(handlers.onDelete).toHaveBeenCalledTimes(1);
	});

	it("hides edit/delete for ambient tasks and marks them builtin", () => {
		const { renderer } = renderRow(
			taskFixture({
				id: "ambient:morning_brief",
				kind: "ambient_task",
				title: "Morning brief",
				recurrence: null,
			}),
		);
		expect(renderer.root.findAllByType("IconButton")).toHaveLength(0);
		expect(textsOf(renderer.root).some((t) => t.includes("Builtin"))).toBe(
			true,
		);
	});

	it("omits the next-run line when the task is disabled", () => {
		const { renderer } = renderRow(taskFixture({ enabled: false }));
		const texts = textsOf(renderer.root);
		expect(texts.some((t) => /Today|Tomorrow|In \d/.test(t))).toBe(false);
	});

	it("picks up new handlers on re-render (callback deps)", () => {
		const first = { onToggle: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn() };
		const task = taskFixture();
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(createElement(ScheduledTaskRow, { task, ...first }));
		});
		const second = { onToggle: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn() };
		act(() => {
			(renderer as unknown as ReturnType<typeof create>).update(
				createElement(ScheduledTaskRow, { task, ...second }),
			);
		});
		const root = (renderer as unknown as ReturnType<typeof create>).root;
		const buttons = root.findAllByType("IconButton");
		act(() => {
			(buttons[0].props.onPress as () => void)();
			(buttons[1].props.onPress as () => void)();
			(
				root.findByType("Switch").props.onValueChange as (v: boolean) => void
			)(false);
		});
		expect(second.onEdit).toHaveBeenCalledTimes(1);
		expect(second.onDelete).toHaveBeenCalledTimes(1);
		expect(second.onToggle).toHaveBeenCalledWith(
			expect.objectContaining({ id: "r1" }),
			false,
		);
		expect(first.onEdit).not.toHaveBeenCalled();
		expect(first.onDelete).not.toHaveBeenCalled();
		expect(first.onToggle).not.toHaveBeenCalled();
	});

	it("toggles enabled state through the switch", () => {
		const { renderer, handlers } = renderRow(taskFixture());
		const toggle = renderer.root.findByType("Switch");
		act(() => {
			(toggle.props.onValueChange as (v: boolean) => void)(false);
		});
		expect(handlers.onToggle).toHaveBeenCalledWith(
			expect.objectContaining({ id: "r1" }),
			false,
		);
	});

	it("styles the row container and labels it for accessibility", () => {
		const { renderer } = renderRow(taskFixture({ title: "Standup" }));
		const container = renderer.root.findAllByType("View")[0];
		expect(container.props.style).toEqual({
			backgroundColor: "#222222",
			borderColor: "#333333",
			borderWidth: 1,
		});
		expect(container.props.accessibilityLabel).toBe(
			"Scheduled task: Standup",
		);
	});

	it("styles the title text", () => {
		const { renderer } = renderRow(taskFixture());
		const title = renderer.root.findAllByType("Text")[0];
		expect(title.props.style).toEqual([{ fontSize: 14 }, { color: "#ffffff" }]);
		expect(title.props.numberOfLines).toBe(1);
	});

	it("fires haptics on toggle, edit, and delete", () => {
		const { impactAsync } = jest.requireMock("expo-haptics") as {
			impactAsync: jest.Mock;
		};
		impactAsync.mockClear();
		const { renderer } = renderRow(taskFixture());
		const buttons = renderer.root.findAllByType("IconButton");
		act(() => {
			(buttons[0].props.onPress as () => void)();
			(buttons[1].props.onPress as () => void)();
			(
				renderer.root.findByType("Switch").props.onValueChange as (
					v: boolean,
				) => void
			)(false);
		});
		expect(impactAsync).toHaveBeenCalledTimes(3);
	});
});
