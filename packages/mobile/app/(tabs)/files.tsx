import { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
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
import { fontStyle, typography, useTheme } from "../../src/theme";

// ---------------------------------------------------------------------------
// Artifacts tab: read-only browser for the node's durable documents.
// Server contract: GET /artifacts -> {artifacts, total, limit, offset};
// GET /artifacts/{id} -> full artifact JSON; GET /artifacts/{id}/versions
// -> {artifact_id, versions}. Editing (PATCH + expected_version) is out of
// scope for this pass.
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

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
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
						{artifact.kind === "markdown" ? (
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
					{ backgroundColor: colors.background, paddingTop: insets.top },
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
			style={[
				styles.container,
				{ backgroundColor: colors.background, paddingTop: insets.top },
			]}
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
});
