import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, CardContent, CardHeader } from "@/components/ui";
import { LockIcon } from "@/components/icons";
import { useConnectionStore } from "@/stores/useConnectionStore";
import { typography, useTheme } from "@/theme";

type BiometryState = "unknown" | "unavailable" | "locked" | "unlocked";

/**
 * Setup gate (OpenDots backlog #9): blocks the tab UI until the device is
 * paired and credentials are configured. The index screen redirects
 * connected users to the tabs, but deep links can land on `/(tabs)/*`
 * directly; without this gate those screens render in a broken,
 * unauthenticated state.
 *
 * Biometric gate (goal build-order item 3): once paired, the tab UI stays
 * behind a Face ID / Touch ID / device-passcode prompt. The gate engages
 * on mount and re-engages whenever the app returns to the foreground, so
 * the approvals inbox (the consent command center) is never left exposed
 * on an unattended device. When the OS reports no usable biometry or
 * passcode, the gate stands down and renders children directly.
 *
 * Kept decoupled from the node API: it reads only the local connection
 * store (server URL + device credentials persisted via SecureStore).
 */
export function SetupGate({ children }: { children: ReactNode }) {
	const { isInitialized, isConnected, serverUrl, deviceId, deviceSecret } = useConnectionStore();
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const [biometry, setBiometry] = useState<BiometryState>("unknown");
	const [authError, setAuthError] = useState<string | null>(null);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const lock = useCallback(async () => {
		setAuthError(null);
		setBiometry("locked");
		try {
			const result = await LocalAuthentication.authenticateAsync({
				promptMessage: "Unlock Shadow",
				cancelLabel: "Cancel",
				disableDeviceFallback: false,
			});
			if (!mountedRef.current) {
				return;
			}
			if (result.success) {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
				setBiometry("unlocked");
			} else {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
				setAuthError(
					"Authentication did not complete. Try again to unlock.",
				);
			}
		} catch (error) {
			if (!mountedRef.current) {
				return;
			}
			setAuthError(
				error instanceof Error ? error.message : "Authentication failed.",
			);
		}
	}, []);

	// Engage the gate once the device is paired.
	useEffect(() => {
		if (!isInitialized || !isConnected) {
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const [hasHardware, enrolled] = await Promise.all([
					LocalAuthentication.hasHardwareAsync(),
					LocalAuthentication.isEnrolledAsync(),
				]);
				if (cancelled || !mountedRef.current) {
					return;
				}
				if (hasHardware && enrolled) {
					await lock();
				} else {
					setBiometry("unavailable");
				}
			} catch {
				if (!cancelled && mountedRef.current) {
					setBiometry("unavailable");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [isInitialized, isConnected, lock]);

	// Re-engage when the app returns to the foreground.
	useEffect(() => {
		let previous = AppState.currentState;
		const subscription = AppState.addEventListener("change", (next) => {
			if (
				(previous === "background" || previous === "inactive") &&
				next === "active" &&
				mountedRef.current
			) {
				void (async () => {
					try {
						const [hasHardware, enrolled] = await Promise.all([
							LocalAuthentication.hasHardwareAsync(),
							LocalAuthentication.isEnrolledAsync(),
						]);
						if (mountedRef.current && hasHardware && enrolled) {
							await lock();
						}
					} catch {
						// Keep the current state; a failed re-check must not
						// unlock the UI by itself.
					}
				})();
			}
			previous = next;
		});
		return () => subscription.remove();
	}, [lock]);

	const goToOnboarding = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		router.replace("/onboarding");
	}, []);

	const retryUnlock = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		void lock();
	}, [lock]);

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

	const isSetUp = isConnected && !!serverUrl && !!deviceId && !!deviceSecret;
	if (!isSetUp) {
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
							Pair this device with your Shadow Node to start. Your
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

	if (biometry === "locked" || biometry === "unknown") {
		return (
			<View
				style={{
					flex: 1,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: colors.background,
					paddingHorizontal: 32,
					paddingTop: insets.top,
					paddingBottom: insets.bottom,
				}}
			>
				<LockIcon size={48} color={colors.mutedForeground} />
				<Text
					style={[
						typography.uiHeader,
						{ color: colors.foreground, textAlign: "center", marginTop: 24 },
					]}
				>
					Shadow is locked
				</Text>
				<Text
					style={[
						typography.meta,
						{
							color: colors.mutedForeground,
							textAlign: "center",
							marginTop: 8,
							lineHeight: 20,
						},
					]}
				>
					Authenticate to reveal your agent, approvals, and chats.
				</Text>
				{biometry === "locked" && (
					<View style={{ width: "100%", maxWidth: 280, marginTop: 24 }}>
						<Button onPress={retryUnlock} accessibilityLabel="Unlock Shadow">
							<Button.Label>Unlock</Button.Label>
						</Button>
						{authError && (
							<Text
								style={[
									typography.meta,
									{
										color: colors.destructive,
										textAlign: "center",
										marginTop: 12,
										lineHeight: 18,
									},
								]}
							>
								{authError}
							</Text>
						)}
					</View>
				)}
				{biometry === "unknown" && (
					<ActivityIndicator
						size="small"
						color={colors.primary}
						style={{ marginTop: 24 }}
					/>
				)}
			</View>
		);
	}

	return <>{children}</>;
}
