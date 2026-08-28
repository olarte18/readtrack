import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "lectura";

export function configureNotifications() {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {}
}

export async function ensureChannel() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Alarma de lectura",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  } catch {}
}

export async function requestAlarmPermission() {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return { granted: true, available: true };
    const req = await Notifications.requestPermissionsAsync();
    return { granted: req.granted, available: true };
  } catch {
    return { granted: false, available: false };
  }
}

export async function scheduleAlarm(msFromNow, { title, body } = {}) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: title || "ReadTrack",
        body: body || "",
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: Date.now() + msFromNow,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}

export async function cancelAlarm(id) {
  try {
    if (id !== null && id !== undefined) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch {}
}