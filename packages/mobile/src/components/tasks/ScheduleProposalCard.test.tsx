import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ScheduleProposal } from "@/api/scheduledTasks";
import { ScheduleProposalCard } from "./ScheduleProposalCard";

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
		},
		isDark: true,
	}),
	typography: { micro: { fontSize: 11 }, uiLabel: { fontSize: 14 } },
}));

jest.mock("@/components/icons", () => ({
	CheckIcon: () => null,
	ClockIcon: () => null,
	XIcon: () => null,
}));

function proposalFixture(): ScheduleProposal {
	return {
		title: "Water plants",
		note: "",
		due_at: 1790000000,
		recurrence: "weekdays",
		plain_cadence: "Every weekday at 7:00 AM",
	};
}

describe("ScheduleProposalCard", () => {
	it("shows the proposal title and plain-words cadence", () => {
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(
				createElement(ScheduleProposalCard, {
					proposal: proposalFixture(),
					onConfirm: jest.fn(),
					onCancel: jest.fn(),
				}),
			);
		});
		const texts = (renderer as unknown as ReturnType<typeof create>).root
			.findAllByType("Text")
			.map((n) => {
				const c = n.props.children;
				return Array.isArray(c) ? c.join("") : String(c ?? "");
			});
		expect(texts.some((t) => t.includes("Water plants"))).toBe(true);
		expect(texts.some((t) => t.includes("Every weekday at 7:00 AM"))).toBe(
			true,
		);
	});

	it("confirms and cancels through the buttons", () => {
		const onConfirm = jest.fn();
		const onCancel = jest.fn();
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(
				createElement(ScheduleProposalCard, {
					proposal: proposalFixture(),
					onConfirm,
					onCancel,
				}),
			);
		});
		const root = (renderer as unknown as ReturnType<typeof create>).root;
		const confirm = root.findByProps({
			accessibilityLabel: "Confirm schedule: Water plants",
		});
		const cancel = root.findByProps({ accessibilityLabel: "Cancel schedule proposal" });
		act(() => {
			(confirm.props.onPress as () => void)();
			(cancel.props.onPress as () => void)();
		});
		expect(onConfirm).toHaveBeenCalledTimes(1);
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("picks up new handlers on re-render (callback deps)", () => {
		const firstConfirm = jest.fn();
		const firstCancel = jest.fn();
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(
				createElement(ScheduleProposalCard, {
					proposal: proposalFixture(),
					onConfirm: firstConfirm,
					onCancel: firstCancel,
				}),
			);
		});
		const root = () => (renderer as unknown as ReturnType<typeof create>).root;
		const secondConfirm = jest.fn();
		const secondCancel = jest.fn();
		act(() => {
			(renderer as unknown as ReturnType<typeof create>).update(
				createElement(ScheduleProposalCard, {
					proposal: proposalFixture(),
					onConfirm: secondConfirm,
					onCancel: secondCancel,
				}),
			);
		});
		act(() => {
			(
				root().findByProps({
					accessibilityLabel: "Confirm schedule: Water plants",
				}).props.onPress as () => void
			)();
			(
				root().findByProps({ accessibilityLabel: "Cancel schedule proposal" })
					.props.onPress as () => void
			)();
		});
		expect(secondConfirm).toHaveBeenCalledTimes(1);
		expect(secondCancel).toHaveBeenCalledTimes(1);
		expect(firstConfirm).not.toHaveBeenCalled();
		expect(firstCancel).not.toHaveBeenCalled();
	});

	it("disables both buttons while confirming", () => {
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(
				createElement(ScheduleProposalCard, {
					proposal: proposalFixture(),
					onConfirm: jest.fn(),
					onCancel: jest.fn(),
					isConfirming: true,
				}),
			);
		});
		const root = (renderer as unknown as ReturnType<typeof create>).root;
		const pressables = root.findAllByType("Pressable");
		expect(pressables.length).toBeGreaterThan(0);
		for (const p of pressables) {
			expect(p.props.disabled).toBe(true);
		}
		const texts = root
			.findAllByType("Text")
			.map((n) => {
				const c = n.props.children;
				return Array.isArray(c) ? c.join("") : String(c ?? "");
			});
		expect(texts.some((t) => t.includes("Scheduling..."))).toBe(true);
	});

	it("styles the card container", () => {
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(
				createElement(ScheduleProposalCard, {
					proposal: proposalFixture(),
					onConfirm: jest.fn(),
					onCancel: jest.fn(),
				}),
			);
		});
		const root = (renderer as unknown as ReturnType<typeof create>).root;
		const container = root.findAllByType("View")[0];
		expect(container.props.style).toEqual({
			backgroundColor: "#222222",
			borderColor: "#333333",
			borderWidth: 1,
		});
	});

	it("styles the title and cadence text", () => {
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(
				createElement(ScheduleProposalCard, {
					proposal: proposalFixture(),
					onConfirm: jest.fn(),
					onCancel: jest.fn(),
				}),
			);
		});
		const root = (renderer as unknown as ReturnType<typeof create>).root;
		const texts = root.findAllByType("Text");
		const title = texts.find((t) => {
			const c = t.props.children;
			return (Array.isArray(c) ? c.join("") : String(c ?? "")).includes(
				"Water plants",
			);
		});
		expect(title?.props.style).toEqual([{ fontSize: 14 }, { color: "#ffffff" }]);
		const cadence = texts.find((t) => {
			const c = t.props.children;
			return (Array.isArray(c) ? c.join("") : String(c ?? "")).includes(
				"Every weekday",
			);
		});
		expect(cadence?.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#888888" },
		]);
	});

	it("dims the confirm button while confirming", () => {
		const render = (isConfirming: boolean) => {
			let renderer: ReturnType<typeof create> | null = null;
			act(() => {
				renderer = create(
					createElement(ScheduleProposalCard, {
						proposal: proposalFixture(),
						onConfirm: jest.fn(),
						onCancel: jest.fn(),
						isConfirming,
					}),
				);
			});
			return (renderer as unknown as ReturnType<typeof create>).root;
		};
		const idle = render(false).findByProps({
			accessibilityLabel: "Confirm schedule: Water plants",
		});
		expect(idle.props.style).toEqual({
			backgroundColor: "#00aaff",
			opacity: 1,
		});
		const busy = render(true).findByProps({
			accessibilityLabel: "Confirm schedule: Water plants",
		});
		expect(busy.props.style).toEqual({
			backgroundColor: "#00aaff",
			opacity: 0.6,
		});
	});

	it("fires haptics on confirm and cancel", () => {
		const { impactAsync } = jest.requireMock("expo-haptics") as {
			impactAsync: jest.Mock;
		};
		impactAsync.mockClear();
		let renderer: ReturnType<typeof create> | null = null;
		act(() => {
			renderer = create(
				createElement(ScheduleProposalCard, {
					proposal: proposalFixture(),
					onConfirm: jest.fn(),
					onCancel: jest.fn(),
				}),
			);
		});
		const root = (renderer as unknown as ReturnType<typeof create>).root;
		act(() => {
			(
				root.findByProps({
					accessibilityLabel: "Confirm schedule: Water plants",
				}).props.onPress as () => void
			)();
		});
		expect(impactAsync).toHaveBeenCalledTimes(1);
		act(() => {
			(
				root.findByProps({ accessibilityLabel: "Cancel schedule proposal" })
					.props.onPress as () => void
			)();
		});
		expect(impactAsync).toHaveBeenCalledTimes(2);
	});
});
