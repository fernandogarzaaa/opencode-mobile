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
	scheduledTasksApi,
	type ScheduleProposal,
} from "../../src/api/scheduledTasks";
import { looksLikeScheduleRequest } from "../../src/lib/scheduleFormat";
import type { Message } from "../../src/components/chat";
import {
	ChatInput,
	MessageList,
} from "../../src/components/chat";
import { ScheduleProposalCard } from "../../src/components/tasks";
import { WorkingPlaceholder } from "../../src/components/chat/WorkingPlaceholder";
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
	const [visibleMessageCount, setVisibleMessageCount] = useState(
		DEFAULT_VISIBLE_MESSAGES,
	);
	// Pending schedule proposal from POST /reminders/parse (Hark item 4).
	// The card renders above the composer; nothing is created until Confirm.
	const [pendingProposal, setPendingProposal] = useState<{
		proposal: ScheduleProposal;
		text: string;
	} | null>(null);
	const [isConfirmingProposal, setIsConfirmingProposal] = useState(false);
	// In-flight POST /reminders/parse: the user message is not shown until the
	// parse resolves, so block re-sends and show the composer as busy.
	const [isParsingSchedule, setIsParsingSchedule] = useState(false);

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
	 * Route a scheduling-looking message through the node's deterministic
	 * parser. Falls through to the agent when the parser rejects it or the
	 * node predates the route, so chat never dead-ends on old nodes.
	 */
	const handleScheduleIntercept = useCallback(
		async (text: string) => {
			setIsParsingSchedule(true);
			try {
				const result = await scheduledTasksApi.parse(text);
				if (result.status === "parsed" && result.proposal) {
					setPendingProposal({ proposal: result.proposal, text });
					return;
				}
				if (result.status === "needs_clarification" && result.question) {
					const question = result.question;
					const now = Date.now();
					setMessages((prev) => [
						...prev,
						{
							id: `user-${now}`,
							role: "user",
							content: text,
							createdAt: now,
						},
						{
							id: `assistant-${now}`,
							role: "assistant",
							content: question,
							createdAt: now,
						},
					]);
					return;
				}
			} catch {
				// Node predates /reminders/parse or is unreachable: fall through.
			} finally {
				setIsParsingSchedule(false);
			}
			sendToAgent(text);
		},
		[sendToAgent],
	);

	const handleConfirmProposal = useCallback(async () => {
		if (!pendingProposal || isConfirmingProposal) return;
		setIsConfirmingProposal(true);
		try {
			const created = await scheduledTasksApi.create({
				title: pendingProposal.proposal.title,
				note: pendingProposal.proposal.note,
				due_at: pendingProposal.proposal.due_at,
				recurrence: pendingProposal.proposal.recurrence,
			});
			const now = Date.now();
			setMessages((prev) => [
				...prev,
				{
					id: `user-${now}`,
					role: "user",
					content: pendingProposal.text,
					createdAt: now,
				},
				{
					id: `assistant-${now}`,
					role: "assistant",
					content: `Scheduled: ${created.title} (${created.cadence}).`,
					createdAt: now,
				},
			]);
			setPendingProposal(null);
		} catch (e) {
			const now = Date.now();
			setMessages((prev) => [
				...prev,
				{
					id: `assistant-${now}`,
					role: "assistant",
					content: `Could not schedule that: ${e instanceof Error ? e.message : "unknown error"}. The proposal is still above; you can retry.`,
					createdAt: now,
				},
			]);
		} finally {
			setIsConfirmingProposal(false);
		}
	}, [pendingProposal, isConfirmingProposal]);

	const handleCancelProposal = useCallback(() => {
		setPendingProposal(null);
	}, []);


	const handleSend = useCallback(
		(content: string) => {
			if (!isConnected || isLoading || isParsingSchedule) return;
			const text = content.trim();
			if (!text) return;

			// Scheduling-request intercept (Hark item 4): "remind me ..." goes
			// to POST /reminders/parse first. A parsed proposal gets a confirm
			// card above the composer; a clarifying question lands as an
			// assistant message. Anything else (or a node without the route)
			// falls through to the agent untouched.
			if (looksLikeScheduleRequest(text)) {
				void handleScheduleIntercept(text);
				return;
			}
			sendToAgent(text);
		},
		[isConnected, isLoading, isParsingSchedule, handleScheduleIntercept, sendToAgent],
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
					{pendingProposal && (
						<ScheduleProposalCard
							proposal={pendingProposal.proposal}
							onConfirm={handleConfirmProposal}
							onCancel={handleCancelProposal}
							isConfirming={isConfirmingProposal}
						/>
					)}
					<ChatInput
						onSend={handleSend}
						onStop={handleStop}
						isLoading={isLoading || isParsingSchedule}
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
