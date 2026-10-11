import { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Button } from "@/components/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	type Artifact,
	type ArtifactMeta,
	type ArtifactVersionInfo,
	artifactsApi,
} from "../../src/api";
import { MarkdownRenderer } from "../../src/components/markdown/MarkdownRenderer";
import {
	ChevronLeftIcon,
	FileIcon,
} from "../../src/components/icons";
import { useConnectionStore } from "../../src/stores/useConnectionStore";
import { ApiError } from "../../src/lib/httpClient";
import { fontStyle, typography, useTheme } from "../../src/theme";

// ---------------------------------------------------------------------------
// Artifacts tab: browser + v1 editor for the node's durable documents.
// Server contract: GET /artifacts -> {artifacts, total, limit, offset};
// GET /artifacts/{id} -> full artifact JSON; GET /artifacts/{id}/versions
// -> {artifact_id, versions}; PATCH /artifacts/{id} with expected_version
// (409 on conflict) for edits.
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(unixSeconds: number): string {
	const d = new Date(unixSeconds * 1000);
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function KindBadge({ kind }: { kind: string }) {
	const { colors } = useTheme();
	return (
		<View
			style={[styles.kindBadge, { backgroundColor: colors.muted }]}
		>
			<Text
				style={[
					typography.micro,
					fontStyle("600"),
					{ color: colors.mutedForeground },
				]}
			>
				{kind}
			</Text>
		</View>
	);
}

function ArtifactRow({
	item,
	onPress,
}: {
	item: ArtifactMeta;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityLabel={`Open artifact: ${item.title}`}
			style={({ pressed }) => [
				styles.row,
				{ borderBottomColor: colors.border },
				pressed && { backgroundColor: colors.muted },
			]}
		>
			<FileIcon size={20} color={colors.primary} />
			<View style={styles.rowText}>
				<Text
					style={[typography.uiLabel, { color: colors.foreground }]}
					numberOfLines={1}
				>
					{item.title}
				</Text>
				<Text
					style={[typography.micro, { color: colors.mutedForeground }]}
					numberOfLines={1}
				>
					v{item.version} · {formatDate(item.updated_at)} ·{" "}
					{formatBytes(item.size_bytes)}
				</Text>
			</View>
			<KindBadge kind={item.kind} />
		</Pressable>
	);
}

function VersionRow({
	info,
	isCurrent,
	onPress,
}: {
	info: ArtifactVersionInfo;
	isCurrent: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityLabel={`View version ${info.version}`}
			style={({ pressed }) => [
				styles.versionRow,
				{ borderBottomColor: colors.border },
				pressed && { backgroundColor: colors.muted },
			]}
		>
			<Text
				style={[
					typography.uiLabel,
					fontStyle("600"),
					{ color: isCurrent ? colors.primary : colors.foreground },
				]}
			>
				v{info.version}
				{isCurrent ? " (current)" : ""}
			</Text>
			<Text style={[typography.micro, { color: colors.mutedForeground }]}>
				{formatDate(info.created_at)} · {formatBytes(info.size_bytes)}
			</Text>
		</Pressable>
	);
}

function ArtifactDetail({
	artifactId,
	onBack,
}: {
	artifactId: string;
	onBack: () => void;
}) {
	const { colors } = useTheme();
	const [artifact, setArtifact] = useState<Artifact | null>(null);
	const [versions, setVersions] = useState<ArtifactVersionInfo[]>([]);
	const [viewingVersion, setViewingVersion] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	// Editing state (v1: plain multiline text input; the node owns conflict
	// detection via expected_version -> 409, artifacts.py:205-209).
	const [editing, setEditing] = useState(false);
	const [draftTitle, setDraftTitle] = useState("");
	const [draftContent, setDraftContent] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	/** Set when a 409 reports the server version moved under our edits. */
	const [conflictVersion, setConflictVersion] = useState<number | null>(null);

	const load = useCallback(
		async (version: number | null) => {
			setIsLoading(true);
			setError(null);
			try {
				const [doc, vers] = await Promise.all([
					version === null
						? artifactsApi.get(artifactId)
						: artifactsApi.getVersion(artifactId, version),
					artifactsApi.versions(artifactId),
				]);
				setArtifact(doc);
				setVersions(
					[...vers].sort((a, b) => b.version - a.version),
				);
				setViewingVersion(version);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load artifact",
				);
			} finally {
				setIsLoading(false);
			}
		},
		[artifactId],
	);

	useEffect(() => {
		load(null);
	}, [load]);

	const startEditing = useCallback(() => {
		if (!artifact || viewingVersion !== null) {
			return;
		}
		setDraftTitle(artifact.title);
		setDraftContent(artifact.content);
		setSaveError(null);
		setConflictVersion(null);
		setEditing(true);
	}, [artifact, viewingVersion]);

	const cancelEditing = useCallback(() => {
		setEditing(false);
		setSaveError(null);
		setConflictVersion(null);
	}, []);

	/**
	 * Save drafts with the version that was read. On 409 the server version
	 * moved: surface the conflict and let the user reload or force-save
	 * once against the fresh version.
	 */
	const saveEdits = useCallback(
		async (forceAgainstVersion: number | null) => {
			if (!artifact || isSaving) {
				return;
			}
			setIsSaving(true);
			setSaveError(null);
			try {
				const updated = await artifactsApi.update(artifact.id, {
					title: draftTitle.trim() || artifact.title,
					content: draftContent,
					expected_version: forceAgainstVersion ?? artifact.version,
				});
				setArtifact(updated);
				setEditing(false);
				setConflictVersion(null);
				Haptics.notificationAsync(
					Haptics.NotificationFeedbackType.Success,
				).catch(() => undefined);
			} catch (err) {
				if (err instanceof ApiError && err.status === 409) {
					// Fetch the latest so the conflict UI can name the version
					// and "save anyway" can retry once against it.
					try {
						const latest = await artifactsApi.get(artifact.id);
						setArtifact(latest);
						setConflictVersion(latest.version);
					} catch {
						setConflictVersion(null);
					}
					setSaveError(
						"This artifact changed on the node while you were editing.",
					);
				} else {
					setSaveError(
						err instanceof Error ? err.message : "Failed to save artifact",
					);
				}
				Haptics.notificationAsync(
					Haptics.NotificationFeedbackType.Error,
				).catch(() => undefined);
			} finally {
				setIsSaving(false);
			}
		},
		[artifact, draftTitle, draftContent, isSaving],
	);

	const reloadLatest = useCallback(() => {
		setEditing(false);
		setSaveError(null);
		setConflictVersion(null);
		load(null);
	}, [load]);

	return (
		<View style={styles.container}>
			<View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
				<Pressable
					onPress={onBack}
					accessibilityLabel="Back to artifacts"
					style={({ pressed }) => [
						styles.backButton,
						pressed && { opacity: 0.6 },
					]}
				>
					<ChevronLeftIcon size={20} color={colors.primary} />
					<Text
						style={[
							typography.uiLabel,
							fontStyle("500"),
							{ color: colors.primary },
						]}
					>
						Artifacts
					</Text>
				</Pressable>
			</View>

			{isLoading ? (
				<View style={styles.centered}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			) : error ? (
				<View style={styles.centered}>
					<Text
						style={[
							typography.body,
							{ color: colors.destructive, textAlign: "center" },
						]}
					>
						{error}
					</Text>
					<Button
						variant="muted"
						size="md"
						onPress={() => load(viewingVersion)}
						style={{ marginTop: 16 }}
					>
						<Button.Label>Retry</Button.Label>
					</Button>
				</View>
			) : (
				artifact && (
					<ScrollView style={styles.detailScroll}>
						<View style={styles.detailTitleRow}>
							<Text
								style={[
									typography.uiHeader,
									{ color: colors.foreground, flex: 1 },
								]}
							>
								{artifact.title}
							</Text>
							<KindBadge kind={artifact.kind} />
							{viewingVersion === null && !editing && (
								<Button
									variant="muted"
									size="sm"
									onPress={() => {
										Haptics.selectionAsync().catch(() => undefined);
										startEditing();
									}}
									accessibilityLabel="Edit artifact"
								>
									<Button.Label>Edit</Button.Label>
								</Button>
							)}
						</View>
						<Text
							style={[
								typography.micro,
								{ color: colors.mutedForeground, marginBottom: 12 },
							]}
						>
							v{artifact.version} · updated{" "}
							{formatDate(artifact.updated_at)}
							{viewingVersion !== null
								? ` · viewing v${viewingVersion}`
								: ""}
						</Text>
						{editing ? (
							<View>
								<Text
									style={[
										typography.micro,
										{ color: colors.mutedForeground, marginBottom: 4 },
									]}
								>
									Editing v{artifact.version} · saved with optimistic
									concurrency
								</Text>
								<TextInput
									value={draftTitle}
									onChangeText={setDraftTitle}
									placeholder="Title"
									placeholderTextColor={colors.mutedForeground}
									accessibilityLabel="Artifact title"
									style={[
										styles.editorTitleInput,
										{
											color: colors.foreground,
											borderColor: colors.border,
										},
									]}
								/>
								<TextInput
									value={draftContent}
									onChangeText={setDraftContent}
									placeholder="Content"
									placeholderTextColor={colors.mutedForeground}
									multiline
									textAlignVertical="top"
									accessibilityLabel="Artifact content"
									style={[
										styles.editorContentInput,
										{
											color: colors.foreground,
											borderColor: colors.border,
										},
									]}
								/>
								{saveError && (
									<View
										style={[
											styles.conflictBanner,
											{ borderColor: colors.destructive },
										]}
									>
										<Text
											style={[
												typography.uiLabel,
												{ color: colors.destructive, marginBottom: 4 },
											]}
										>
											{saveError}
										</Text>
										{conflictVersion !== null && (
											<Text
												style={[
													typography.micro,
													{
														color: colors.mutedForeground,
														marginBottom: 12,
													},
												]}
											>
												The node now has v{conflictVersion}. Your edits
												are kept below; choose how to proceed.
											</Text>
										)}
										<View style={styles.conflictActions}>
											<Button
												variant="muted"
												size="sm"
												onPress={reloadLatest}
												accessibilityLabel="Discard edits and reload latest"
											>
												<Button.Label>Reload latest</Button.Label>
											</Button>
											{conflictVersion !== null && (
												<Button
													variant="muted"
													size="sm"
													disabled={isSaving}
													onPress={() => saveEdits(conflictVersion)}
													accessibilityLabel="Save anyway against the latest version"
												>
													<Button.Label>
														{isSaving ? "Saving..." : "Save anyway"}
													</Button.Label>
												</Button>
											)}
										</View>
									</View>
								)}
								<View style={styles.editorActions}>
									<Button
										variant="muted"
										size="md"
										onPress={cancelEditing}
										disabled={isSaving}
										accessibilityLabel="Cancel editing"
									>
										<Button.Label>Cancel</Button.Label>
									</Button>
									<Button
										size="md"
										onPress={() => saveEdits(null)}
										disabled={isSaving}
										accessibilityLabel="Save artifact"
									>
										<Button.Label>
											{isSaving ? "Saving..." : "Save"}
										</Button.Label>
									</Button>
								</View>
							</View>
						) : artifact.kind === "markdown" ? (
							<MarkdownRenderer content={artifact.content} />
						) : (
							<Text
								style={[
									typography.code,
									{ color: colors.foreground },
								]}
							>
								{artifact.content}
							</Text>
						)}

						<Text
							style={[
								typography.uiLabel,
								fontStyle("600"),
								{
									color: colors.foreground,
									marginTop: 24,
									marginBottom: 4,
								},
							]}
						>
							Versions ({versions.length})
						</Text>
						{versions.map((v) => (
							<VersionRow
								key={v.version}
								info={v}
								isCurrent={v.version === artifact.version}
								onPress={() => load(v.version)}
							/>
						))}
					</ScrollView>
				)
			)}
		</View>
	);
}

