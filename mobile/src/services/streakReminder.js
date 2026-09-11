import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getStreak } from "./api";

const CHANNEL_ID = "racha";
const REMINDER_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HOUR = 20;

const configKey = (userId) => `streak_reminder:${userId}`;
const promptKey = (userId) => `streak_prompt_seen:${userId}`;

// Escape hatch de desarrollo para previsualizar el modal aunque ya se haya visto.
const DEV_FORCE = process.env.EXPO_PUBLIC_DEV_STREAKPROMPT === "1";

export const DEFAULT_CONFIG = Object.freeze({ enabled: false, hour: DEFAULT_HOUR, minute: 0, scheduledFor: null, notifId: null });

export async function shouldShowStreakPrompt(userId) {
  try {
    if (DEV_FORCE) return true;
    return (await AsyncStorage.getItem(promptKey(userId))) !== "1";
  } catch {
    return false;
  }
}

export async function markStreakPromptSeen(userId) {
  try {
    await AsyncStorage.setItem(promptKey(userId), "1");
  } catch {}
}

export async function getStreakReminderConfig(userId) {
  try {
    const raw = await AsyncStorage.getItem(configKey(userId));
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(userId, cfg) {
  await AsyncStorage.setItem(configKey(userId), JSON.stringify(cfg));
}

export async function requestNotificationPermission() {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return { granted: true, canAsk: true };
    const req = await Notifications.requestPermissionsAsync();
    return { granted: req.granted, canAsk: req.canAskAgain };
  } catch {
    return { granted: false, canAsk: false };
  }
}

async function ensureChannel() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Recordatorio de racha",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 150, 150],
      });
    }
  } catch {}
}

function streakBody(streak) {
  if (streak && streak > 0) {
    return `Hoy aún no lees. 15 minutos mantienen tu racha de ${streak} ${streak === 1 ? "día" : "días"}.`;
  }
  return "¡Da el primer paso! 15 minutos hoy arrancan tu racha.";
}

function nextTarget(now, hour, minute) {
  const t = new Date(now);
  t.setHours(hour, minute, 0, 0);
  if (t.getTime() <= now.getTime()) t.setTime(t.getTime() + REMINDER_MS);
  return t;
}

async function scheduleOneShot(target, streak) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Tu racha de lectura",
      body: streakBody(streak),
      data: { kind: "streak-reminder" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: target.getTime(),
      channelId: CHANNEL_ID,
    },
  });
}

async function cancelPending(id) {
  if (id == null) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

/**
 * Agenda el recordatorio del día si el usuario NO tiene sesión hoy y la hora
 * aún no ha pasado; si ya leyó hoy (hasSessionToday), cancela lo pendiente.
 * Idempotente: no re-agenda si el objetivo ya está programado.
 */
export async function reconcileStreakReminder(userId, { hasSessionToday, streak } = {}) {
  const cfg = await getStreakReminderConfig(userId);
  if (!cfg.enabled) return cfg;

  await ensureChannel();

  if (hasSessionToday) {
    if (cfg.notifId != null) {
      await cancelPending(cfg.notifId);
      await saveConfig(userId, { ...cfg, scheduledFor: null, notifId: null });
    }
    return cfg;
  }

  const now = new Date();
  const target = nextTarget(now, cfg.hour, cfg.minute);
  const key = target.toISOString();

  if (cfg.scheduledFor === key && cfg.notifId != null) return cfg;

  await cancelPending(cfg.notifId);
  try {
    const id = await scheduleOneShot(target, streak);
    const next = { ...cfg, scheduledFor: key, notifId: id };
    await saveConfig(userId, next);
    return next;
  } catch {
    return cfg;
  }
}

export async function enableStreakReminder(userId, { hour, minute }) {
  const cfg = await getStreakReminderConfig(userId);
  const next = { ...cfg, enabled: true, hour, minute };
  await saveConfig(userId, next);
  let hasSessionToday = false;
  let streak = 0;
  try {
    const s = await getStreak();
    hasSessionToday = !!s.hasSessionToday;
    streak = s.current ?? 0;
  } catch {}
  return reconcileStreakReminder(userId, { hasSessionToday, streak });
}

export async function disableStreakReminder(userId) {
  const cfg = await getStreakReminderConfig(userId);
  await cancelPending(cfg.notifId);
  const next = { ...DEFAULT_CONFIG };
  await saveConfig(userId, next);
  return next;
}