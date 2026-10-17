import * as Notifications from "expo-notifications";
import { reconcileStreakReminder } from "../streakReminder";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationChannelAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../api", () => ({ getStreak: jest.fn() }));

const managed = (identifier, kind = "streak-reminder") => ({
  identifier,
  content: { data: { kind } },
});

beforeEach(() => {
  jest.clearAllMocks();
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
    managed("old-reminder"),
    managed("timer-alarm", "timer-alarm"),
  ]);
  Notifications.scheduleNotificationAsync.mockResolvedValue("new-reminder");
});

it("cancela recordatorios antiguos y huérfanos sin tocar otras notificaciones", async () => {
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.setItem(
    "streak_reminder:42",
    JSON.stringify({ enabled: true, hour: 20, minute: 0, notifIds: [{ date: 1, id: "forgotten" }] })
  );

  await reconcileStreakReminder("42", { hasSessionToday: false, streak: 9 });

  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-reminder");
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("forgotten");
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith("timer-alarm");
});

it("no incluye una racha guardada al programar un recordatorio", async () => {
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.setItem(
    "streak_reminder:42",
    JSON.stringify({ enabled: true, hour: 20, minute: 0, notifIds: [] })
  );

  await reconcileStreakReminder("42", { hasSessionToday: false, streak: 9 });

  const scheduledContent = Notifications.scheduleNotificationAsync.mock.calls[0][0].content;
  expect(scheduledContent.body).not.toContain("9 días");
  expect(scheduledContent.body).toContain("tu racha");
});
