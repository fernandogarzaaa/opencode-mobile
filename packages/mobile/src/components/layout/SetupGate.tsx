import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, CardContent, CardHeader } from "@/components/ui";
import { useConnectionStore } from "@/stores/useConnectionStore";
import { typography, useTheme } from "@/theme";

/**
 * Setup gate (OpenDots backlog #9): blocks the tab UI until the device is
 * paired and credentials are configured. The index screen redirects
 * connected users to the tabs, but deep links can land on `/(tabs)/*`
 * directly; without this gate those screens render in a broken,
 * unauthenticated state.
 *
 * Kept decoupled from the node API: it reads only the local connection
 * store (server URL + auth token persisted via SecureStore).
 */
export function SetupGate({ children }: { children: ReactNode }) {
	const { isInitialized, isConnected, serverUrl, authToken } = useConnectionStore();
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();

	const goToOnboarding = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		router.replace("/onboarding");
	}, []);

	if (!isInitialized) {
		return (
			<View
				style={{
					flex: 1,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: colors.background,
					paddingTop: insets.top,
					paddingBottom: insets.bottom,
				}}
			>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	const isSetUp = isConnected && !!serverUrl && !!authToken;
	if (isSetUp) {
		return <>{children}</>;
	}

	return (
		<View
			style={{
				flex: 1,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: colors.background,
				paddingHorizontal: 24,
				paddingTop: insets.top,
				paddingBottom: insets.bottom,
			}}
		>
			<Card style={{ width: "100%", maxWidth: 360 }}>
				<CardHeader>
					<Text style={[typography.uiHeader, { color: colors.foreground, textAlign: "center" }]}>
						Connect your server
					</Text>
				</CardHeader>
				<CardContent>
					<Text
						style={[
							typography.markdown,
							{ color: colors.mutedForeground, textAlign: "center", marginBottom: 20 },
						]}
					>
						Pair this device with your OpenCode server to start chatting. Your
						credentials are stored securely on this device.
					</Text>
					<Button onPress={goToOnboarding} accessibilityLabel="Set up connection">
						<Button.Label>Set up connection</Button.Label>
					</Button>
				</CardContent>
			</Card>
		</View>
	);
}
