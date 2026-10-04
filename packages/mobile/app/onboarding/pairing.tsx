import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeftIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { useServerConnection, type PairingSession } from "@/hooks/useServerConnection";
import { Spacing, typography, useTheme } from "../../src/theme";

type Phase = "waiting" | "error";

function formatCountdown(totalSeconds: number, elapsedSeconds: number): string {
	const remaining = Math.max(0, totalSeconds - elapsedSeconds);
	const minutes = Math.floor(remaining / 60);
	const seconds = remaining % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function PairingScreen() {
	const insets = useSafeAreaInsets();
	const { colors } = useTheme();
	const params = useLocalSearchParams<{
		pairing_id: string;
		code: string;
		expires_in_seconds: string;
		serverUrl: string;
	}>();
	const { awaitPairingApproval, cancelPairing, isConnecting } = useServerConnection();
	const [phase, setPhase] = useState<Phase>("waiting");
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const [errorMessage, setErrorMessage] = useState("");
	const startedRef = useRef(false);

	const session: PairingSession = {
		pairing_id: params.pairing_id ?? "",
		code: params.code ?? "",
		expires_in_seconds: Number(params.expires_in_seconds ?? 300),
		serverUrl: params.serverUrl ?? "",
	};

	useEffect(() => {
		if (startedRef.current) {
			return;
		}
		startedRef.current = true;

		if (!session.pairing_id || !session.serverUrl) {
			setErrorMessage("Pairing session is missing. Go back and try again.");
			setPhase("error");
			return;
		}

		let cancelled = false;
		awaitPairingApproval(session, (elapsed) => {
			if (!cancelled) {
				setElapsedSeconds(elapsed);
			}
		})
			.then(() => {
				if (cancelled) {
					return;
				}
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
				router.replace("/(tabs)/chat");
			})
			.catch((error: unknown) => {
				if (cancelled) {
					return;
				}
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
				setErrorMessage(
					error instanceof Error ? error.message : "Pairing failed.",
				);
				setPhase("error");
			});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function handleCancel() {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		cancelPairing();
		router.back();
	}

	function handleRetry() {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		router.back();
	}

	function handleCopyCode() {
		Haptics.selectionAsync();
		Alert.alert("Pairing code", session.code);
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<View
				style={{
					paddingTop: insets.top + Spacing.md,
					paddingBottom: insets.bottom + Spacing.xl,
					paddingHorizontal: Spacing.lg,
					flex: 1,
				}}
			>
				<Pressable
					onPress={handleCancel}
					style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
					hitSlop={8}
				>
					<ChevronLeftIcon size={18} color={colors.foreground} />
					<Text style={[typography.uiLabel, { color: colors.foreground }]}>
						Cancel
					</Text>
				</Pressable>

				<View style={styles.body}>
					<Text style={[typography.h2, { color: colors.foreground, textAlign: "center" }]}>
						Approve this device
					</Text>
					<Text
						style={[
							typography.meta,
							{ color: colors.mutedForeground, textAlign: "center", marginTop: 8, lineHeight: 20 },
						]}
					>
						Enter this code on your Shadow Node, or approve it from an
						already-paired owner device.
					</Text>

					<Pressable
						onPress={handleCopyCode}
						style={[styles.codeCard, { borderColor: `${colors.border}66` }]}
					>
						<Text style={[styles.code, { color: colors.primary }]}>
							{session.code}
						</Text>
						<Text style={[typography.micro, { color: colors.mutedForeground, marginTop: 8 }]}>
							Tap to view
						</Text>
					</Pressable>

					{phase === "waiting" ? (
						<View style={styles.statusRow}>
							<ActivityIndicator size="small" color={colors.primary} />
							<Text style={[typography.meta, { color: colors.mutedForeground }]}>
								Waiting for approval · {formatCountdown(session.expires_in_seconds, elapsedSeconds)}
							</Text>
						</View>
					) : (
						<View style={styles.errorBox}>
							<Text style={[typography.meta, { color: colors.destructive, textAlign: "center", lineHeight: 20 }]}>
								{errorMessage}
							</Text>
							<Button
								variant="outline"
								size="lg"
								onPress={handleRetry}
								style={{ width: "100%", marginTop: 16 }}
							>
								<Button.Label>Try again</Button.Label>
							</Button>
						</View>
					)}
				</View>

				<View style={styles.footer}>
					<Button
						variant="ghost"
						size="lg"
						onPress={handleCancel}
						isDisabled={isConnecting && phase === "waiting"}
						style={{ width: "100%" }}
					>
						<Button.Label>Cancel pairing</Button.Label>
					</Button>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	backBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
		paddingVertical: 8,
		paddingRight: 12,
	},
	body: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 8,
	},
	codeCard: {
		borderWidth: 1,
		borderRadius: 12,
		paddingVertical: 24,
		paddingHorizontal: 48,
		marginTop: 32,
		alignItems: "center",
	},
	code: {
		fontSize: 44,
		fontWeight: "700",
		letterSpacing: 8,
		fontVariant: ["tabular-nums"],
	},
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginTop: 32,
	},
	errorBox: {
		marginTop: 32,
		width: "100%",
		alignItems: "center",
	},
	footer: {
		paddingTop: 16,
	},
});
