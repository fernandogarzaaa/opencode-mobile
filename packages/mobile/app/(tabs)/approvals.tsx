import { useCallback, useEffect, useRef, useState } from "react";
import {
	AppState,
	type AppStateStatus,
	FlatList,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	type ApprovalRequest,
	approvalsApi,
} from "@/api/approvals";
import { ApprovalCard } from "@/components/approvals/ApprovalCard";
import { RefreshIcon } from "@/components/icons";
import { Button, IconButton, SkeletonCard } from "@/components/ui";
import { useApprovalStream } from "@/hooks/useApprovalStream";
import { ApiError } from "@/lib/httpClient";
import { useApprovalsStore } from "@/stores/useApprovalsStore";
import { useConnectionStore } from "@/stores/useConnectionStore";
import { Spacing, fontStyle, typography, useTheme } from "@/theme";

const COUNTDOWN_TICK_MS = 5000;

function isExpired(approval: ApprovalRequest, now: number): boolean {
	const expiresAtMs = approval.expires_at
		? Date.parse(approval.expires_at)
		: null;
	return expiresAtMs !== null && expiresAtMs <= now;
}

export default function ApprovalsScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { isConnected } = useConnectionStore();
	const items = useApprovalsStore((s) => s.items);
	const setItems = useApprovalsStore((s) => s.setItems);
	const upsert = useApprovalsStore((s) => s.upsert);
	const removeItem = useApprovalsStore((s) => s.remove);

	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());

	const appStateRef = useRef<AppStateStatus>(AppState.currentState);
	const mountedRef = useRef(true);

	// Countdown tick for expires-in labels.
	useEffect(() => {
		const timer = setInterval(
			() => setNow(Date.now()),
			COUNTDOWN_TICK_MS,
		);
		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const fetchPending = useCallback(
		async (mode: "initial" | "refresh" | "silent") => {
			if (!isConnected) {
				if (mode !== "silent") {
					setError(
						"Not connected to a Shadow Node. Pair a device first.",
					);
					setLoading(false);
				}
				return;
			}

			if (mode === "initial") setLoading(true);
			if (mode === "refresh") setRefreshing(true);
			if (mode !== "silent") setError(null);

			try {
				const page = await approvalsApi.listPending();
				if (!mountedRef.current) return;
				// Expired-but-unswept items drop out of the pending list on fetch.
				const live = page.items.filter(
					(a) => a.status === "pending" && !isExpired(a, Date.now()),
				);
				setItems(live);
			} catch (err) {
				if (!mountedRef.current) return;
				if (mode !== "silent") {
					setError(
						err instanceof Error
							? err.message
							: "Failed to load approvals.",
					);
				}
			} finally {
				if (mountedRef.current) {
					if (mode === "initial") setLoading(false);
					if (mode === "refresh") setRefreshing(false);
				}
			}
		},
		[isConnected, setItems],
	);

	// Initial fetch on mount.
	useEffect(() => {
		void fetchPending("initial");
	}, [fetchPending]);

	// Refetch when the app returns to the foreground.
	useEffect(() => {
		const subscription = AppState.addEventListener(
			"change",
			(nextState: AppStateStatus) => {
				const previous = appStateRef.current;
				appStateRef.current = nextState;
				if (
					previous.match(/inactive|background/) &&
					nextState === "active"
				) {
					void fetchPending("silent");
				}
			},
		);
		return () => subscription.remove();
	}, [fetchPending]);

	// Live updates from the node event bus.
	useApprovalStream({
		onCreated: useCallback(
			(approval: ApprovalRequest) => upsert(approval),
			[upsert],
		),
		onUpdated: useCallback(
			(approval: ApprovalRequest) => upsert(approval),
			[upsert],
		),
	});

	/**
	 * 409 recovery: the decision landed but the response was lost. Recover
	 * the decided request via the idempotency receipt when the receipt key
	 * exists; otherwise refetch the list. Rejects on any other failure.
	 */
	const decideWithRecovery = useCallback(
		async (
			approval: ApprovalRequest,
			decide: () => Promise<ApprovalRequest>,
		): Promise<ApprovalRequest> => {
			try {
				return await decide();
			} catch (err) {
				if (err instanceof ApiError && err.status === 409) {
					if (approval.thread_id && approval.tool_call_id) {
						try {
							const { approval: decided } =
								await approvalsApi.receipt(
									approval.thread_id,
									approval.tool_call_id,
								);
							return decided;
						} catch {
							// Receipt missing: fall through to a list refetch.
						}
					}
					await fetchPending("silent");
					return approval;
				}
				throw err;
			}
		},
		[fetchPending],
	);

	const handleApprove = useCallback(
		(approval: ApprovalRequest) =>
			decideWithRecovery(approval, () => approvalsApi.approve(approval.id)),
		[decideWithRecovery],
	);

	const handleDeny = useCallback(
		(approval: ApprovalRequest, reason: string) =>
			decideWithRecovery(approval, () =>
				approvalsApi.deny(approval.id, reason),
			),
		[decideWithRecovery],
	);

	const handleSettled = useCallback(
		(id: string) => removeItem(id),
		[removeItem],
	);

	const renderItem = useCallback(
		({ item }: { item: ApprovalRequest }) => (
			<ApprovalCard
				approval={item}
				now={now}
				onApprove={handleApprove}
				onDeny={handleDeny}
				onSettled={handleSettled}
			/>
		),
		[now, handleApprove, handleDeny, handleSettled],
	);

	if (loading) {
		return (
			<View
				style={styles.container}
			>
				<View style={styles.skeletonList}>
					<SkeletonCard />
					<SkeletonCard />
				</View>
			</View>
		);
	}

	if (error) {
		return (
			<View
				style={[
					styles.container,
					styles.centered,
				]}
			>
				<Text
					style={[
						typography.uiLabel,
						fontStyle("600"),
						styles.message,
						{ color: colors.foreground },
					]}
				>
					Could not load approvals
				</Text>
				<Text
					style={[
						typography.meta,
						styles.message,
						{ color: colors.mutedForeground },
					]}
				>
					{error}
				</Text>
				<Button
					variant="outline"
					size="sm"
					onPress={() => void fetchPending("initial")}
				>
					<Text
						style={[
							typography.uiLabel,
							fontStyle("600"),
							{ color: colors.foreground },
						]}
					>
						Retry
					</Text>
				</Button>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<FlatList
				data={items}
				keyExtractor={(item) => item.id}
				renderItem={renderItem}
				contentContainerStyle={[
					styles.listContent,
					items.length === 0 && styles.emptyListContent,
					{ paddingBottom: insets.bottom + Spacing.md },
				]}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={() => void fetchPending("refresh")}
						tintColor={colors.mutedForeground}
					/>
				}
				ListHeaderComponent={
					items.length > 0 ? (
						<View style={styles.listHeader}>
							<Text
								style={[
									typography.meta,
									fontStyle("600"),
									{ color: colors.mutedForeground },
								]}
							>
								{items.length === 1
									? "1 approval waiting"
									: `${items.length} approvals waiting`}
							</Text>
							<IconButton
								icon={
									<RefreshIcon
										color={colors.mutedForeground}
										size={16}
									/>
								}
								variant="ghost"
								size="icon-sm"
								onPress={() => void fetchPending("refresh")}
								accessibilityLabel="Refresh approvals"
							/>
						</View>
					) : null
				}
				ListEmptyComponent={
					<View style={styles.empty}>
						<Text
							style={[
								typography.uiLabel,
								fontStyle("600"),
								styles.message,
								{ color: colors.foreground },
							]}
						>
							All clear.
						</Text>
						<Text
							style={[
								typography.meta,
								styles.message,
								{ color: colors.mutedForeground },
							]}
						>
							Nothing needs your approval.
						</Text>
					</View>
				}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	centered: {
		alignItems: "center",
		justifyContent: "center",
		padding: Spacing.lg,
		gap: Spacing.sm,
	},
	skeletonList: {
		padding: Spacing.md,
		gap: Spacing.md,
	},
	listContent: {
		paddingTop: Spacing.sm,
	},
	emptyListContent: {
		flexGrow: 1,
		justifyContent: "center",
	},
	listHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: Spacing.md,
		paddingVertical: Spacing.xs,
	},
	empty: {
		alignItems: "center",
		justifyContent: "center",
		padding: Spacing.lg,
		gap: Spacing.xs,
	},
	message: {
		textAlign: "center",
	},
});
