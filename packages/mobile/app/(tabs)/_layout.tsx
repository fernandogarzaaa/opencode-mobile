import type BottomSheet from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { type Session, sessionsApi } from "../../src/api";
import type { ContextUsage } from "../../src/components/chat";
import { Header } from "../../src/components/layout/Header";
import { SessionSheet } from "../../src/components/session";
import type { SessionCacheInfo } from "../../src/components/session/SessionListItem";
import {
	ContextUsageContext,
	SessionSheetContext,
} from "../../src/contexts/tabs-context";
import { useEdgeSwipe } from "../../src/hooks/useEdgeSwipe";
import type { CachedSession } from "../../src/lib/offlineCache";
import {
	fetchSessionsWithCache,
	getSessionCacheInfo,
	initializeSessionSync,
} from "../../src/lib/sessionSync";
import { onApprovalNotificationTap } from "../../src/lib/approvalNotifications";
import { useConnectionStore } from "../../src/stores/useConnectionStore";
import { useApprovalsStore } from "../../src/stores/useApprovalsStore";
import { useTheme } from "../../src/theme";
import { SetupGate } from "../../src/components/layout/SetupGate";
import ApprovalsScreen from "./approvals";
import ChatScreen from "./chat";
import FilesScreen from "./files";

type MainTab = "approvals" | "chat" | "artifacts";

