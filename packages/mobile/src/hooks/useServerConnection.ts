import * as Device from "expo-device";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import {
	shadowPairConfirm,
	shadowPairStart,
	type PairStartResponse,
} from "../lib/shadowAuth";
import { useConnectionStore } from "../stores/useConnectionStore";

const CONNECTION_TIMEOUT_MS = 15000;
const CONFIRM_POLL_INTERVAL_MS = 2000;

interface ServerConnectionState {
	isConnecting: boolean;
	error: Error | null;
}

export interface PairingSession extends PairStartResponse {
	serverUrl: string;
}

function normalizeServerUrl(url: string): string {
	let normalized = url.trim();

	if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
		normalized = `http://${normalized}`;
	}

	if (normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}

	return normalized;
}

async function getDeviceName(): Promise<string> {
	const deviceName = Device.deviceName;
	const modelName = Device.modelName;
	return (
		deviceName ||
		modelName ||
		`${Platform.OS === "ios" ? "iOS" : "Android"} Device`
	);
}

async function checkHealth(baseUrl: string): Promise<void> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
	try {
		const response = await fetch(`${baseUrl}/health`, {
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`Node returned HTTP ${response.status}`);
		}
	} catch {
		throw new Error(
			"Cannot reach the node. Check the URL and ensure it is running and reachable from this device.",
		);
	} finally {
		clearTimeout(timeoutId);
	}
}

export function useServerConnection() {
	const [state, setState] = useState<ServerConnectionState>({
		isConnecting: false,
		error: null,
	});
	const pollCancelledRef = useRef(false);

	const { setConnection, disconnect: storeDisconnect } = useConnectionStore();

	/**
	 * Begin the Shadow pairing ceremony: POST /pair/start.
	 * Returns the pairing session; the returned `code` must be approved
	 * on the node (owner device, or automatic on first-ever bootstrap
	 * pairing) before credentials can be collected.
	 */
	const startPairing = useCallback(async (serverUrl: string): Promise<PairingSession> => {
		setState({ isConnecting: true, error: null });
		try {
			const normalizedUrl = normalizeServerUrl(serverUrl);
			await checkHealth(normalizedUrl);

			const [deviceName, deviceKey] = await Promise.all([
				getDeviceName(),
				useConnectionStore.getState().getOrCreateDeviceKey(),
			]);

			const started = await shadowPairStart(normalizedUrl, deviceName, deviceKey);
			setState({ isConnecting: false, error: null });
			return { ...started, serverUrl: normalizedUrl };
		} catch (error) {
			const err = error instanceof Error ? error : new Error("Unknown error");
			setState({ isConnecting: false, error: err });
			throw err;
		}
	}, []);

	/**
	 * Poll POST /pair/confirm until the owner approves (or bootstrap
	 * auto-approves), then persist the device credentials and mark the
	 * device connected. Resolves with the minted device id.
	 */
	const awaitPairingApproval = useCallback(
		async (
			session: PairingSession,
			onTick?: (elapsedSeconds: number) => void,
		): Promise<string> => {
			pollCancelledRef.current = false;
			setState({ isConnecting: true, error: null });
			const deadline = Date.now() + session.expires_in_seconds * 1000;
			const startedAt = Date.now();
			try {
				for (;;) {
					if (pollCancelledRef.current) {
						throw new Error("Pairing cancelled.");
					}
					if (Date.now() > deadline) {
						throw new Error("Pairing code expired. Start pairing again.");
					}
					const confirmed = await shadowPairConfirm(
						session.serverUrl,
						session.pairing_id,
					);
					if (confirmed) {
						await setConnection(
							session.serverUrl,
							confirmed.device.id,
							confirmed.secret,
						);
						setState({ isConnecting: false, error: null });
						return confirmed.device.id;
					}
					onTick?.(Math.floor((Date.now() - startedAt) / 1000));
					await new Promise((resolve) =>
						setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS),
					);
				}
			} catch (error) {
				const err = error instanceof Error ? error : new Error("Unknown error");
				setState({ isConnecting: false, error: err });
				throw err;
			}
		},
		[setConnection],
	);

	const cancelPairing = useCallback(() => {
		pollCancelledRef.current = true;
		setState({ isConnecting: false, error: null });
	}, []);

	const disconnect = useCallback(async () => {
		await storeDisconnect();
	}, [storeDisconnect]);

	const getStoredConnection = useCallback(() => {
		const state = useConnectionStore.getState();
		return state.serverUrl && state.deviceId && state.deviceSecret
			? {
					serverUrl: state.serverUrl,
					deviceId: state.deviceId,
				}
			: null;
	}, []);

	return {
		...state,
		startPairing,
		awaitPairingApproval,
		cancelPairing,
		disconnect,
		getStoredConnection,
	};
}