export default function FilesScreen() {
	const insets = useSafeAreaInsets();
	const { colors } = useTheme();
	const { isConnected } = useConnectionStore();

	const [artifacts, setArtifacts] = useState<ArtifactMeta[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!isConnected) {
			setError("Not connected");
			setIsLoading(false);
			setIsRefreshing(false);
			return;
		}
		try {
			setError(null);
			const result = await artifactsApi.list({ limit: 50 });
			const sorted = [...result.artifacts].sort(
				(a, b) => b.updated_at - a.updated_at,
			);
			setArtifacts(sorted);
			setTotal(result.total);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load artifacts",
			);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, [isConnected]);

	useEffect(() => {
		load();
	}, [load]);

	const handleRefresh = useCallback(() => {
		setIsRefreshing(true);
		load();
	}, [load]);

	if (selectedId) {
		return (
			<View
				style={[
					styles.container,
					{ paddingTop: insets.top },
				]}
			>
				<ArtifactDetail
					artifactId={selectedId}
					onBack={() => {
						setSelectedId(null);
						load();
					}}
				/>
			</View>
		);
	}

	return (
		<View
			style={[styles.container, { paddingTop: insets.top }]}
		>
			<View style={[styles.header, { borderBottomColor: colors.border }]}>
				<Text style={[typography.uiHeader, { color: colors.foreground }]}>
					Artifacts
				</Text>
				{total > 0 && (
					<Text style={[typography.micro, { color: colors.mutedForeground }]}>
						{total} total
					</Text>
				)}
			</View>

			{isLoading && !isRefreshing ? (
				<View style={styles.centered}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			) : error ? (
				<View style={styles.centered}>
					<Text
						style={[
							typography.body,
							{ color: colors.destructive, textAlign: "center" },
						]}
					>
						{error}
					</Text>
					<Button
						variant="muted"
						size="md"
						onPress={load}
						style={{ marginTop: 16 }}
					>
						<Button.Label>Retry</Button.Label>
					</Button>
				</View>
			) : (
				<FlatList
					data={artifacts}
					keyExtractor={(item) => item.id}
					refreshControl={
						<RefreshControl
							refreshing={isRefreshing}
							onRefresh={handleRefresh}
						/>
					}
					renderItem={({ item }) => (
						<ArtifactRow item={item} onPress={() => setSelectedId(item.id)} />
					)}
					ListEmptyComponent={
						<View style={styles.emptyList}>
							<Text
								style={[typography.body, { color: colors.mutedForeground }]}
							>
								No artifacts yet
							</Text>
						</View>
					}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	header: {
		borderBottomWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	detailHeader: {
		borderBottomWidth: 1,
		paddingHorizontal: 8,
		paddingVertical: 8,
	},
	backButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		paddingVertical: 4,
	},
	centered: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
	},
	emptyList: {
		alignItems: "center",
		paddingVertical: 32,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderBottomWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	rowText: {
		flex: 1,
		gap: 2,
	},
	kindBadge: {
		borderRadius: 6,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	detailScroll: {
		flex: 1,
		paddingHorizontal: 16,
		paddingTop: 12,
		paddingBottom: 32,
	},
	detailTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 4,
	},
	versionRow: {
		borderBottomWidth: 1,
		paddingVertical: 10,
		gap: 2,
	},
	editorTitleInput: {
		borderWidth: 1,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 8,
		fontSize: 16,
	},
	editorContentInput: {
		borderWidth: 1,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		minHeight: 220,
		fontSize: 15,
		lineHeight: 22,
	},
	editorActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		gap: 8,
		marginTop: 12,
	},
	conflictBanner: {
		borderWidth: 1,
		borderRadius: 8,
		padding: 12,
		marginTop: 12,
	},
	conflictActions: {
		flexDirection: "row",
		gap: 8,
	},
});