export default function TabsLayout() {
	const { colors } = useTheme();
	const { isConnected, directory } = useConnectionStore();
	// The approvals inbox is the killer screen: it is the default tab.
	const [activeTab, setActiveTab] = useState<MainTab>("approvals");
	const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
	const approvalCount = useApprovalsStore((s) => s.items.length);

	// Session management state (shared across all tabs)
	const [sessions, setSessions] = useState<Session[]>([]);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [isLoadingSessions, setIsLoadingSessions] = useState(false);
	// The node has no git surface (no /api/git/* routes), so this stays
	// false: the dead git-status poll that fed it was removed with the
	// git/diff tabs. SessionSheet keeps the prop for a future node surface.
	const [isGitRepo] = useState(false);
	const [streamingSessionIds, setStreamingSessionIds] = useState<Set<string>>(
		new Set(),
	);
	const [sessionCacheInfo, setSessionCacheInfo] = useState<
		Map<string, SessionCacheInfo>
	>(new Map());

	const sheetRef = useRef<BottomSheet>(null);

	useEffect(() => {
		initializeSessionSync().catch(console.error);
	}, []);

	// Push taps (Phase 4): a tap on an approval.created notification switches
	// to the approvals inbox. The tabs are a custom in-layout switcher rather
	// than expo-router tabs, so the deep link pushed by the notification
	// handler alone cannot change the visible tab; this subscription performs
	// the actual switch.
	useEffect(() => {
		return onApprovalNotificationTap(() => {
			setActiveTab("approvals");
		});
	}, []);

	// The Shadow Node has no working-directory concept; the old opencode
	// "pick a directory after pairing" redirect would trap users on the
	// directory screen, so it is gone. Directory UI rework is queued for
	// the chat/files rewire (build-order item 4).

	// Callbacks for chat screen to sync streaming state
	// Use refs that get updated each render to avoid stale closures
	const updateStreamingSessionsRef = useRef<(ids: Set<string>) => void>(
		() => {},
	);
	updateStreamingSessionsRef.current = (ids) => setStreamingSessionIds(ids);

	const setCurrentSessionIdRef = useRef<(id: string | null) => void>(() => {});
	setCurrentSessionIdRef.current = (id) => setCurrentSessionId(id);

	// The git and diff tabs were removed (the node has no /api/git/*
	// routes), so the git-status poll that fed the diff badge is gone too.

	const fetchSessions = useCallback(async () => {
		setIsLoadingSessions(true);
		try {
			const { sessions: data } = await fetchSessionsWithCache();
			setSessions(data);

			const cacheInfoMap = new Map<string, SessionCacheInfo>();
			for (const session of data) {
				const cachedSession = session as CachedSession;
				if (cachedSession.isFullCache !== undefined) {
					cacheInfoMap.set(session.id, getSessionCacheInfo(cachedSession));
				}
			}
			setSessionCacheInfo(cacheInfoMap);
		} catch (error) {
			console.error("Failed to fetch sessions:", error);
		} finally {
			setIsLoadingSessions(false);
		}
	}, []);

	// Load sessions on connect
	useEffect(() => {
		if (isConnected) {
			fetchSessions();
		}
	}, [isConnected, fetchSessions]);

	const openSessionSheet = useCallback(() => {
		fetchSessions();
		sheetRef.current?.expand();
	}, [fetchSessions]);

	// Edge swipe to open session sheet
	useEdgeSwipe({
		enabled: true,
		onSwipe: openSessionSheet,
	});

	const selectSession = useCallback((session: Session) => {
		console.log("[TabsLayout] selectSession called, session:", session.id);
		setCurrentSessionIdRef.current(session.id);
		sheetRef.current?.close();
		// Navigate to chat tab when selecting a session
		setActiveTab("chat");
		console.log("[TabsLayout] selectSession completed");
		// ChatScreen will handle loading messages via its own effect
	}, []);

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const createNewSession = useCallback((_newDirectory?: string | null) => {
		setCurrentSessionIdRef.current(null);
		sheetRef.current?.close();
	}, []);

	const renameSession = useCallback(
		async (targetSessionId: string, title: string) => {
			try {
				await sessionsApi.updateTitle(targetSessionId, title);
				setSessions((prev) =>
					prev.map((s) => (s.id === targetSessionId ? { ...s, title } : s)),
				);
			} catch (error) {
				console.error("Failed to rename session:", error);
			}
		},
		[],
	);

	const shareSession = useCallback(
		async (targetSessionId: string): Promise<Session | null> => {
			try {
				const updated = await sessionsApi.share(targetSessionId);
				setSessions((prev) =>
					prev.map((s) => (s.id === targetSessionId ? updated : s)),
				);
				return updated;
			} catch (error) {
				console.error("Failed to share session:", error);
				return null;
			}
		},
		[],
	);

	const unshareSession = useCallback(
		async (targetSessionId: string): Promise<boolean> => {
			try {
				const updated = await sessionsApi.unshare(targetSessionId);
				setSessions((prev) =>
					prev.map((s) => (s.id === targetSessionId ? updated : s)),
				);
				return true;
			} catch (error) {
				console.error("Failed to unshare session:", error);
				return false;
			}
		},
		[],
	);

	const deleteSession = useCallback(
		async (targetSessionId: string): Promise<boolean> => {
			try {
				await sessionsApi.delete(targetSessionId);
				setSessions((prev) => prev.filter((s) => s.id !== targetSessionId));

				// If we deleted the current session, clear it
				if (targetSessionId === currentSessionId) {
					setCurrentSessionIdRef.current(null);
				}
				return true;
			} catch (error) {
				console.error("Failed to delete session:", error);
				return false;
			}
		},
		[currentSessionId],
	);

	const handleChangeDirectory = useCallback(() => {
		router.push("/onboarding/directory");
	}, []);

	// TODO: Implement worktree manager and multi-run launcher for mobile
	// const handleOpenWorktreeManager = useCallback(() => {}, []);
	// const handleOpenMultiRunLauncher = useCallback(() => {}, []);

	const handleMenuPress = useCallback(() => {
		openSessionSheet();
	}, [openSessionSheet]);

	const handleSettingsPress = useCallback(() => {
		router.push("/settings");
	}, []);

	const handleTabChange = useCallback((tab: MainTab) => {
		setActiveTab(tab);
	}, []);

	const contextUsageValue = useMemo(
		() => ({
			contextUsage,
			setContextUsage,
		}),
		[contextUsage],
	);

	const sessionSheetValue = useMemo(
		() => ({
			sessions,
			currentSessionId,
			isLoadingSessions,
			isGitRepo,
			streamingSessionIds,
			openSessionSheet,
			selectSession,
			createNewSession,
			renameSession,
			shareSession,
			unshareSession,
			deleteSession,
			changeDirectory: handleChangeDirectory,
			// Internal refs for ChatScreen to sync state
			_updateStreamingSessions: updateStreamingSessionsRef.current,
			_setCurrentSessionId: setCurrentSessionIdRef.current,
			_refreshSessions: fetchSessions,
		}),
		[
			sessions,
			currentSessionId,
			isLoadingSessions,
			isGitRepo,
			streamingSessionIds,
			openSessionSheet,
			selectSession,
			createNewSession,
			renameSession,
			shareSession,
			unshareSession,
			deleteSession,
			handleChangeDirectory,
			fetchSessions,
		],
	);

	const renderContent = () => {
		switch (activeTab) {
			case "approvals":
				return <ApprovalsScreen />;
			case "chat":
				return <ChatScreen />;
			case "artifacts":
				return <FilesScreen />;
			default:
				return <ApprovalsScreen />;
		}
	};

	return (
		<SessionSheetContext.Provider value={sessionSheetValue}>
			<ContextUsageContext.Provider value={contextUsageValue}>
				<View
					style={[styles.container, { backgroundColor: colors.background }]}
				>
					<Header
						activeTab={activeTab}
						onTabChange={handleTabChange}
						onMenuPress={handleMenuPress}
						onSettingsPress={handleSettingsPress}
						onSessionsPress={openSessionSheet}
						contextUsage={contextUsage}
						approvalCount={approvalCount}
					/>
					{/* Setup gate (OpenDots backlog #9): block tab content until
					    the device is paired and credentials are configured.
					    Deep links can land here bypassing the index redirect. */}
					<SetupGate>
						<View style={styles.content}>{renderContent()}</View>
					</SetupGate>

					<SessionSheet
						ref={sheetRef}
						sessions={sessions}
						currentSessionId={currentSessionId}
						currentDirectory={directory}
						isLoading={isLoadingSessions}
						isGitRepo={isGitRepo}
						streamingSessionIds={streamingSessionIds}
						sessionCacheInfo={sessionCacheInfo}
						onSelectSession={selectSession}
						onNewSession={createNewSession}
						onRenameSession={renameSession}
						onShareSession={shareSession}
						onUnshareSession={unshareSession}
						onDeleteSession={deleteSession}
						onChangeDirectory={handleChangeDirectory}
					/>
				</View>
			</ContextUsageContext.Provider>
		</SessionSheetContext.Provider>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		flex: 1,
	},
	placeholder: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
});
