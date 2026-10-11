import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { AttachedFile } from "./FileAttachment";
import { MessageAttachments } from "./MessageAttachments";

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
		Image: stub("Image"),
		StyleSheet: { create: (s: unknown) => s },
	};
});

jest.mock("@/theme", () => ({
	useTheme: () => ({
		colors: {
			muted: "#111111",
			mutedForeground: "#888888",
			foreground: "#ffffff",
			border: "#333333",
			card: "#222222",
		},
		isDark: true,
	}),
	typography: { micro: { fontSize: 11 } },
}));

function file(overrides: Partial<AttachedFile> = {}): AttachedFile {
	return {
		id: "file-1",
		name: "screenshot.png",
		type: "image/png",
		size: 2048,
		uri: "file:///tmp/screenshot.png",
		...overrides,
	};
}

function renderAttachments(attachments?: AttachedFile[]) {
	let tree: ReturnType<typeof create> | undefined;
	act(() => {
		tree = create(createElement(MessageAttachments, { attachments }));
	});
	return tree!;
}

function chips(root: ReactTestInstance): ReactTestInstance[] {
	// findAllByType("View") matches host elements only: the stub function
	// components have the Stub function as their type, not the string.
	return root
		.findAllByType("View" as never)
		.filter(
			(node) =>
				typeof node.props.accessibilityLabel === "string" &&
				(node.props.accessibilityLabel as string).startsWith("Attachment:"),
		);
}

function texts(root: ReactTestInstance): string[] {
	return root
		.findAllByType("Text" as never)
		.map((node) =>
			Array.isArray(node.props.children)
				? (node.props.children as unknown[]).join("")
				: String(node.props.children ?? ""),
		);
}

describe("MessageAttachments", () => {
	it("renders nothing when attachments are undefined", () => {
		const tree = renderAttachments(undefined);
		expect(tree.toJSON()).toBeNull();
	});

	it("renders nothing for an empty list", () => {
		const tree = renderAttachments([]);
		expect(tree.toJSON()).toBeNull();
	});

	it("renders one chip per attachment with name and size", () => {
		const tree = renderAttachments([
			file(),
			file({
				id: "file-2",
				name: "notes.pdf",
				type: "application/pdf",
				size: 512,
				uri: "file:///tmp/notes.pdf",
			}),
		]);
		const found = chips(tree.root);
		expect(found).toHaveLength(2);
		expect(found[0]?.props.accessibilityLabel).toBe(
			"Attachment: screenshot.png",
		);
		expect(found[1]?.props.accessibilityLabel).toBe("Attachment: notes.pdf");
		const rendered = texts(tree.root);
		expect(rendered).toContain("screenshot.png");
		expect(rendered).toContain("notes.pdf");
		expect(rendered).toContain("2.0 KB");
		expect(rendered).toContain("512 B");
	});

	it("renders an image thumbnail for images with a uri", () => {
		const tree = renderAttachments([file()]);
		const images = tree.root.findAllByType("Image" as never);
		expect(images).toHaveLength(1);
		expect(images[0]?.props.source).toEqual({
			uri: "file:///tmp/screenshot.png",
		});
	});

	it("renders an extension badge for non-image files", () => {
		const tree = renderAttachments([
			file({
				name: "notes.pdf",
				type: "application/pdf",
				uri: "file:///tmp/notes.pdf",
			}),
		]);
		expect(tree.root.findAllByType("Image" as never)).toHaveLength(0);
		expect(texts(tree.root)).toContain("PDF");
	});

	it("renders an extension badge for images without a uri", () => {
		const tree = renderAttachments([file({ uri: "" })]);
		expect(tree.root.findAllByType("Image" as never)).toHaveLength(0);
		expect(texts(tree.root)).toContain("PNG");
	});

	it("truncates long extensions to three characters", () => {
		const tree = renderAttachments([
			file({ name: "photo.jpeg", type: "image/jpeg", uri: "" }),
		]);
		expect(texts(tree.root)).toContain("JPE");
		expect(texts(tree.root)).not.toContain("JPEG");
	});

	it("formats megabyte sizes", () => {
		const tree = renderAttachments([
			file({ name: "video.mp4", type: "video/mp4", size: 2.5 * 1024 * 1024 }),
		]);
		expect(texts(tree.root)).toContain("2.5 MB");
	});

	it("styles chips with the muted background and border colors", () => {
		const tree = renderAttachments([file()]);
		const chip = chips(tree.root)[0]!;
		expect(chip.props.style).toEqual({
			backgroundColor: "#111111",
			borderColor: "#333333",
		});
	});

	it("styles the extension badge with the card background", () => {
		const tree = renderAttachments([
			file({ name: "notes.pdf", type: "application/pdf" }),
		]);
		const badge = tree.root
			.findAllByType("View" as never)
			.find(
				(node) =>
					typeof node.props.style === "object" &&
					node.props.style !== null &&
					(node.props.style as Record<string, unknown>).backgroundColor ===
						"#222222",
			);
		expect(badge).toBeDefined();
	});

	it("styles file name and size texts with the theme colors", () => {
		const tree = renderAttachments([file()]);
		const findText = (content: string) =>
			tree.root
				.findAllByType("Text" as never)
				.find((node) => node.props.children === content);
		expect(findText("screenshot.png")?.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#ffffff" },
		]);
		expect(findText("2.0 KB")?.props.style).toEqual([
			{ fontSize: 11 },
			{ color: "#888888" },
		]);
	});
});
