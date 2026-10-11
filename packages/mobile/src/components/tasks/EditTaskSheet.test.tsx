import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ScheduledTask } from "@/api/scheduledTasks";
import { EditTaskSheet } from "./EditTaskSheet";

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
		TextInput: stub("TextInput"),
		Modal: stub("Modal"),
		StyleSheet: { create: (s: unknown) => s },
	};
});

jest.mock("expo-secure-store", () => ({}));

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
			foreground: "#ffffff",
			card: "#222222",
			destructive: "#ff0000",
		},
	}),
	typography: { micro: { fontSize: 11 }, uiLabel: { fontSize: 14 } },
}));

jest.mock("@/components/icons", () => ({
	XIcon: () => null,
}));

jest.mock("@/components/ui", () => ({
	IconButton: (props: { accessibilityLabel: string; onPress?: () => void }) =>
		createElement("IconButton", props),
}));

function taskFixture(): ScheduledTask {
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
		note: "team sync",
	};
}

async function flush() {
	await act(async () => {
		await Promise.resolve();
	});
}

function renderSheet(overrides: {
	onSave?: (patch: {
		title: string;
		note: string;
		recurrence: string;
		enabled: boolean;
	}) => Promise<void>;
	onClose?: () => void;
} = {}) {
	const onSave =
		overrides.onSave ?? jest.fn().mockResolvedValue(undefined);
	const onClose = overrides.onClose ?? jest.fn();
	let renderer: ReturnType<typeof create> | null = null;
	act(() => {
		renderer = create(
			createElement(EditTaskSheet, {
				task: taskFixture(),
				visible: true,
				onClose,
				onSave,
			}),
		);
	});
	return {
		renderer: renderer as unknown as ReturnType<typeof create>,
		onSave: onSave as jest.Mock,
		onClose: onClose as jest.Mock,
	};
}

function findSaveButton(root: ReturnType<typeof create>["root"]) {
	return root.findByProps({ accessibilityLabel: "Save reminder changes" });
}

