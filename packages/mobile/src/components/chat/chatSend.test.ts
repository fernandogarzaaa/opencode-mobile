import { askAttachmentOptions, canSendChatMessage } from "./chatSend";

describe("canSendChatMessage", () => {
	it("allows text-only messages", () => {
		expect(canSendChatMessage("hello", [])).toBe(true);
	});

	it("allows attachments-only messages", () => {
		expect(
			canSendChatMessage("   ", [
				{ id: "f1", name: "a.png", type: "image/png", size: 10, uri: "u" },
			]),
		).toBe(true);
	});

	it("allows text plus attachments", () => {
		expect(
			canSendChatMessage("see this", [
				{ id: "f1", name: "a.png", type: "image/png", size: 10, uri: "u" },
			]),
		).toBe(true);
	});

	it("rejects empty text with no attachments", () => {
		expect(canSendChatMessage("", [])).toBe(false);
		expect(canSendChatMessage("   \n ", undefined)).toBe(false);
	});
});

describe("askAttachmentOptions", () => {
	it("returns undefined for text-only sends", () => {
		expect(askAttachmentOptions(undefined)).toBeUndefined();
		expect(askAttachmentOptions([])).toBeUndefined();
	});

	it("wraps mapped attachments in options", () => {
		const options = askAttachmentOptions([
			{
				id: "f1",
				name: "a.png",
				type: "image/png",
				size: 10,
				uri: "u",
				base64: "eA==",
			},
		]);
		expect(options).toEqual({
			attachments: [
				{ name: "a.png", mime_type: "image/png", size_bytes: 10, base64: "eA==" },
			],
		});
	});
});
