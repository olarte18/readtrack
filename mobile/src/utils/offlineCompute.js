import { todayString, addDays, diffDays } from "./dates";

// Rachas de días consecutivos con al menos una sesión registrada.
// El día en curso no rompe la racha hasta que termina sin sesiones.
// Trabaja solo con strings YYYY-MM-DD (zona América/Bogota) para evitar
// corrimientos. Port de api/src/utils/streaks.js usando todayString() local.
export function computeStreaks(dates) {
  const set = new Set(dates);
  const DAY_MS = 86400000;

  let current = 0;
  let cursor = todayString();
  if (!set.has(cursor)) cursor = addDays(cursor, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let prev = null;
  for (const date of [...set].sort()) {
    run = prev && diffDays(prev, date) === 1 ? run + 1 : 1;
    prev = date;
    if (run > best) best = run;
  }

  return { current, best };
}

const DAY_MS = 86400000;
const epochDay = (ms) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

// Sesiones locales pendientes cuya fecha de encolado cae hoy (Bogotá).
// Cada item: { type:"save-session", queuedAt, payload:{ session:{ duration_seconds, pages_read } } }.
export function localToday(items = []) {
  const today = todayString();
  return items.filter((i) => i.type === "save-session" && epochDay(i.queuedAt) === today);
}

const sumSeconds = (items) => items.reduce((acc, i) => acc + (i.payload?.session?.duration_seconds ?? 0), 0);
const sumPages = (items) => items.reduce((acc, i) => acc + (i.payload?.session?.pages_read ?? 0), 0);

// /stats/streak — el server cuenta "hoy" solo si ya hay una sesión sincronizada.
// Una sesión local de hoy (aún no sincronizada) enciende hasSessionToday y suma
// 1 a current (que en caché contaba hasta ayer). best se actualiza si hace falta.
export function streakWithLocal(cached, items = []) {
  if (!cached) return cached;
  const local = localToday(items);
  const has = cached.hasSessionToday === true || local.length > 0;
  const current = cached.hasSessionToday === true ? cached.current : cached.current + (local.length > 0 ? 1 : 0);
  return { ...cached, hasSessionToday: has, current, best: Math.max(cached.best ?? 0, current) };
}

// /calendar/:y/:m — suma las sesiones locales de hoy a la celda y actualiza
// racha/flame. Solo toca la celda si el mes visible es el actual.
export function calendarWithLocal(cached, items = []) {
  if (!cached) return cached;
  const local = localToday(items);
  if (local.length === 0) return cached;

  const today = todayString();
  const [y, m] = today.split("-").map(Number);
  const matchesMonth = cached.year === y && cached.month === m;

  let days = cached.days ?? [];
  if (matchesMonth) {
    const minutes = Math.round(sumSeconds(local) / 60);
    const pages = sumPages(local);
    const day = days.find((d) => d.date === today);
    if (day) {
      days = days.map((d) =>
        d.date === today ? { ...d, minutes: d.minutes + minutes, pages: d.pages + pages } : d
      );
    } else {
      days = [...days, { date: today, minutes, pages, books: [] }];
    }
  }

  return { ...cached, days, hasSessionToday: true, streak: streakWithLocal(cached.streak, local) };
}

// /goals — suma los minutos de las sesiones locales de hoy a la meta diaria y
// al calendario embebido (redondeado como hace el server).
export function goalsWithLocal(cached, items = []) {
  if (!cached) return cached;
  const local = localToday(items);
  if (local.length === 0) return cached;

  const minutes = Math.round(sumSeconds(local) / 60);
  const today = todayString();
  const calendar = cached.calendar ?? [];
  const withToday = calendarWithLocal({ year: Number(today.split("-")[0]), month: Number(today.split("-")[1]), days: calendar, streak: cached.streak }, items).days;
  return {
    ...cached,
    progress: cached.progress
      ? { ...cached.progress, daily: (cached.progress.daily ?? 0) + minutes }
      : cached.progress,
    calendar: withToday,
  };
}

// /stats/activity — suma las sesiones locales de hoy al bucket que corresponde
// (semana: hoy; mes: día de hoy; año: mes actual) y a los totals. Deriva el
// índice del bucket a partir de week_start/labels, igual que el server.
export function activityWithLocal(cached, items = []) {
  if (!cached) return cached;
  const local = localToday(items);
  if (local.length === 0) return cached;

  const seconds = sumSeconds(local);
  const pages = sumPages(local);
  const today = todayString();
  const [ty, tm, td] = today.split("-").map(Number);

  const buckets = (cached.buckets ?? []).map((b, i) => {
    let isToday = false;
    if (cached.view === "week") {
      const idx = Math.round(diffDays(cached.week_start, today));
      isToday = idx >= 0 && idx < 7 && i === idx;
    } else if (cached.view === "month") {
      isToday = cached.year === ty && cached.month === tm && b.label === String(td);
    } else if (cached.view === "year") {
      isToday = cached.year === ty && b.label === ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][tm - 1];
    }
    if (!isToday) return b;
    const minutes = b.minutes + Math.round(seconds / 60);
    return {
      ...b,
      minutes,
      pages: b.pages + pages,
      sessions: b.sessions + local.length,
      active_days: b.active_days + (b.minutes > 0 ? 0 : 1),
    };
  });

  const totals = buckets.reduce(
    (acc, b) => ({
      minutes: acc.minutes + b.minutes,
      pages: acc.pages + b.pages,
      sessions: acc.sessions + b.sessions,
      active_days: acc.active_days + b.active_days,
    }),
    { minutes: 0, pages: 0, sessions: 0, active_days: 0 }
  );

  return { ...cached, buckets, totals };
}