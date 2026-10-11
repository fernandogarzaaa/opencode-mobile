import { useCallback, useEffect, useRef, useState } from "react";
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { agentApi } from "../../src/api/agent";
import {
	panelsApi,
	type Panel,
	type PanelProposal,
} from "../../src/api/panels";
import type { Message } from "../../src/components/chat";
import {
	ChatInput,
	MessageList,
} from "../../src/components/chat";
import { WorkingPlaceholder } from "../../src/components/chat/WorkingPlaceholder";
import {
	PanelProposalCard,
	PanelViewer,
} from "../../src/components/panels";
import {
	looksLikePanelCreateRequest,
	looksLikePanelViewRequest,
} from "../../src/lib/panelFormat";
import { useConnectionStore } from "../../src/stores/useConnectionStore";
import { useTheme } from "../../src/theme";
import { fontStyle, typography } from "../../src/theme";

// ---------------------------------------------------------------------------
// Why this screen no longer uses the opencode session machinery:
//
// The Shadow Node exposes no /api/session, /api/event, /api/config,
// /api/providers, /api/agents, /api/commands, /api/fs/*, /api/git/* or
// /api/terminal/* routes (see the @app route table in
// apps/shadow-node/shadow_node/main.py). Chat is a thin client over
// POST /agent/ask_stream: {prompt} -> agent.message.delta chunks ->
// agent.message.done. Conversation continuity is this screen's in-memory
// message list; each ask is an independent node call.
//
// sessionSync.ts is deliberately left in place: it still backs the session
// sheet in app/(tabs)/_layout.tsx. useEventStream.ts is likewise kept for
// any future consumer; chat no longer subscribes to it.
// ---------------------------------------------------------------------------

const DEFAULT_VISIBLE_MESSAGES = 200;
const MESSAGE_PAGE_SIZE = 100;
// The node streams the full answer as fast delivery chunks, but a
// cloud-routed answer can take a while to start. Fail only on silence.
const STUCK_TIMEOUT_MS = 90000;

