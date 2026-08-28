import * as Notifications from "expo-notifications";
import { AppState, Linking, Platform } from "react-native";

const CHANNEL_ID = "lectura";
const SOUND_FILE = "alarm.wav";

let appInForeground = true;

try {
  if (Platform.OS !== "web") {
    AppState.addEventListener("change", (next) => {
      appInForeground = next === "active";
    });
  }
} catch {}

export function configureNotifications() {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => {
        const silent = appInForeground;
        return {
          shouldShowBanner: !silent,
          shouldShowList: !silent,
          shouldPlaySound: !silent,
          shouldSetBadge: false,
        };
      },
    });
  } catch {}
}

export async function ensureChannel() {
  try {
    if (Platform.OS === "android") {
      await Notifications.deleteNotificationChannelAsync(CHANNEL_ID);
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Alarma de lectura",
        importance: Notifications.AndroidImportance.MAX,
        sound: SOUND_FILE,
        bypassDnd: true,
        vibrationPattern: [0, 250, 250, 250],
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          flags: {
            enforceAudibility: true,
            requestHardwareAudioVideoSynchronization: false,
          },
        },
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

export function openAlarmSettings() {
  try {
    if (Platform.OS === "android" && typeof Linking.sendIntent === "function") {
      Linking.sendIntent("android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS");
      return;
    }
  } catch {}
  try {
    if (Platform.OS === "android") Linking.openSettings();
  } catch {}
}

export async function scheduleAlarm(msFromNow, { title, body } = {}) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: title || "ReadTrack",
        body: body || "",
        sound: SOUND_FILE,
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