import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { AMBIENT_REFRESH_MS, getAmbientPalette } from "@/theme/ambient";
import { AmbientBackground } from "./AmbientBackground";

// react-test-renderer requires an explicit act environment flag.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const themeState = { isDark: true };

jest.mock("@/theme", () => ({
	__esModule: true,
	useTheme: () => ({ isDark: themeState.isDark }),
}));

jest.mock("react-native", () => ({
	__esModule: true,
	StyleSheet: {
		create: <T extends Record<string, unknown>>(styles: T): T => styles,
	},
}));

jest.mock("expo-linear-gradient", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	function LinearGradient(props: Record<string, unknown>) {
		return React.createElement("LinearGradient", props);
	}
	return { __esModule: true, LinearGradient };
});

function atNoon(): Date {
	return new Date(2026, 5, 15, 12, 0, 0);
}

function gradientOf(renderer: ReactTestRenderer): {
	colors: string[];
	start: { x: number; y: number };
	end: { x: number; y: number };
	style: unknown;
} {
	const node = renderer.root.findByType("LinearGradient");
	return node.props as {
		colors: string[];
		start: { x: number; y: number };
		end: { x: number; y: number };
		style: unknown;
	};
}

function renderBackground(): ReactTestRenderer {
	let renderer: ReactTestRenderer | undefined;
	act(() => {
		renderer = create(
			createElement(AmbientBackground, null, createElement("child")),
		);
	});
	if (!renderer) {
		throw new Error("failed to render AmbientBackground");
	}
	return renderer;
}

beforeEach(() => {
	themeState.isDark = true;
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

describe("AmbientBackground", () => {
	it("renders the dark time-of-day palette on mount", () => {
		jest.setSystemTime(atNoon());
		const renderer = renderBackground();
		const expected = getAmbientPalette(atNoon(), true);
		expect(gradientOf(renderer).colors).toEqual([
			expected.top,
			expected.bottom,
		]);
		renderer.unmount();
	});

	it("renders the light palette when the theme is light", () => {
		themeState.isDark = false;
		jest.setSystemTime(atNoon());
		const renderer = renderBackground();
		const expected = getAmbientPalette(atNoon(), false);
		expect(gradientOf(renderer).colors).toEqual([
			expected.top,
			expected.bottom,
		]);
		renderer.unmount();
	});

	it("updates the palette when the theme changes", () => {
		jest.setSystemTime(atNoon());
		const renderer = renderBackground();
		const darkColors = gradientOf(renderer).colors;

		themeState.isDark = false;
		act(() => {
			renderer.update(
				createElement(AmbientBackground, null, createElement("child")),
			);
		});

		const lightColors = gradientOf(renderer).colors;
		expect(lightColors).not.toEqual(darkColors);
		expect(lightColors).toEqual([
			getAmbientPalette(atNoon(), false).top,
			getAmbientPalette(atNoon(), false).bottom,
		]);
		renderer.unmount();
	});

	it("refreshes the palette as time passes", () => {
		jest.setSystemTime(new Date(2026, 5, 15, 9, 0, 0));
		const renderer = renderBackground();
		const before = gradientOf(renderer).colors;

		act(() => {
			jest.advanceTimersByTime(3 * 3_600_000);
		});

		const afterDate = new Date(2026, 5, 15, 12, 0, 0);
		const expected = getAmbientPalette(afterDate, true);
		expect(gradientOf(renderer).colors).toEqual([
			expected.top,
			expected.bottom,
		]);
		expect(gradientOf(renderer).colors).not.toEqual(before);
		renderer.unmount();
	});

	it("clears its refresh timer on unmount", () => {
		jest.setSystemTime(atNoon());
		const clearSpy = jest.spyOn(globalThis, "clearInterval");
		const renderer = renderBackground();
		act(() => {
			renderer.unmount();
		});
		expect(clearSpy).toHaveBeenCalled();
		clearSpy.mockRestore();
	});

	it("renders children inside the gradient", () => {
		jest.setSystemTime(atNoon());
		const renderer = renderBackground();
		expect(renderer.root.findByType("child")).toBeDefined();
		renderer.unmount();
	});

	it("uses a vertical gradient", () => {
		jest.setSystemTime(atNoon());
		const renderer = renderBackground();
		const props = gradientOf(renderer);
		expect(props.start).toEqual({ x: 0.5, y: 0 });
		expect(props.end).toEqual({ x: 0.5, y: 1 });
		renderer.unmount();
	});

	it("merges the style prop over the fill style", () => {
		jest.setSystemTime(atNoon());
		let renderer: ReactTestRenderer | undefined;
		act(() => {
			renderer = create(
				createElement(
					AmbientBackground,
					{ style: { opacity: 0.5 } },
					createElement("child"),
				),
			);
		});
		if (!renderer) {
			throw new Error("failed to render AmbientBackground");
		}
		expect(gradientOf(renderer).style).toEqual([
			{ flex: 1 },
			{ opacity: 0.5 },
		]);
		renderer.unmount();
	});

	it("recomputes on the documented refresh cadence", () => {
		expect(AMBIENT_REFRESH_MS).toBe(60_000);
	});
});
