import { formatFileSize, getFileExtension } from "./fileUtils";

describe("formatFileSize", () => {
	it("formats bytes below one kilobyte", () => {
		expect(formatFileSize(0)).toBe("0 B");
		expect(formatFileSize(512)).toBe("512 B");
	});

	it("switches to kilobytes at exactly 1024 bytes", () => {
		expect(formatFileSize(1023)).toBe("1023 B");
		expect(formatFileSize(1024)).toBe("1.0 KB");
	});

	it("switches to megabytes at exactly 1048576 bytes", () => {
		expect(formatFileSize(1048575)).toBe("1024.0 KB");
		expect(formatFileSize(1048576)).toBe("1.0 MB");
		expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
	});
});

describe("getFileExtension", () => {
	it("returns the lowercased extension", () => {
		expect(getFileExtension("photo.PNG")).toBe("png");
		expect(getFileExtension("archive.tar.gz")).toBe("gz");
	});

	it("falls back to the whole lowercased name when there is no dot", () => {
		expect(getFileExtension("README")).toBe("readme");
	});

	it("returns an empty string for an empty name", () => {
		expect(getFileExtension("")).toBe("");
	});
});
