import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Linking, NativeModules, Platform } from "react-native";

const CHANNEL_ID = "lectura";
const SOUND_FILE = "alarm.wav";
const HINT_SEEN_KEY = "alarm_silent_hint_seen";

const AlarmNative = Platform.OS === "android" ? NativeModules.ReadTrackAlarm : null;
const NATIVE_AVAILABLE = Platform.OS === "android" && !!AlarmNative;

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

export function openFullScreenIntentSettings() {
  try {
    if (Platform.OS === "android" && Platform.Version >= 34 && typeof Linking.sendIntent === "function") {
      Linking.sendIntent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
      return;
    }
  } catch {}
  try {
    if (Platform.OS === "android") Linking.openSettings();
  } catch {}
}

export async function shouldShowAlarmHint() {
  try {
    return (await AsyncStorage.getItem(HINT_SEEN_KEY)) !== "1";
  } catch {
    return true;
  }
}

export async function markAlarmHintSeen() {
  try {
    await AsyncStorage.setItem(HINT_SEEN_KEY, "1");
  } catch {}
}

export async function scheduleAlarm(msFromNow, { title, body } = {}) {
  if (AlarmNative) {
    try {
      await AlarmNative.schedule(Date.now() + msFromNow);
      return Date.now();
    } catch {
      return null;
    }
  }
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
  if (AlarmNative) {
    try {
      AlarmNative.cancel();
    } catch {}
    return;
  }
  try {
    if (id !== null && id !== undefined) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch {}
}

/**
 * Sesión de lectura activa (temporizador o cronómetro). En Android con el
 * módulo nativo arranca el foreground service con notificación de bloqueo y
 * Pausar/Reanudar; en el resto (Expo Go, iOS, web) usa expo-notifications.
 * Devuelve "native" o el id de la notificación fallback.
 */
export async function startAlarmSession({ mode, durationMs, book }) {
  if (NATIVE_AVAILABLE) {
    try {
      await AlarmNative.startAlarmSession({
        mode,
        durationMs: mode === "timer" ? durationMs : 0,
        bookId: String(book.id),
        bookTitle: book.title,
        startPage: Number(book.current_page ?? 0),
      });
      return "native";
    } catch {
      return null;
    }
  }
  if (mode !== "timer") return null;
  try {
    return await scheduleAlarm(durationMs, {
      title: "Tiempo cumplido",
      body: `¡Terminaste tu sesión de ${Math.max(1, Math.round(durationMs / 60000))} minutos!`,
    });
  } catch {
    return null;
  }
}

export async function cancelAlarmSession(id) {
  if (NATIVE_AVAILABLE) {
    try {
      AlarmNative.stopAlarmSession();
    } catch {}
    return;
  }
  await cancelAlarm(id);
}

export async function setAlarmSessionPaused(paused) {
  if (!NATIVE_AVAILABLE) return;
  try {
    AlarmNative.setSessionPaused(!!paused);
  } catch {}
}

export async function getAlarmSessionState() {
  if (!NATIVE_AVAILABLE) return null;
  try {
    return await AlarmNative.getSessionState();
  } catch {
    return null;
  }
}