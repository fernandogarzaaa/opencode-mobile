import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { SettingsRow } from "./settings-row";

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
			foreground: "#ffffff",
			card: "#222222",
			destructive: "#ff0000",
		},
	}),
	typography: { micro: { fontSize: 11 }, uiLabel: { fontSize: 14 } },
	MobileSizes: { buttonMd: 44 },
	SemanticSpacing: { gapSm: 8 },
}));

jest.mock("@/components/icons", () => ({
	ChevronRightIcon: () => null,
}));

function renderRow(props: Parameters<typeof SettingsRow>[0]) {
	let renderer: ReturnType<typeof create> | null = null;
	act(() => {
		renderer = create(createElement(SettingsRow, props));
	});
	return renderer as unknown as ReturnType<typeof create>;
}

function allText(root: ReturnType<typeof create>["root"]): string[] {
	return root.findAllByType("Text").map((n) => {
		const c = n.props.children;
		return Array.isArray(c) ? c.join("") : String(c ?? "");
	});
}

describe("SettingsRow", () => {
	it("renders a navigation row with title and chevron", () => {
		const onPress = jest.fn();
		const root = renderRow({ title: "Appearance", onPress }).root;
		expect(allText(root)).toContain("Appearance");
		expect(root.findAllByType("Pressable")).toHaveLength(1);
	});

	it("fires onPress on the navigation row", () => {
		const onPress = jest.fn();
		const root = renderRow({ title: "Appearance", onPress }).root;
		act(() => {
			(root.findByType("Pressable").props.onPress as () => void)();
		});
		expect(onPress).toHaveBeenCalledTimes(1);
	});

	it("shows the value text on the right", () => {
		const root = renderRow({ title: "Version", value: "1.2.3" }).root;
		expect(allText(root)).toContain("1.2.3");
	});

	it("shows the count badge when badge > 0", () => {
		const root = renderRow({
			title: "Scheduled Tasks",
			badge: 3,
			onPress: jest.fn(),
		}).root;
		expect(allText(root).some((t) => t === "3")).toBe(true);
	});

	it("caps the badge at 99+", () => {
		const root = renderRow({
			title: "Scheduled Tasks",
			badge: 120,
			onPress: jest.fn(),
		}).root;
		expect(allText(root).some((t) => t === "99+")).toBe(true);
	});

	it("hides the badge when badge is 0 or undefined", () => {
		const zero = renderRow({
			title: "Scheduled Tasks",
			badge: 0,
			onPress: jest.fn(),
		}).root;
		expect(allText(zero).some((t) => t === "0")).toBe(false);
		const undef = renderRow({ title: "Appearance", onPress: jest.fn() }).root;
		const badgeViews = undef.findAllByType("View").filter((v) => {
			const style = v.props.style as Record<string, unknown> | undefined;
			return style?.borderRadius === 11;
		});
		expect(badgeViews).toHaveLength(0);
	});

	it("renders a toggle row with a working switch", () => {
		const onToggleChange = jest.fn();
		const root = renderRow({
			title: "Enabled",
			toggle: true,
			onToggleChange,
		}).root;
		const sw = root.findByType("Switch");
		expect(sw.props.value).toBe(true);
		act(() => {
			(sw.props.onValueChange as (v: boolean) => void)(false);
		});
		expect(onToggleChange).toHaveBeenCalledWith(false);
	});

	it("does not show value text on toggle rows", () => {
		const root = renderRow({
			title: "Enabled",
			toggle: false,
			onToggleChange: jest.fn(),
		}).root;
		// No chevron on toggle rows either.
		expect(root.findAllByType("Pressable")).toHaveLength(0);
	});

	it("renders a static row without pressable", () => {
		const root = renderRow({ title: "Version", value: "1.2.3" }).root;
		expect(root.findAllByType("Pressable")).toHaveLength(0);
		expect(allText(root)).toContain("Version");
	});

	it("applies the row layout styles", () => {
		const root = renderRow({ title: "Version", value: "1.2.3" }).root;
		const outer = root.findAllByType("View")[0];
		expect(outer.props.style).toEqual({
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			minHeight: 44,
			paddingVertical: 8,
		});
	});

	it("styles the title text and limits it to one line", () => {
		const root = renderRow({ title: "Version", value: "1.2.3" }).root;
		const title = root.findAllByType("Text")[0];
		expect(title.props.style).toEqual([
			{ fontSize: 14 },
			{ color: "#ffffff" },
		]);
		expect(title.props.numberOfLines).toBe(1);
	});

	it("uses the destructive color for destructive rows", () => {
		const root = renderRow({
			title: "Disconnect",
			destructive: true,
			onPress: jest.fn(),
		}).root;
		const title = root.findAllByType("Text")[0];
		expect(title.props.style).toEqual([{ fontSize: 14 }, { color: "#ff0000" }]);
	});

	it("styles the value text", () => {
		const root = renderRow({ title: "Version", value: "1.2.3" }).root;
		const texts = root.findAllByType("Text");
		const value = texts.find((t) => {
			const c = t.props.children;
			return (Array.isArray(c) ? c.join("") : String(c ?? "")) === "1.2.3";
		});
		expect(value?.props.style).toEqual([{ fontSize: 14 }, { color: "#888888" }]);
	});

	it("styles the badge pill", () => {
		const root = renderRow({
			title: "Scheduled Tasks",
			badge: 3,
			onPress: jest.fn(),
		}).root;
		const badgeView = root.findByProps({
			accessibilityLabel: "3 scheduled tasks",
		});
		expect(badgeView.props.style).toEqual({
			minWidth: 22,
			height: 22,
			borderRadius: 11,
			backgroundColor: "#00aaff",
			alignItems: "center",
			justifyContent: "center",
			paddingHorizontal: 6,
		});
	});

	it("styles the badge text", () => {
		const root = renderRow({
			title: "Scheduled Tasks",
			badge: 3,
			onPress: jest.fn(),
		}).root;
		const badgeView = root.findByProps({
			accessibilityLabel: "3 scheduled tasks",
		});
		const badgeText = badgeView.findByType("Text");
		expect(badgeText.props.style).toEqual([
			{ fontSize: 14 },
			{ color: "#ffffff", fontSize: 12 },
		]);
	});

	it("dims the navigation row while pressed", () => {
		const root = renderRow({ title: "Appearance", onPress: jest.fn() }).root;
		const pressable = root.findByType("Pressable");
		const styleFn = pressable.props.style as (s: {
			pressed: boolean;
		}) => { opacity: number };
		expect(styleFn({ pressed: true })).toEqual({ opacity: 0.6 });
		expect(styleFn({ pressed: false })).toEqual({ opacity: 1 });
	});

	it("styles the switch", () => {
		const root = renderRow({
			title: "Enabled",
			toggle: true,
			onToggleChange: jest.fn(),
		}).root;
		const sw = root.findByType("Switch");
		expect(sw.props.trackColor).toEqual({
			false: "#111111",
			true: "#00aaff",
		});
		expect(sw.props.thumbColor).toBe("#222222");
		expect(sw.props.ios_backgroundColor).toBe("#111111");
	});

	it("treats an explicitly undefined toggle as a static row", () => {
		const root = renderRow({
			title: "Maybe",
			toggle: undefined as unknown as boolean,
			onToggleChange: jest.fn(),
		}).root;
		expect(root.findAllByType("Switch")).toHaveLength(0);
		expect(root.findAllByType("Pressable")).toHaveLength(0);
	});

	it("treats an explicitly undefined onPress as a static row", () => {
		const root = renderRow({
			title: "Maybe",
			onPress: undefined as unknown as () => void,
		}).root;
		expect(root.findAllByType("Pressable")).toHaveLength(0);
	});

	it("fires haptics on navigation press", async () => {
		const { impactAsync } = jest.requireMock("expo-haptics") as {
			impactAsync: jest.Mock;
		};
		impactAsync.mockClear();
		const root = renderRow({ title: "Appearance", onPress: jest.fn() }).root;
		act(() => {
			(root.findByType("Pressable").props.onPress as () => void)();
		});
		expect(impactAsync).toHaveBeenCalled();
	});

	it("fires haptics on toggle change", async () => {
		const { impactAsync } = jest.requireMock("expo-haptics") as {
			impactAsync: jest.Mock;
		};
		impactAsync.mockClear();
		const root = renderRow({
			title: "Enabled",
			toggle: true,
			onToggleChange: jest.fn(),
		}).root;
		act(() => {
			(root.findByType("Switch").props.onValueChange as (v: boolean) => void)(
				false,
			);
		});
		expect(impactAsync).toHaveBeenCalled();
	});
});
