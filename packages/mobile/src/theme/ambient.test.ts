import {
	getAmbientPalette,
	hexToRgb,
	mixHex,
	rgbToHex,
} from "./ambient";

/** Local date at an exact hour (minutes/seconds zeroed). */
function atHour(hour: number, minutes = 0): Date {
	const d = new Date(2026, 5, 15, 0, 0, 0, 0);
	d.setHours(hour, minutes, 0, 0);
	return d;
}

describe("hexToRgb", () => {
	it("parses lowercase hex", () => {
		expect(hexToRgb("#151313")).toEqual({ r: 0x15, g: 0x13, b: 0x13 });
	});

	it("parses uppercase hex", () => {
		expect(hexToRgb("#F8F7F3")).toEqual({ r: 0xf8, g: 0xf7, b: 0xf3 });
	});

	it("parses mixed case hex", () => {
		expect(hexToRgb("#aAbBcC")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
	});

	it("rejects missing hash", () => {
		expect(() => hexToRgb("151313")).toThrow(RangeError);
	});

	it("rejects short hex", () => {
		expect(() => hexToRgb("#fff")).toThrow(RangeError);
	});

	it("rejects non-hex characters", () => {
		expect(() => hexToRgb("#gggggg")).toThrow(RangeError);
	});

	it("rejects empty string", () => {
		expect(() => hexToRgb("")).toThrow(RangeError);
	});

	it("rejects a hex string with a prefix", () => {
		// Kills the mutant that drops the ^ anchor.
		expect(() => hexToRgb("xx#abcdef")).toThrow(RangeError);
	});

	it("rejects a hex string with a suffix", () => {
		// Kills the mutant that drops the $ anchor.
		expect(() => hexToRgb("#abcdef00")).toThrow(RangeError);
	});

	it("names the offending value in the error", () => {
		expect(() => hexToRgb("#zzzzzz")).toThrow(
			"Invalid hex color: #zzzzzz",
		);
	});
});

describe("rgbToHex", () => {
	it("formats channels as lowercase hex", () => {
		expect(rgbToHex(21, 19, 19)).toBe("#151313");
	});

	it("pads single digits", () => {
		expect(rgbToHex(1, 2, 3)).toBe("#010203");
	});

	it("rounds fractional channels", () => {
		expect(rgbToHex(20.6, 19.4, 18.5)).toBe("#151313");
	});

	it("clamps out-of-range channels", () => {
		expect(rgbToHex(-5, 300, 128)).toBe("#00ff80");
	});
});

describe("mixHex", () => {
	it("returns the first color at t=0", () => {
		expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
	});

	it("returns the second color at t=1", () => {
		expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
	});

	it("blends at the midpoint", () => {
		expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
	});

	it("clamps t below 0", () => {
		expect(mixHex("#000000", "#ffffff", -2)).toBe("#000000");
	});

	it("clamps t above 1", () => {
		expect(mixHex("#000000", "#ffffff", 7)).toBe("#ffffff");
	});

	it("blends each channel independently", () => {
		expect(mixHex("#ff0000", "#0000ff", 0.5)).toBe("#800080");
	});

	it("blends the green channel like the others", () => {
		// Both greens are nonzero so a +/- swap on green cannot hide.
		expect(mixHex("#102030", "#405060", 0.5)).toBe("#283848");
	});
});

describe("getAmbientPalette", () => {
	it("returns exact dark keyframe colors at keyframe hours", () => {
		expect(getAmbientPalette(atHour(12), true)).toEqual({
			top: "#201c18",
			bottom: "#151312",
		});
	});

	it("returns exact light keyframe colors at keyframe hours", () => {
		expect(getAmbientPalette(atHour(12), false)).toEqual({
			top: "#fbf9f3",
			bottom: "#f2efe3",
		});
	});

	it("returns exact keyframe colors at dawn", () => {
		expect(getAmbientPalette(atHour(6, 30), true)).toEqual({
			top: "#241a1a",
			bottom: "#161214",
		});
		expect(getAmbientPalette(atHour(6, 30), false)).toEqual({
			top: "#faedde",
			bottom: "#f1e3d1",
		});
	});

	it("returns exact keyframe colors at dusk and night", () => {
		expect(getAmbientPalette(atHour(18, 30), true)).toEqual({
			top: "#271b13",
			bottom: "#151110",
		});
		expect(getAmbientPalette(atHour(18, 30), false)).toEqual({
			top: "#f8e9d6",
			bottom: "#eedcbf",
		});
		expect(getAmbientPalette(atHour(0), false)).toEqual({
			top: "#f3f1ea",
			bottom: "#eae7dc",
		});
	});

	it("accounts for seconds in the time of day", () => {
		const date = new Date(2026, 5, 15, 12, 0, 30);
		const t = 30 / 3600 / 4.5;
		expect(getAmbientPalette(date, true)).toEqual({
			top: mixHex("#201c18", "#221b16", t),
			bottom: mixHex("#151312", "#141210", t),
		});
	});

	it("uses the night palette at midnight", () => {
		expect(getAmbientPalette(atHour(0), true)).toEqual({
			top: "#161414",
			bottom: "#121011",
		});
	});

	it("wraps the last keyframe back to midnight", () => {
		// 23:59 sits between the 20.5 evening and 24:00 night keyframes.
		const h = 23 + 59 / 60;
		const t = (h - 20.5) / 3.5;
		expect(getAmbientPalette(new Date(2026, 5, 15, 23, 59), true)).toEqual({
			top: mixHex("#1b1518", "#161414", t),
			bottom: mixHex("#121013", "#121011", t),
		});
	});

	it("interpolates smoothly between keyframes", () => {
		// 7:30 is halfway between the 6.5 dawn and 8.5 morning keyframes.
		const half = getAmbientPalette(atHour(7, 30), true);
		expect(half).toEqual({
			top: mixHex("#241a1a", "#1e1a17", 0.5),
			bottom: mixHex("#161214", "#141211", 0.5),
		});
	});

	it("dawn palette is warmer than night", () => {
		const dawn = hexToRgb(getAmbientPalette(atHour(7), true).top);
		const night = hexToRgb(getAmbientPalette(atHour(2), true).top);
		expect(dawn.r - dawn.b).toBeGreaterThan(night.r - night.b);
	});

	it("dusk palette is warmer than midday", () => {
		const dusk = hexToRgb(getAmbientPalette(atHour(19), true).top);
		const midday = hexToRgb(getAmbientPalette(atHour(12), true).top);
		expect(dusk.r - dusk.b).toBeGreaterThan(midday.r - midday.b);
	});

	it("selects palettes from local device time, not UTC", () => {
		// Noon local time must give the midday keyframe regardless of zone.
		const noon = new Date(2026, 5, 15, 12, 0, 0);
		expect(getAmbientPalette(noon, true).top).toBe("#201c18");
	});

	it("dark and light palettes differ", () => {
		const dark = getAmbientPalette(atHour(12), true);
		const light = getAmbientPalette(atHour(12), false);
		expect(dark.top).not.toBe(light.top);
		expect(dark.bottom).not.toBe(light.bottom);
	});

	it("palette stops stay near the theme background", () => {
		// Calm, not garish: dark stops must stay dark, light stops light.
		const dark = hexToRgb(getAmbientPalette(atHour(19), true).top);
		expect(dark.r).toBeLessThan(80);
		expect(dark.g).toBeLessThan(80);
		expect(dark.b).toBeLessThan(80);
		const light = hexToRgb(getAmbientPalette(atHour(19), false).top);
		expect(light.r).toBeGreaterThan(200);
		expect(light.g).toBeGreaterThan(200);
		expect(light.b).toBeGreaterThan(180);
	});
});