export default function ChatScreen() {
	const insets = useSafeAreaInsets();
	const { colors } = useTheme();
	const { isConnected } = useConnectionStore();

	const [messages, setMessages] = useState<Message[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	// Pending panel proposal from POST /custom-panels/parse (Hark item 2).
	// The card renders above the composer; nothing is created until Confirm.
	const [pendingPanelProposal, setPendingPanelProposal] = useState<{
		proposal: PanelProposal;
		text: string;
	} | null>(null);
	const [isConfirmingPanelProposal, setIsConfirmingPanelProposal] =
		useState(false);
	const [isParsingPanel, setIsParsingPanel] = useState(false);
	// Dismissible panel viewer above the composer (Hark item 2).
	const [panelViewer, setPanelViewer] = useState<{
		title: string;
		panels: Panel[];
	} | null>(null);
	const [isLoadingPanels, setIsLoadingPanels] = useState(false);
	const [visibleMessageCount, setVisibleMessageCount] = useState(
		DEFAULT_VISIBLE_MESSAGES,
	);

	const cancelRef = useRef<(() => void) | null>(null);
	const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const assistantIdRef = useRef<string | null>(null);

	const visibleMessages =
		messages.length <= visibleMessageCount
			? messages
			: messages.slice(messages.length - visibleMessageCount);
	const hasMoreMessages = messages.length > visibleMessageCount;

	const handleLoadMore = useCallback(() => {
		setVisibleMessageCount((prev) =>
			Math.min(messages.length, prev + MESSAGE_PAGE_SIZE),
		);
	}, [messages.length]);

	const clearWatchdog = useCallback(() => {
		if (watchdogRef.current) {
			clearTimeout(watchdogRef.current);
			watchdogRef.current = null;
		}
	}, []);

	useEffect(() => clearWatchdog, [clearWatchdog]);

	const failAssistantMessage = useCallback(
		(assistantId: string, errorText: string) => {
			setMessages((prev) =>
				prev.map((msg) =>
					msg.id === assistantId
						? {
								...msg,
								isStreaming: false,
								content: msg.content
									? `${msg.content}\n\n[${errorText}]`
									: `Error: ${errorText}`,
							}
						: msg,
				),
			);
		},
		[],
	);

	const armWatchdog = useCallback(
		(assistantId: string) => {
			clearWatchdog();
			watchdogRef.current = setTimeout(() => {
				cancelRef.current?.();
				cancelRef.current = null;
				assistantIdRef.current = null;
				setIsLoading(false);
				failAssistantMessage(assistantId, "Response incomplete - connection lost");
			}, STUCK_TIMEOUT_MS);
		},
		[clearWatchdog, failAssistantMessage],
	);

	const sendToAgent = useCallback(
		(text: string) => {
			setIsLoading(true);

			const userMessage: Message = {
				id: `user-${Date.now()}`,
				role: "user",
				content: text,
				createdAt: Date.now(),
			};
			const assistantId = `assistant-${Date.now()}`;
			assistantIdRef.current = assistantId;

			setMessages((prev) => [
				...prev,
				userMessage,
				{
					id: assistantId,
					role: "assistant",
					content: "",
					isStreaming: true,
					createdAt: Date.now(),
				},
			]);

			armWatchdog(assistantId);

			cancelRef.current = agentApi.askStream(text, {
				onDelta: (delta) => {
					armWatchdog(assistantId);
					setMessages((prev) =>
						prev.map((msg) =>
							msg.id === assistantId
								? { ...msg, content: msg.content + delta }
								: msg,
						),
					);
				},
				onDone: (done) => {
					clearWatchdog();
					cancelRef.current = null;
					assistantIdRef.current = null;
					setIsLoading(false);
					setMessages((prev) =>
						prev.map((msg) =>
							msg.id === assistantId
								? {
										...msg,
										content: done.answer,
										isStreaming: false,
										modelName: done.model_used || undefined,
										modelUsed: done.model_used || undefined,
										route: done.route || undefined,
										sources: done.sources,
									}
								: msg,
						),
					);
				},
				onError: (error) => {
					clearWatchdog();
					cancelRef.current = null;
					assistantIdRef.current = null;
					setIsLoading(false);
					failAssistantMessage(assistantId, error.message);
				},
			});
		},
		[armWatchdog, clearWatchdog, failAssistantMessage],
	);

	/**
	 * Post a user message and a plain assistant message without streaming.
	 * Used by the panel flows so the conversation stays coherent.
	 */
	const postExchange = useCallback((userText: string, assistantText: string) => {
		const now = Date.now();
		setMessages((prev) => [
			...prev,
			{
				id: `user-${now}`,
				role: "user",
				content: userText,
				createdAt: now,
			},
			{
				id: `assistant-${now}`,
				role: "assistant",
				content: assistantText,
				createdAt: now,
			},
		]);
	}, []);

	/**
	 * Route a panel-creation-looking message through the node's
	 * deterministic parser. Falls through to the agent when the parser
	 * rejects it or the node predates the route, so chat never dead-ends
	 * on old nodes.
	 */
	const handlePanelCreateIntercept = useCallback(
		async (text: string) => {
			setIsParsingPanel(true);
			try {
				const result = await panelsApi.parse(text);
				if (result.status === "proposal" && result.proposal) {
					setPendingPanelProposal({ proposal: result.proposal, text });
					return;
				}
				if (result.status === "needs_clarification" && result.question) {
					const options =
						result.options.length > 0
							? ` Options: ${result.options.join(", ")}.`
							: "";
					postExchange(text, `${result.question}${options}`);
					return;
				}
			} catch {
				// Node predates /custom-panels/parse or is unreachable: fall through.
			} finally {
				setIsParsingPanel(false);
			}
			sendToAgent(text);
		},
		[postExchange, sendToAgent],
	);

	/**
	 * Show the built-in glanceable panels in the dismissible viewer above
	 * the composer. Uses the TTL cache so repeated asks do not hammer
	 * the node.
	 */
	const handlePanelViewIntercept = useCallback(
		async (text: string) => {
			setIsLoadingPanels(true);
			try {
				const panels = await panelsApi.listPanels();
				postExchange(text, "Here are your panels.");
				setPanelViewer({ title: "Panels", panels });
			} catch {
				// Node predates /panels or is unreachable: fall through to
				// the agent instead of dead-ending on a fixed error.
				sendToAgent(text);
			} finally {
				setIsLoadingPanels(false);
			}
		},
		[postExchange, sendToAgent],
	);

	const handleConfirmPanelProposal = useCallback(async () => {
		if (!pendingPanelProposal || isConfirmingPanelProposal) return;
		setIsConfirmingPanelProposal(true);
		try {
			const created = await panelsApi.createCustom({
				name: pendingPanelProposal.proposal.name,
				source: pendingPanelProposal.proposal.source,
				filter: pendingPanelProposal.proposal.filter,
				sort: pendingPanelProposal.proposal.sort,
				limit: pendingPanelProposal.proposal.limit,
			});
			// The panel exists from here on: clear the proposal first so a
			// later failure cannot invite a duplicate-creating retry.
			setPendingPanelProposal(null);
			try {
				const rendered = await panelsApi.renderCustom(created.id);
				postExchange(
					pendingPanelProposal.text,
					`Panel created: ${created.name}.`,
				);
				setPanelViewer({ title: created.name, panels: [rendered] });
			} catch {
				postExchange(
					pendingPanelProposal.text,
					`Panel "${created.name}" was created but could not be shown. Open Panels in Settings to view it.`,
				);
			}
		} catch (e) {
			postExchange(
				pendingPanelProposal.text,
				`Could not create that panel: ${e instanceof Error ? e.message : "unknown error"}. The proposal is still above; you can retry.`,
			);
		} finally {
			setIsConfirmingPanelProposal(false);
		}
	}, [pendingPanelProposal, isConfirmingPanelProposal, postExchange]);

	const handleCancelPanelProposal = useCallback(() => {
		setPendingPanelProposal(null);
	}, []);

	const handleDismissPanelViewer = useCallback(() => {
		setPanelViewer(null);
	}, []);

	const handleSend = useCallback(
		(content: string) => {
			if (
				!isConnected ||
				isLoading ||
				isParsingPanel ||
				isLoadingPanels ||
				isConfirmingPanelProposal
			)
				return;
			const text = content.trim();
			if (!text) return;

			// Panel intercepts (Hark item 2): "make a panel showing ..." goes
			// to POST /custom-panels/parse first. A parsed proposal gets a
			// confirm card above the composer; a clarifying question lands as
			// an assistant message. "show my panels" renders the cached
			// panels in the dismissible viewer. Anything else (or a node
			// without the routes) falls through to the agent untouched.
			if (looksLikePanelCreateRequest(text)) {
				void handlePanelCreateIntercept(text);
				return;
			}
			if (looksLikePanelViewRequest(text)) {
				void handlePanelViewIntercept(text);
				return;
			}
			sendToAgent(text);
		},
		[
			isConnected,
			isLoading,
			isParsingPanel,
			isLoadingPanels,
			isConfirmingPanelProposal,
			handlePanelCreateIntercept,
			handlePanelViewIntercept,
			sendToAgent,
		],
	);

	const handleStop = useCallback(() => {
		cancelRef.current?.();
		cancelRef.current = null;
		clearWatchdog();
		const assistantId = assistantIdRef.current;
		assistantIdRef.current = null;
		setIsLoading(false);
		if (assistantId) {
			setMessages((prev) =>
				prev.map((msg) =>
					msg.id === assistantId
						? {
								...msg,
								isStreaming: false,
								content: msg.content || "[Stopped]",
							}
						: msg,
				),
			);
		}
	}, [clearWatchdog]);

	const handleNewChat = useCallback(() => {
		if (isLoading) {
			handleStop();
		}
		setMessages([]);
		setVisibleMessageCount(DEFAULT_VISIBLE_MESSAGES);
	}, [isLoading, handleStop]);

	const HEADER_HEIGHT = 52;
	const keyboardOffset = HEADER_HEIGHT + insets.top;

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={styles.container}
				keyboardVerticalOffset={keyboardOffset}
			>
				<View style={styles.newChatRow}>
					<Pressable
						onPress={handleNewChat}
						accessibilityLabel="Start a new chat"
						style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
					>
						<Text
							style={[
								typography.micro,
								fontStyle("500"),
								{ color: colors.primary },
							]}
						>
							New chat
						</Text>
					</Pressable>
				</View>
				<View style={styles.messageContainer}>
					<MessageList
						messages={visibleMessages}
						isLoading={isLoading}
						hasMore={hasMoreMessages}
						onLoadMore={handleLoadMore}
					/>
				</View>

				{isLoading && (
					<WorkingPlaceholder
						isStreaming={isLoading}
						statusText="Thinking..."
						activityType="text"
					/>
				)}

				<View
					style={[
						styles.inputContainer,
						{
							backgroundColor: colors.background,
							paddingBottom: Math.max(insets.bottom, 12),
						},
					]}
				>
					{pendingPanelProposal && (
						<PanelProposalCard
							proposal={pendingPanelProposal.proposal}
							onConfirm={handleConfirmPanelProposal}
							onCancel={handleCancelPanelProposal}
							isConfirming={isConfirmingPanelProposal}
						/>
					)}
					{(panelViewer || isLoadingPanels) && (
						<PanelViewer
							title={panelViewer?.title ?? "Panels"}
							panels={panelViewer?.panels ?? []}
							isLoading={isLoadingPanels}
							onDismiss={handleDismissPanelViewer}
						/>
					)}
					<ChatInput
						onSend={handleSend}
						onStop={handleStop}
						isLoading={isLoading || isParsingPanel}
						placeholder={
							isConnected ? "Ask Shadow anything..." : "Connect to server first"
						}
						hideAttachments
						hideModelSelector
					/>
				</View>
			</KeyboardAvoidingView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	newChatRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		paddingHorizontal: 16,
		paddingTop: 8,
	},
	messageContainer: {
		flex: 1,
	},
	inputContainer: {
		paddingHorizontal: 6,
		paddingTop: 0,
		paddingBottom: 8,
	},
});
