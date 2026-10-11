import type { AttachedFile } from "../components/chat/FileAttachment";
import { toAskAttachments } from "./attachments";

function file(overrides: Partial<AttachedFile> = {}): AttachedFile {
	return {
		id: "file-1",
		name: "screenshot.png",
		type: "image/png",
		size: 12345,
		uri: "file:///tmp/screenshot.png",
		base64: "aGVsbG8=",
		...overrides,
	};
}

describe("toAskAttachments", () => {
	it("returns undefined for undefined input", () => {
		expect(toAskAttachments(undefined)).toBeUndefined();
	});

	it("returns undefined for an empty list", () => {
		expect(toAskAttachments([])).toBeUndefined();
	});

	it("maps name, type, size and base64 to the wire shape", () => {
		expect(toAskAttachments([file()])).toEqual([
			{
				name: "screenshot.png",
				mime_type: "image/png",
				size_bytes: 12345,
				base64: "aGVsbG8=",
			},
		]);
	});

	it("omits base64 when the file could not be read", () => {
		const result = toAskAttachments([file({ base64: undefined })]);
		expect(result).toHaveLength(1);
		expect(result?.[0]).toEqual({
			name: "screenshot.png",
			mime_type: "image/png",
			size_bytes: 12345,
		});
		expect(result?.[0]).not.toHaveProperty("base64");
	});

	it("maps every file in a multi-file selection", () => {
		const result = toAskAttachments([
			file({ id: "a", name: "a.png" }),
			file({ id: "b", name: "notes.pdf", type: "application/pdf", size: 99 }),
		]);
		expect(result?.map((a) => a.name)).toEqual(["a.png", "notes.pdf"]);
		expect(result?.[1]?.mime_type).toBe("application/pdf");
		expect(result?.[1]?.size_bytes).toBe(99);
	});

	it("does not leak the local uri or the client id", () => {
		const result = toAskAttachments([file()]);
		expect(result?.[0]).not.toHaveProperty("uri");
		expect(result?.[0]).not.toHaveProperty("id");
	});
});
