/**
 * Ambient background palettes (backlog item 8: Hark-inspired ambient
 * adaptive background).
 *
 * The app background shifts with the local time of day through a calm
 * vertical gradient. Everything is computed on-device from the device
 * clock: no network calls, no location access, no new dependencies.
 * Weather reflection is explicitly out of scope.
 *
 * This module is intentionally free of React Native imports so the
 * palette math is unit-testable in plain Node/jest.
 */

export interface AmbientPalette {
	/** Gradient top stop, `#rrggbb`. */
	top: string;
	/** Gradient bottom stop, `#rrggbb`. */
	bottom: string;
}

interface AmbientKeyframe {
	/** Hour of day in [0, 24]. The table must be ascending and end at 24. */
	hour: number;
	/** [top, bottom] stops for the dark theme. */
	dark: [string, string];
	/** [top, bottom] stops for the light theme. */
	light: [string, string];
}

/**
 * Keyframe stops through the day. Dark stops stay close to the warmSand
 * dark background (#151313); light stops stay close to warmSand light
 * (#f8f7f3). Shifts are deliberately subtle: a calm tint, not a theme.
 */
const AMBIENT_KEYFRAMES: readonly AmbientKeyframe[] = [
	{ hour: 0, dark: ["#161414", "#121011"], light: ["#f3f1ea", "#eae7dc"] },
	{ hour: 5, dark: ["#171415", "#121011"], light: ["#f3f1ea", "#eae7dc"] },
	{ hour: 6.5, dark: ["#241a1a", "#161214"], light: ["#faedde", "#f1e3d1"] },
	{ hour: 8.5, dark: ["#1e1a17", "#141211"], light: ["#faf7f0", "#f0ece0"] },
	{ hour: 12, dark: ["#201c18", "#151312"], light: ["#fbf9f3", "#f2efe3"] },
	{ hour: 16.5, dark: ["#221b16", "#141210"], light: ["#faf5e9", "#f0e8d4"] },
	{ hour: 18.5, dark: ["#271b13", "#151110"], light: ["#f8e9d6", "#eedcbf"] },
	{ hour: 20.5, dark: ["#1b1518", "#121013"], light: ["#f2ece2", "#e7e0d0"] },
	{ hour: 24, dark: ["#161414", "#121011"], light: ["#f3f1ea", "#eae7dc"] },
];

/** Recompute cadence for the on-screen gradient. Palettes drift slowly. */
export const AMBIENT_REFRESH_MS = 60_000;

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

/**
 * Parse a `#rrggbb` color. Throws RangeError on anything else so typos in
 * the keyframe table fail loudly instead of rendering black.
 */
export function hexToRgb(hex: string): Rgb {
	const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
	if (!match) {
		throw new RangeError(`Invalid hex color: ${hex}`);
	}
	const value = parseInt(match[1], 16);
	return {
		r: (value >> 16) & 0xff,
		g: (value >> 8) & 0xff,
		b: value & 0xff,
	};
}

/** Format channels as lowercase `#rrggbb`, clamping and rounding. */
export function rgbToHex(r: number, g: number, b: number): string {
	const clamp = (n: number): number =>
		Math.max(0, Math.min(255, Math.round(n)));
	const packed =
		(1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b);
	return `#${packed.toString(16).slice(1)}`;
}

/** Linear blend of two hex colors; `t` is clamped to [0, 1]. */
export function mixHex(a: string, b: string, t: number): string {
	const clamped = Math.max(0, Math.min(1, t));
	const ca = hexToRgb(a);
	const cb = hexToRgb(b);
	return rgbToHex(
		ca.r + (cb.r - ca.r) * clamped,
		ca.g + (cb.g - ca.g) * clamped,
		ca.b + (cb.b - ca.b) * clamped,
	);
}

function hourOfDay(date: Date): number {
	return (
		date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
	);
}

/**
 * Palette for a moment in local device time. Between keyframes the stops
 * are linearly interpolated, so the background drifts continuously
 * instead of jumping at period boundaries.
 */
export function getAmbientPalette(date: Date, isDark: boolean): AmbientPalette {
	const h = hourOfDay(date);
	const frames = AMBIENT_KEYFRAMES;

	let index = 0;
	for (let k = 0; k < frames.length; k++) {
		if (frames[k].hour <= h) {
			index = k;
		}
	}
	const a = frames[index];
	const b = frames[(index + 1) % frames.length];
	const span = (b.hour - a.hour + 24) % 24 || 24;
	const t = ((((h - a.hour) % 24) + 24) % 24) / span;

	const stops: ReadonlyArray<readonly [string, string]> = isDark
		? [a.dark, b.dark]
		: [a.light, b.light];
	return {
		top: mixHex(stops[0][0], stops[1][0], t),
		bottom: mixHex(stops[0][1], stops[1][1], t),
	};
}