describe("EditTaskSheet", () => {
	it("prefills title, note, and recurrence from the task", () => {
		const { renderer } = renderSheet();
		const inputs = renderer.root.findAllByType("TextInput");
		expect(inputs[0].props.value).toBe("Standup");
		expect(inputs[1].props.value).toBe("team sync");
		const weekdays = renderer.root.findByProps({
			accessibilityLabel: "Recurrence Weekdays",
		});
		expect(weekdays.props.accessibilityState).toEqual({ selected: true });
	});

	it("saves the edited patch and closes", async () => {
		const { renderer, onSave, onClose } = renderSheet();
		const inputs = renderer.root.findAllByType("TextInput");
		act(() => {
			(inputs[0].props.onChangeText as (t: string) => void)("New title");
		});
		const daily = renderer.root.findByProps({
			accessibilityLabel: "Recurrence Daily",
		});
		act(() => {
			(daily.props.onPress as () => void)();
		});
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		await flush();
		expect(onSave).toHaveBeenCalledWith({
			title: "New title",
			note: "team sync",
			recurrence: "daily",
			enabled: true,
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("refuses to save with an empty title", async () => {
		const { renderer, onSave, onClose } = renderSheet();
		const inputs = renderer.root.findAllByType("TextInput");
		act(() => {
			(inputs[0].props.onChangeText as (t: string) => void)("   ");
		});
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		await flush();
		expect(onSave).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		const texts = renderer.root
			.findAllByType("Text")
			.map((n) => {
				const c = n.props.children;
				return Array.isArray(c) ? c.join("") : String(c ?? "");
			});
		expect(texts.some((t) => t.includes("Title cannot be empty"))).toBe(true);
	});

	it("toggles the enabled switch", async () => {
		const { renderer, onSave } = renderSheet();
		const sw = renderer.root.findByProps({
			accessibilityLabel: "Reminder enabled",
		});
		act(() => {
			(sw.props.onValueChange as (v: boolean) => void)(false);
		});
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		await flush();
		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({ enabled: false }),
		);
	});

	it("surfaces save failures without closing", async () => {
		const { renderer, onSave, onClose } = renderSheet({
			onSave: jest.fn().mockRejectedValue(new Error("node is down")),
		});
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		await flush();
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();
		const texts = renderer.root
			.findAllByType("Text")
			.map((n) => {
				const c = n.props.children;
				return Array.isArray(c) ? c.join("") : String(c ?? "");
			});
		expect(texts.some((t) => t.includes("node is down"))).toBe(true);
	});

	it("closes via the dismiss control", () => {
		const { renderer, onClose } = renderSheet();
		const close = renderer.root.findByProps({
			accessibilityLabel: "Close edit sheet",
		});
		act(() => {
			(close.props.onPress as () => void)();
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("defaults note and recurrence when the task has none", () => {
		const onSave = jest.fn().mockResolvedValue(undefined);
		const onClose = jest.fn();
		const task = { ...taskFixture(), note: "", recurrence: null };
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(
				createElement(EditTaskSheet, {
					task,
					visible: true,
					onClose,
					onSave,
				}),
			);
		});
		const root = (renderer as unknown as ReturnType<typeof create>).root;
		const inputs = root.findAllByType("TextInput");
		expect(inputs[1].props.value).toBe("");
		const oneTime = root.findByProps({
			accessibilityLabel: "Recurrence One time",
		});
		expect(oneTime.props.accessibilityState).toEqual({ selected: true });
	});

	it("shows saving state while the save is in flight", async () => {
		let resolveSave!: () => void;
		const onSave = jest.fn(
			() => new Promise<void>((r) => (resolveSave = r)),
		);
		const { renderer } = renderSheet({ onSave });
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		const texts = () =>
			renderer.root.findAllByType("Text").map((n) => {
				const c = n.props.children;
				return Array.isArray(c) ? c.join("") : String(c ?? "");
			});
		expect(texts().some((t) => t.includes("Saving..."))).toBe(true);
		await act(async () => {
			resolveSave();
			await Promise.resolve();
		});
		expect(texts().some((t) => t === "Save")).toBe(true);
	});

	it("does not close while a save is in flight", async () => {
		let resolveSave!: () => void;
		const onSave = jest.fn(
			() => new Promise<void>((r) => (resolveSave = r)),
		);
		const onClose = jest.fn();
		const { renderer } = renderSheet({ onSave, onClose });
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		const close = renderer.root.findByProps({
			accessibilityLabel: "Close edit sheet",
		});
		act(() => {
			(close.props.onPress as () => void)();
		});
		expect(onClose).not.toHaveBeenCalled();
		await act(async () => {
			resolveSave();
			await Promise.resolve();
		});
	});

	it("clears a previous error on close", async () => {
		const { renderer } = renderSheet();
		const inputs = renderer.root.findAllByType("TextInput");
		act(() => {
			(inputs[0].props.onChangeText as (t: string) => void)("   ");
		});
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		await flush();
		const texts = () =>
			renderer.root.findAllByType("Text").map((n) => {
				const c = n.props.children;
				return Array.isArray(c) ? c.join("") : String(c ?? "");
			});
		expect(texts().some((t) => t.includes("Title cannot be empty"))).toBe(true);
		const close = renderer.root.findByProps({
			accessibilityLabel: "Close edit sheet",
		});
		act(() => {
			(close.props.onPress as () => void)();
		});
		expect(texts().some((t) => t.includes("Title cannot be empty"))).toBe(
			false,
		);
	});

	it("clears a previous error on a successful save", async () => {
		const { renderer, onSave } = renderSheet();
		const inputs = renderer.root.findAllByType("TextInput");
		act(() => {
			(inputs[0].props.onChangeText as (t: string) => void)("   ");
		});
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		await flush();
		act(() => {
			(inputs[0].props.onChangeText as (t: string) => void)("Fixed");
		});
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		await flush();
		expect(onSave).toHaveBeenCalledTimes(1);
		const texts = renderer.root.findAllByType("Text").map((n) => {
			const c = n.props.children;
			return Array.isArray(c) ? c.join("") : String(c ?? "");
		});
		expect(texts.some((t) => t.includes("Title cannot be empty"))).toBe(false);
	});

	it("picks up a new onClose on re-render", () => {
		const firstClose = jest.fn();
		const task = taskFixture();
		const onSave = jest.fn().mockResolvedValue(undefined);
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(
				createElement(EditTaskSheet, {
					task,
					visible: true,
					onClose: firstClose,
					onSave,
				}),
			);
		});
		const secondClose = jest.fn();
		act(() => {
			(renderer as unknown as ReturnType<typeof create>).update(
				createElement(EditTaskSheet, {
					task,
					visible: true,
					onClose: secondClose,
					onSave,
				}),
			);
		});
		const root = (renderer as unknown as ReturnType<typeof create>).root;
		act(() => {
			(
				root.findByProps({ accessibilityLabel: "Close edit sheet" }).props
					.onPress as () => void
			)();
		});
		expect(secondClose).toHaveBeenCalledTimes(1);
		expect(firstClose).not.toHaveBeenCalled();
	});

	it("fires haptics on save", async () => {
		const { impactAsync } = jest.requireMock("expo-haptics") as {
			impactAsync: jest.Mock;
		};
		impactAsync.mockClear();
		const { renderer } = renderSheet();
		act(() => {
			(findSaveButton(renderer.root).props.onPress as () => void)();
		});
		await flush();
		expect(impactAsync).toHaveBeenCalled();
	});
});
