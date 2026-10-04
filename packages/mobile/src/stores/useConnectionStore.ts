import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { bytesToHex } from "../lib/shadowAuth";

const STORAGE_KEYS = {
	SERVER_URL: "shadow_server_url",
	DEVICE_ID: "shadow_device_id",
	DEVICE_SECRET: "shadow_device_secret",
	// Stable random device identifier submitted as `public_key` at
	// /pair/start. The node only uses it for the device fingerprint and
	// display; the HMAC-derived secret is the actual credential.
	DEVICE_KEY: "shadow_device_key",
	DIRECTORY: "shadow_directory",
	PINNED_DIRECTORIES: "shadow_pinned_directories",
	// Legacy opencode credentials from before the Shadow rewire. They can
	// never authenticate to the node, so they are deleted on initialize.
	LEGACY_SERVER_URL: "openchamber_server_url",
	LEGACY_AUTH_TOKEN: "openchamber_auth_token",
	LEGACY_DIRECTORY: "openchamber_directory",
	LEGACY_PINNED_DIRECTORIES: "openchamber_pinned_directories",
} as const;

interface ConnectionState {
	serverUrl: string | null;
	deviceId: string | null;
	deviceSecret: string | null;
	directory: string | null;
	homeDirectory: string | null;
	pinnedDirectories: string[];
	isConnected: boolean;
	isInitialized: boolean;
}

interface ConnectionActions {
	initialize: () => Promise<void>;
	setConnection: (
		serverUrl: string,
		deviceId: string,
		deviceSecret: string,
	) => Promise<void>;
	/** Stable per-device identifier for the pairing ceremony. */
	getOrCreateDeviceKey: () => Promise<string>;
	setDirectory: (directory: string) => Promise<void>;
	loadPinnedDirectories: () => Promise<void>;
	togglePinnedDirectory: (path: string) => Promise<void>;
	disconnect: () => Promise<void>;
}

type ConnectionStore = ConnectionState & ConnectionActions;

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
	serverUrl: null,
	deviceId: null,
	deviceSecret: null,
	directory: null,
	homeDirectory: null,
	pinnedDirectories: [],
	isConnected: false,
	isInitialized: false,

	initialize: async () => {
		try {
			// Drop credentials minted for the old opencode server; they are
			// useless against the Shadow Node's HMAC auth.
			await Promise.all([
				SecureStore.deleteItemAsync(STORAGE_KEYS.LEGACY_SERVER_URL),
				SecureStore.deleteItemAsync(STORAGE_KEYS.LEGACY_AUTH_TOKEN),
				SecureStore.deleteItemAsync(STORAGE_KEYS.LEGACY_DIRECTORY),
				SecureStore.deleteItemAsync(STORAGE_KEYS.LEGACY_PINNED_DIRECTORIES),
			]).catch(() => undefined);

			const [serverUrl, deviceId, deviceSecret, directory, pinnedDirectoriesRaw] =
				await Promise.all([
					SecureStore.getItemAsync(STORAGE_KEYS.SERVER_URL),
					SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID),
					SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_SECRET),
					SecureStore.getItemAsync(STORAGE_KEYS.DIRECTORY),
					SecureStore.getItemAsync(STORAGE_KEYS.PINNED_DIRECTORIES),
				]);

			let pinnedDirectories: string[] = [];
			if (pinnedDirectoriesRaw) {
				try {
					pinnedDirectories = JSON.parse(pinnedDirectoriesRaw);
				} catch {
					pinnedDirectories = [];
				}
			}

			set({
				serverUrl,
				deviceId,
				deviceSecret,
				directory,
				pinnedDirectories,
				isConnected: Boolean(serverUrl && deviceId && deviceSecret),
				isInitialized: true,
			});
		} catch {
			set({ isInitialized: true, isConnected: false });
		}
	},

	setConnection: async (serverUrl, deviceId, deviceSecret) => {
		await Promise.all([
			SecureStore.setItemAsync(STORAGE_KEYS.SERVER_URL, serverUrl),
			SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_ID, deviceId),
			SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_SECRET, deviceSecret),
		]);

		set({ serverUrl, deviceId, deviceSecret, isConnected: true });
	},

	getOrCreateDeviceKey: async () => {
		const existing = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_KEY);
		if (existing) {
			return existing;
		}
		// 32 random bytes, hex-encoded. Not a real public key: a stable
		// random identifier the node fingerprints for display.
		const fresh = bytesToHex(
			Uint8Array.from(
				{ length: 32 },
				() => Math.floor(Math.random() * 256),
			),
		);
		await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_KEY, fresh);
		return fresh;
	},

	setDirectory: async (directory: string) => {
		await SecureStore.setItemAsync(STORAGE_KEYS.DIRECTORY, directory);
		set({ directory });
	},

	/**
	 * Pinned directories are local-only for now: the Shadow Node has no
	 * config-settings endpoint (the old opencode sync is gone). The files
	 * rewire (build-order item 4) will decide what pinning means there.
	 */
	loadPinnedDirectories: async () => {
		const raw = await SecureStore.getItemAsync(STORAGE_KEYS.PINNED_DIRECTORIES);
		if (raw) {
			try {
				set({ pinnedDirectories: JSON.parse(raw) });
			} catch {
				// Keep the in-memory value.
			}
		}
	},

	togglePinnedDirectory: async (path: string) => {
		const { pinnedDirectories } = get();
		const isPinned = pinnedDirectories.includes(path);
		const next = isPinned
			? pinnedDirectories.filter((p) => p !== path)
			: [...pinnedDirectories, path];
		set({ pinnedDirectories: next });
		await SecureStore.setItemAsync(
			STORAGE_KEYS.PINNED_DIRECTORIES,
			JSON.stringify(next),
		);
	},

	disconnect: async () => {
		await Promise.all([
			SecureStore.deleteItemAsync(STORAGE_KEYS.SERVER_URL),
			SecureStore.deleteItemAsync(STORAGE_KEYS.DEVICE_ID),
			SecureStore.deleteItemAsync(STORAGE_KEYS.DEVICE_SECRET),
			SecureStore.deleteItemAsync(STORAGE_KEYS.DEVICE_KEY),
			SecureStore.deleteItemAsync(STORAGE_KEYS.DIRECTORY),
			SecureStore.deleteItemAsync(STORAGE_KEYS.PINNED_DIRECTORIES),
		]);

		set({
			serverUrl: null,
			deviceId: null,
			deviceSecret: null,
			directory: null,
			homeDirectory: null,
			pinnedDirectories: [],
			isConnected: false,
		});
	},
}));

export const getConnectionState = () => useConnectionStore.getState();
