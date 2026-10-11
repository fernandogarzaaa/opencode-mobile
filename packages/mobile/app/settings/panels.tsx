import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	RefreshControl,
	ScrollView,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	panelsApi,
	type CustomPanelDef,
	type Panel,
} from "@/api/panels";
import { ChevronLeft, TrashIcon } from "@/components/icons";
import { PanelCard } from "@/components/panels";
import { ApiError } from "@/lib/httpClient";
import { customPanelDefSummary } from "@/lib/panelFormat";
import { typography, useTheme } from "@/theme";

/**
 * Panels settings screen (Hark backlog item 2, client half).
 *
 * One place to see every glanceable panel: the node's built-in panels
 * (GET /panels) plus the user's custom panels (GET /custom-panels,
 * each rendered through GET /custom-panels/{id}/render). Custom panels
 * can be deleted here; deletion is irreversible on the node and needs
 * explicit confirmation, which this screen always sends.
 */
export default function PanelsScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const [panels, setPanels] = useState<Panel[]>([]);
	const [customDefs, setCustomDefs] = useState<CustomPanelDef[]>([]);
	const [customRendered, setCustomRendered] = useState<Record<string, Panel>>(
		{},
	);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [nodeMissing, setNodeMissing] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const loadPanels = useCallback(async (showRefresh: boolean) => {
		if (showRefresh) {
			setIsRefreshing(true);
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		} else {
			setIsLoading(true);
		}
		setNodeMissing(false);
		try {
			const [builtIn, defs] = await Promise.all([
				panelsApi.listPanels({ refresh: true }),
				panelsApi.listCustom().catch(() => [] as CustomPanelDef[]),
			]);
			setPanels(builtIn);
			setCustomDefs(defs);
			const rendered: Record<string, Panel> = {};
			await Promise.all(
				defs.map(async (def) => {
					try {
						rendered[def.id] = await panelsApi.renderCustom(def.id);
					} catch {
						// One broken panel must not hide the rest.
					}
				}),
			);
			setCustomRendered(rendered);
		} catch (error) {
			if (error instanceof ApiError && error.status === 404) {
				setNodeMissing(true);
			}
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		loadPanels(false);
	}, [loadPanels]);

	const handleRefresh = useCallback(() => {
		loadPanels(true);
	}, [loadPanels]);

	const handleDelete = useCallback(
		(def: CustomPanelDef) => {
			Alert.alert(
				"Delete panel",
				`Delete "${def.name}"? This cannot be undone.`,
				[
					{ text: "Cancel", style: "cancel" },
					{
						text: "Delete",
						style: "destructive",
						onPress: async () => {
							setDeletingId(def.id);
							Haptics.impactAsync(
								Haptics.ImpactFeedbackStyle.Medium,
							).catch(() => {});
							try {
								await panelsApi.deleteCustom(def.id);
								loadPanels(false);
							} catch {
								Alert.alert(
									"Delete failed",
									"Could not delete the panel. Try again.",
								);
							} finally {
								setDeletingId(null);
							}
						},
					},
				],
			);
		},
		[loadPanels],
	);

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<View
				className="flex-row items-center px-4 pb-3"
				style={{
					paddingTop: insets.top + 8,
					borderBottomWidth: 1,
					borderBottomColor: colors.border,
				}}
			>
				<Pressable
					onPress={() => router.back()}
					hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
					accessibilityLabel="Back to settings"
				>
					<ChevronLeft size={24} color={colors.foreground} />
				</Pressable>
				<Text
					style={[typography.uiHeader, { color: colors.foreground }]}
					className="ml-2"
				>
					Panels
				</Text>
			</View>

			{isLoading ? (
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator color={colors.primary} />
				</View>
			) : nodeMissing ? (
				<View className="flex-1 items-center justify-center px-6">
					<Text
						style={[typography.uiLabel, { color: colors.mutedForeground }]}
						className="text-center"
					>
						Your node does not have the panels API yet. Update the Shadow
						Node to see glanceable panels here.
					</Text>
				</View>
			) : (
				<ScrollView
					refreshControl={
						<RefreshControl
							refreshing={isRefreshing}
							onRefresh={handleRefresh}
							tintColor={colors.primary}
						/>
					}
				>
					<View className="py-3">
						<Text
							style={[typography.micro, { color: colors.mutedForeground }]}
							className="px-4 mb-1 uppercase"
						>
							Built in
						</Text>
						{panels.length === 0 ? (
							<Text
								style={[typography.micro, { color: colors.mutedForeground }]}
								className="px-4 py-2"
							>
								No panels returned by the node.
							</Text>
						) : (
							panels.map((panel) => (
								<PanelCard key={panel.id} panel={panel} />
							))
						)}

						<Text
							style={[typography.micro, { color: colors.mutedForeground }]}
							className="px-4 mb-1 mt-3 uppercase"
						>
							Custom
						</Text>
						{customDefs.length === 0 ? (
							<Text
								style={[typography.micro, { color: colors.mutedForeground }]}
								className="px-4 py-2"
							>
								No custom panels. In chat, ask me to make one, for example
								"make a panel showing my top 5 overdue goals".
							</Text>
						) : (
							customDefs.map((def) => (
								<View key={def.id} className="mb-1">
									<View className="flex-row items-center justify-between px-4 py-1">
										<View className="flex-1 mr-2">
											<Text
												style={[
													typography.uiLabel,
													{ color: colors.foreground },
												]}
												numberOfLines={1}
											>
												{def.name}
											</Text>
											<Text
												style={[
													typography.micro,
													{ color: colors.mutedForeground },
												]}
												numberOfLines={1}
											>
												{customPanelDefSummary(def)}
											</Text>
										</View>
										<Pressable
											onPress={() => handleDelete(def)}
											disabled={deletingId === def.id}
											accessibilityLabel={`Delete panel ${def.name}`}
											accessibilityRole="button"
											className="p-2"
										>
											<TrashIcon
												color={colors.destructive}
												size={18}
											/>
										</Pressable>
									</View>
									{customRendered[def.id] ? (
										<PanelCard panel={customRendered[def.id]} />
									) : null}
								</View>
							))
						)}
					</View>
				</ScrollView>
			)}
		</View>
	);
}
