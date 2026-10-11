import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { AttachedFile } from "./FileAttachment";
import type { Message } from "./types";
import { ChatMessage } from "./ChatMessage";

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
		Pressable: stub("Pressable"),
		StyleSheet: { create: (s: unknown) => s },
		Animated: { View: stub("Animated.View") },
	};
});

jest.mock("expo-haptics", () => ({
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
	selectionAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: "light" },
	NotificationFeedbackType: { Success: "success" },
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

jest.mock("@/theme", () => ({
	useTheme: () => ({
		colors: {
			primary: "#00aaff",
			foreground: "#ffffff",
			muted: "#111111",
			mutedForeground: "#888888",
			border: "#333333",
			card: "#222222",
		},
		isDark: true,
	}),
	typography: {
		micro: { fontSize: 11 },
		body: { fontSize: 15 },
		uiLabel: { fontSize: 14 },
	},
	fontStyle: () => ({}),
	Radius: { xl: 12, sm: 4 },
	Spacing: { 3: 12 },
	FontSizes: {},
	FontFamilySans: {},
}));

jest.mock("@/utils/colors", () => ({
	withOpacity: (c: string) => c,
	OPACITY: { light: 0.1, selected: 0.2 },
}));

jest.mock("../icons", () => ({
	CopyIcon: () => null,
	UndoIcon: () => null,
	GitBranchIcon: () => null,
	CheckIcon: () => null,
	AiAgentIcon: () => null,
}));
jest.mock("../ui/ProviderLogo", () => ({ ProviderLogo: () => null }));
jest.mock("../markdown/MarkdownRenderer", () => ({}));
jest.mock("./MessageActionsMenu", () => ({
	MessageActionsMenu: () => null,
}));
// MessageAttachments pulls its format helpers from ./fileUtils (no deps).
jest.mock("./parts", () => ({}));
jest.mock("./useMessageActions", () => ({
	useMessageActions: () => ({
		showMenu: false,
		messageLayout: {},
		bubbleRef: { current: null },
		openMenu: jest.fn(),
		closeMenu: jest.fn(),
		copyMessageContent: jest.fn(),
	}),
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

function userMessage(overrides: Partial<Message> = {}): Message {
	return {
		id: "user-1",
		role: "user",
		content: "hello",
		createdAt: Date.now(),
		...overrides,
	};
}

function renderMessage(message: Message) {
	let tree: ReturnType<typeof create> | undefined;
	act(() => {
		tree = create(createElement(ChatMessage, { message }));
	});
	return tree!;
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

function textNodes(root: ReactTestInstance): ReactTestInstance[] {
	return root.findAllByType("Text" as never);
}

describe("ChatMessage user branch", () => {
	it("renders the message text", () => {
		const tree = renderMessage(userMessage({ content: "hello" }));
		expect(texts(tree.root)).toContain("hello");
	});

	it("styles the message text with the body typography and foreground color", () => {
		const tree = renderMessage(userMessage({ content: "hello" }));
		const node = textNodes(tree.root).find(
			(n) => String(n.props.children ?? "") === "hello",
		);
		expect(node).toBeDefined();
		const style = node!.props.style as unknown[];
		expect(Array.isArray(style)).toBe(true);
		expect(style).toHaveLength(2);
		expect(style[1]).toEqual({ color: "#ffffff" });
	});

	it("renders attachment chips above the text", () => {
		const tree = renderMessage(
			userMessage({ content: "see this", attachments: [file()] }),
		);
		const rendered = texts(tree.root);
		expect(rendered).toContain("see this");
		expect(rendered).toContain("screenshot.png");
	});

	it("renders no empty text element for attachments-only messages", () => {
		const tree = renderMessage(
			userMessage({ content: "", attachments: [file()] }),
		);
		expect(texts(tree.root)).not.toContain("");
		expect(texts(tree.root)).toContain("screenshot.png");
	});

	it("renders no attachments section without attachments", () => {
		const tree = renderMessage(userMessage({ content: "hello" }));
		const chips = tree.root
			.findAllByType("View" as never)
			.filter(
				(node) =>
					typeof node.props.accessibilityLabel === "string" &&
					(node.props.accessibilityLabel as string).startsWith("Attachment:"),
			);
		expect(chips).toHaveLength(0);
	});
});
