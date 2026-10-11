import { memo } from "react";
import { Text, View } from "react-native";
import type { Panel } from "@/api/panels";
import { LayersIcon } from "@/components/icons";
import {
	formatPanelFreshness,
	formatPanelRowTime,
} from "@/lib/panelFormat";
import { typography, useTheme } from "@/theme";

interface PanelCardProps {
	panel: Panel;
	/** Epoch millis used for freshness/relative times. Defaults to now. */
	nowMs?: number;
}

/**
 * Glanceable data panel card (Hark backlog item 2).
 *
 * Renders the node's typed panel JSON with one shape for every panel:
 * a header row (title + freshness), one headline insight sentence (the
 * value), stat tiles (label + large number, the receipts), then compact
 * rows with timestamps. Empty panels render an honest empty state;
 * nothing is faked.
 */
export const PanelCard = memo(function PanelCard({
	panel,
	nowMs = Date.now(),
}: PanelCardProps) {
	const { colors } = useTheme();
	const tiles = panel.tiles ?? [];
	const rows = panel.rows ?? [];

	return (
		<View
			className="mx-3 mb-2 p-3 rounded-2xl"
			style={{
				backgroundColor: colors.card,
				borderColor: colors.border,
				borderWidth: 1,
			}}
			accessibilityLabel={`Panel: ${panel.title}`}
		>
			<View className="flex-row items-center justify-between mb-1">
				<View className="flex-row items-center gap-2 flex-1">
					<LayersIcon color={colors.primary} size={18} />
					<Text
						style={[typography.uiLabel, { color: colors.foreground }]}
						numberOfLines={1}
					>
						{panel.title}
					</Text>
				</View>
				<Text style={[typography.micro, { color: colors.mutedForeground }]}>
					{formatPanelFreshness(panel.generated_at, nowMs)}
				</Text>
			</View>

			<Text
				style={[typography.uiLabel, { color: colors.foreground }]}
				accessibilityLabel={`Panel headline: ${panel.headline}`}
			>
				{panel.headline}
			</Text>

			{panel.empty ? (
				<Text
					style={[typography.micro, { color: colors.mutedForeground }]}
					className="mt-1"
				>
					No data to show yet.
				</Text>
			) : (
				<>
					{tiles.length > 0 && (
						<View className="flex-row gap-2 mt-2" accessibilityLabel="Panel stats">
							{tiles.map((tile) => (
								<View
									key={tile.label}
									className="flex-1 px-2 py-2 rounded-xl"
									style={{ backgroundColor: colors.muted }}
									accessibilityLabel={`${tile.label}: ${tile.value}`}
								>
									<Text
										style={[typography.h2, { color: colors.foreground }]}
										numberOfLines={1}
									>
										{tile.value}
									</Text>
									<Text
										style={[typography.micro, { color: colors.mutedForeground }]}
										numberOfLines={1}
									>
										{tile.label}
									</Text>
								</View>
							))}
						</View>
					)}

					{rows.length > 0 && (
						<View className="mt-2">
							{rows.map((row, index) => {
								const time = formatPanelRowTime(row.timestamp, nowMs);
								return (
									<View
										key={`${row.title}-${index}`}
										className="flex-row items-center justify-between py-1.5"
										style={
											index > 0
												? {
														borderTopWidth: 1,
														borderTopColor: colors.border,
												  }
												: undefined
										}
										accessibilityLabel={`Panel row: ${row.title}`}
									>
										<View className="flex-1 mr-2">
											<Text
												style={[
													typography.uiLabel,
													{ color: colors.foreground },
												]}
												numberOfLines={1}
											>
												{row.title}
											</Text>
											{row.detail ? (
												<Text
													style={[
														typography.micro,
														{ color: colors.mutedForeground },
													]}
													numberOfLines={1}
												>
													{row.detail}
												</Text>
											) : null}
										</View>
										{time ? (
											<Text
												style={[
													typography.micro,
													{ color: colors.mutedForeground },
												]}
											>
												{time}
											</Text>
										) : null}
									</View>
								);
							})}
						</View>
					)}
				</>
			)}
		</View>
	);
});

PanelCard.displayName = "PanelCard";
