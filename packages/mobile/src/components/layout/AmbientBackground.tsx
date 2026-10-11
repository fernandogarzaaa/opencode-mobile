import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import {
	AMBIENT_REFRESH_MS,
	getAmbientPalette,
} from "@/theme/ambient";
import { useTheme } from "@/theme";

interface AmbientBackgroundProps {
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
}

/**
 * Full-bleed time-of-day gradient behind its children (backlog item 8).
 * The palette is recomputed from the device clock every minute and
 * whenever the light/dark theme changes. Fully offline.
 */
export function AmbientBackground({ children, style }: AmbientBackgroundProps) {
	const { isDark } = useTheme();
	const [palette, setPalette] = useState(() =>
		getAmbientPalette(new Date(), isDark),
	);

	useEffect(() => {
		setPalette(getAmbientPalette(new Date(), isDark));
		const timer = setInterval(() => {
			setPalette(getAmbientPalette(new Date(), isDark));
		}, AMBIENT_REFRESH_MS);
		return () => clearInterval(timer);
	}, [isDark]);

	return (
		<LinearGradient
			colors={[palette.top, palette.bottom]}
			start={{ x: 0.5, y: 0 }}
			end={{ x: 0.5, y: 1 }}
			style={[styles.fill, style]}
		>
			{children}
		</LinearGradient>
	);
}

const styles = StyleSheet.create({
	fill: {
		flex: 1,
	},
});
