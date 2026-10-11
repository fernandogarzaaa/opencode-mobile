jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { expoConfig: {} },
}));

jest.mock("expo-device", () => ({
	isDevice: false,
}));

jest.mock("expo-haptics", () => ({
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
	ImpactFeedbackStyle: {},
	NotificationFeedbackType: {},
}));

jest.mock("expo-notifications", () => ({
	setNotificationHandler: jest.fn(),
	setNotificationCategoryAsync: jest.fn(),
	setNotificationChannelAsync: jest.fn(),
	addNotificationResponseReceivedListener: jest.fn(() => ({
		remove: jest.fn(),
	})),
	requestPermissionsAsync: jest.fn(),
	getPermissionsAsync: jest.fn(),
	getExpoPushTokenAsync: jest.fn(),
	dismissNotificationAsync: jest.fn(),
	scheduleNotificationAsync: jest.fn(),
	AndroidImportance: { HIGH: "high" },
	PermissionStatus: { GRANTED: "granted" },
}));

jest.mock("expo-router", () => ({
	router: { push: jest.fn() },
}));

jest.mock("expo-secure-store", () => ({
	getItemAsync: jest.fn(),
	setItemAsync: jest.fn(),
	deleteItemAsync: jest.fn(),
}));

jest.mock("react-native", () => ({
	Platform: { OS: "ios" },
	StyleSheet: { create: (s: unknown) => s },
}));

jest.mock("./httpClient", () => ({
	ApiError: class ApiError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.status = status;
		}
	},
	apiGet: jest.fn(),
	apiPost: jest.fn(),
}));

jest.mock("../stores/useConnectionStore", () => ({
	getConnectionState: jest.fn(() => ({ isConnected: false })),
	useConnectionStore: { getState: jest.fn(() => ({})) },
}));

jest.mock("../api/approvals", () => ({
	approvalsApi: {
		listPending: jest.fn(),
		approve: jest.fn(),
		deny: jest.fn(),
		receipt: jest.fn(),
	},
}));

import {
	onApprovalNotificationTap,
	openApprovalsInbox,
} from "./approvalNotifications";

describe("openApprovalsInbox", () => {
	it("notifies tap listeners with the approval id", () => {
		const listener = jest.fn();
		const unsubscribe = onApprovalNotificationTap(listener);

		openApprovalsInbox("appr-42");

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith("appr-42");
		unsubscribe();
	});

	it("stops notifying after unsubscribe", () => {
		// Kills the mutant that drops the listener call: with no live
		// listeners the emit must be a no-op, not an error.
		const listener = jest.fn();
		const unsubscribe = onApprovalNotificationTap(listener);
		unsubscribe();

		expect(() => openApprovalsInbox("appr-43")).not.toThrow();
		expect(listener).not.toHaveBeenCalled();
	});
});
