import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getStreak } from "./api";

const CHANNEL_ID = "racha";
const LOOKAHEAD_DAYS = 7;
const DEFAULT_HOUR = 20;

const configKey = (userId) => `streak_reminder:${userId}`;
const promptKey = (userId) => `streak_prompt_seen:${userId}`;

const logError = (context, error) =>
  console.warn(`[recordatorio racha] ${context}:`, error);

// Escape hatch de desarrollo para previsualizar el modal aunque ya se haya visto.
const DEV_FORCE = process.env.EXPO_PUBLIC_DEV_STREAKPROMPT === "1";

export const DEFAULT_CONFIG = Object.freeze({ enabled: false, hour: DEFAULT_HOUR, minute: 0, notifIds: [] });

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
  } catch (e) {
    logError("marcar prompt de racha visto", e);
  }
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
  } catch (e) {
    logError("crear canal de recordatorios", e);
  }
}

function streakBody() {
  return "Hoy es un buen día para leer. 15 minutos cuentan para tu racha.";
}

/**
 * Ventana de ocurrencias a programar: desde hoy (o mañana si skipToday) hasta
 * LOOKAHEAD_DAYS días a la hora configurada, filtrando las ya pasadas.
 */
function targetSlots(now, hour, minute, { skipToday = false } = {}) {
  const slots = [];
  const startOffset = skipToday ? 1 : 0;
  for (let i = startOffset; i < LOOKAHEAD_DAYS + startOffset; i++) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (t.getTime() > now.getTime()) slots.push(t);
  }
  return slots;
}

async function scheduleOneShot(target) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Tu racha de lectura",
      body: streakBody(),
      data: { kind: "streak-reminder", url: "readtrack://reading" },
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
  } catch (e) {
    logError("cancelar notificación programada", e);
  }
}

async function cancelManagedPending() {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of pending) {
      if (notification.content?.data?.kind === "streak-reminder") {
        await cancelPending(notification.identifier);
      }
    }
  } catch (e) {
    logError("consultar notificaciones programadas", e);
  }
}

/**
 * Mantiene una ventana móvil de recordatorios (hoy + LOOKAHEAD_DAYS) a la hora
 * configurada, para que el recordatorio del día exista aunque no se abra la
 * app ese día. Excluye la ocurrencia de hoy si ya hay sesión (hasSessionToday).
 * Idempotente: solo agenda los faltantes y cancela los vencidos o sobrantes.
 */
export async function reconcileStreakReminder(userId, { hasSessionToday, streak } = {}) {
  const cfg = await getStreakReminderConfig(userId);
  if (!cfg.enabled) return cfg;

  await ensureChannel();

  const now = new Date();
  const targets = targetSlots(now, cfg.hour, cfg.minute, { skipToday: !!hasSessionToday });
  const stored = Array.isArray(cfg.notifIds) ? cfg.notifIds : [];
  const idsToCancel = new Set(stored.map((entry) => entry && entry.id).filter(Boolean));
  if (cfg.notifId != null) {
    idsToCancel.add(cfg.notifId);
    delete cfg.notifId;
    delete cfg.scheduledFor;
  }
  await cancelManagedPending();
  for (const id of idsToCancel) await cancelPending(id);

  const nextIds = [];
  for (const slot of targets) {
    const date = slot.getTime();
    const id = await scheduleOneShot(slot);
    if (id != null) {
      nextIds.push({ date, id });
    }
  }

  await saveConfig(userId, { ...cfg, notifIds: nextIds });
  return { ...cfg, notifIds: nextIds };
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
  } catch (e) {
    logError("consultar racha al habilitar", e);
  }
  return reconcileStreakReminder(userId, { hasSessionToday, streak });
}

export async function disableStreakReminder(userId) {
  const cfg = await getStreakReminderConfig(userId);
  const ids = Array.isArray(cfg.notifIds) ? cfg.notifIds : [];
  for (const entry of ids) await cancelPending(entry && entry.id);
  if (cfg.notifId != null) await cancelPending(cfg.notifId);
  await cancelManagedPending();
  const next = { ...DEFAULT_CONFIG };
  await saveConfig(userId, next);
  return next;
}
