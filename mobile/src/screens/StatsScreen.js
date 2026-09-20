import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { getStats, getStatsActivity } from "../services/api";
import { getPending } from "../services/offline";
import { activityWithLocal } from "../utils/offlineCompute";
import { todayString } from "../utils/dates";
import ActivityChart from "../components/ActivityChart";
import ProgressRing from "../components/ProgressRing";

const STAT_ITEMS = [
  { key: "completed", label: "Leídos", icon: "checkmark-circle" },
  { key: "reading", label: "Leyendo", icon: "book" },
  { key: "paused", label: "Pausados", icon: "pause-circle" },
  { key: "pending", label: "Pendientes", icon: "time" },
  { key: "wishlist", label: "Lista de deseos", icon: "star" },
  { key: "abandoned", label: "Abandonados", icon: "close-circle" },
];

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const isoWeekStart = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - dow * 86400000);
  return monday.toISOString().slice(0, 10);
};

const todayIso = (diffDays = 0, base = todayString()) => {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + diffDays);
  return d.toISOString().slice(0, 10);
};

const formatHoursNum = (minutes) => {
  const h = (Number(minutes) || 0) / 60;
  return h.toFixed(1).replace(".", ",").replace(",0", "");
};

const formatHours = (minutes) => `${formatHoursNum(minutes)} h`;

const formatMinutes = (minutes) => String(Math.round(Number(minutes) || 0));

export default function StatsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const now = useMemo(() => {
    const t = todayString().split("-");
    return { year: Number(t[0]), month: Number(t[1]), iso: todayString() };
  }, []);

  const [view, setView] = useState("year");
  const [yearMetric, setYearMetric] = useState("hours");
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [weekDate, setWeekDate] = useState(now.iso);
  const [activity, setActivity] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await getStats(year);
      setStats(res);
    } catch (e) {
      console.error(e);
    }
  }, [year]);

  const fetchActivity = useCallback(async () => {
    const params = { view };
    if (view === "year") params.year = year;
    else if (view === "month") { params.year = year; params.month = month; }
    else params.date = weekDate;
    const res = await getStatsActivity(params);
    setActivity(res?.fromCache ? activityWithLocal(res, await getPending()) : res);
  }, [view, year, month, weekDate]);

  useEffect(() => {
    let cancelled = false;
    getStats(year)
      .then((res) => { if (!cancelled) setStats(res); })
      .catch((e) => console.error(e));
    return () => { cancelled = true; };
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { view };
    if (view === "year") params.year = year;
    else if (view === "month") { params.year = year; params.month = month; }
    else params.date = weekDate;
    getStatsActivity(params)
      .then(async (res) => { if (!cancelled) setActivity(res?.fromCache ? activityWithLocal(res, await getPending()) : res); })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view, year, month, weekDate]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchStats(), fetchActivity()]);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const selectView = (v) => {
    setView(v);
    if (v === "week" && Number(String(weekDate).slice(0, 4)) !== year) {
      setWeekDate(year === now.year ? now.iso : `${year}-12-31`);
    }
    if (v === "month") {
      const m = year === now.year ? now.month : 12;
      setMonth(m);
    }
  };

  const canGoNextYear = year < now.year;
  const goYear = (delta) => {
    const ny = year + delta;
    if (delta > 0 && !canGoNextYear) return;
    if (ny < 1970) return;
    setYear(ny);
    if (view === "week") setWeekDate(ny === now.year ? now.iso : `${ny}-12-31`);
    if (view === "month") setMonth(ny === now.year ? now.month : 12);
  };

  const atCurrentMonth = year === now.year && month === now.month;
  const atCurrentWeek = isoWeekStart(weekDate) >= isoWeekStart(now.iso);

  const goPeriod = (delta) => {
    if (view === "month") {
      if (delta > 0 && atCurrentMonth) return;
      let ny = year;
      let nm = month + delta;
      if (nm < 1) { nm = 12; ny -= 1; }
      if (nm > 12) { nm = 1; ny += 1; }
      if (ny > now.year || (ny === now.year && nm > now.month)) return;
      setYear(ny);
      setMonth(nm);
    } else {
      if (delta > 0 && atCurrentWeek) return;
      const iso = todayIso(delta * 7, weekDate);
      const ny = Number(iso.slice(0, 4));
      if (ny > now.year) return;
      setWeekDate(iso);
      if (ny !== year) setYear(ny);
    }
  };

  const chartData = useMemo(() => {
    if (!activity) return [];
    const buckets = activity.buckets || [];
    if (view === "month") {
      const daily = activity.daily_goal_minutes;
      const goal = daily != null ? daily * 7 : null;
      const groups = new Map();
      for (const b of buckets) {
        const day = Number(b.label);
        if (!day) continue;
        const key = isoWeekStart(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
        groups.set(key, (groups.get(key) || 0) + b.minutes);
      }
      const keys = [...groups.keys()].sort();
      return keys.map((key, i) => {
        const value = groups.get(key);
        return {
          label: `S${i + 1}`,
          value,
          met: goal != null && value >= goal && value > 0,
        };
      });
    }
    if (view === "week") {
      const goal = activity.daily_goal_minutes;
      return buckets.map((b) => ({
        label: b.label,
        value: b.minutes,
        met: goal != null && b.minutes >= goal && b.minutes > 0,
      }));
    }
    const usesBooks = yearMetric === "books";
    const goal = usesBooks ? activity.monthly_goal_books : activity.monthly_goal_minutes;
    return buckets.map((b) => {
      const value = usesBooks ? b.books ?? 0 : b.minutes;
      return {
        label: b.label,
        value,
        met: goal != null && value >= goal && value > 0,
      };
    });
  }, [activity, view, year, month, yearMetric]);

  const weekLabel = useMemo(() => {
    if (!activity?.week_start) return "";
    const d = new Date(`${activity.week_start}T12:00:00Z`);
    return `Semana del ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}`;
  }, [activity]);

  const completed = stats?.completed_this_year ?? 0;
  const goal = stats?.goal_this_year;
  const ringPct = goal > 0 ? Math.round((completed / goal) * 100) : 0;

  if (loading && !activity) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Estadísticas</Text>
        <View style={styles.yearControl}>
          <TouchableOpacity onPress={() => goYear(-1)} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.yearText}>{year}</Text>
          <TouchableOpacity onPress={() => goYear(1)} disabled={!canGoNextYear} hitSlop={8}>
            <Ionicons name="chevron-forward" size={18} color={canGoNextYear ? colors.accent : colors.textDim} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.segment}>
        {[["week", "Semana"], ["month", "Mes"], ["year", "Año"]].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.segBtn, view === key && styles.segBtnActive]}
            onPress={() => selectView(key)}
          >
            <Text style={[styles.segText, view === key && styles.segTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {(view === "week" || view === "month") && (
        <View style={styles.periodRow}>
          <TouchableOpacity onPress={() => goPeriod(-1)} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.periodLabel}>
            {view === "month" ? `${MONTH_NAMES[month - 1]} ${year}` : weekLabel}
          </Text>
          <TouchableOpacity
            onPress={() => goPeriod(1)}
            disabled={view === "month" ? atCurrentMonth : atCurrentWeek}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={view === "month" ? (atCurrentMonth ? colors.textDim : colors.accent) : (atCurrentWeek ? colors.textDim : colors.accent)}
            />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {view === "year" && yearMetric === "books"
              ? "Libros leídos"
              : view === "week"
                ? "Minutos leídos"
                : "Horas leídas"}
          </Text>
          {view === "year" && (
            <View style={styles.unitSeg}>
              {[["books", "Libros"], ["hours", "Horas"]].map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.unitBtn, yearMetric === key && styles.unitBtnActive]}
                  onPress={() => setYearMetric(key)}
                >
                  <Text style={[styles.unitText, yearMetric === key && styles.unitTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <ActivityChart
          data={chartData}
          colors={colors}
          formatValue={
            view === "year"
              ? yearMetric === "books"
                ? undefined
                : formatHoursNum
              : view === "week"
                ? formatMinutes
                : formatHours
          }
        />
      </View>

      <View style={styles.totalsRow}>
        {[
          { label: "Horas", value: formatHours(activity?.totals?.minutes) },
          { label: "Páginas", value: activity?.totals?.pages ?? 0 },
          { label: "Sesiones", value: activity?.totals?.sessions ?? 0 },
          { label: "Días", value: activity?.totals?.active_days ?? 0 },
        ].map((t) => (
          <View key={t.label} style={styles.totalTile}>
            <Text style={styles.totalValue}>{t.value}</Text>
            <Text style={styles.totalLabel}>{t.label}</Text>
          </View>
        ))}
      </View>

      {goal ? (
        <TouchableOpacity style={styles.goalCard} onPress={() => navigation.navigate("GoalDetail", { type: "annual", metric: "books", year })}>
          <ProgressRing
            percent={ringPct}
            radius={30}
            borderWidth={8}
            color={colors.accent}
            trackColor={colors.surfaceAlt}
            bgColor={colors.surface}
            completedColor={colors.calendarComplete}
          >
            <Text style={styles.ringNumber}>{Math.round(ringPct)}%</Text>
          </ProgressRing>
          <View style={styles.goalInfo}>
            <Text style={styles.goalTitle}>Meta anual {year}</Text>
            <Text style={styles.goalText}>
              {completed} de {goal} libros
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <View style={styles.noGoalRow}>
          <Text style={styles.noGoalText}>
            Libros terminados en {year}: <Text style={styles.noGoalBold}>{completed}</Text>
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Tu biblioteca</Text>
      <View style={styles.grid}>
        {STAT_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.statCard}
            onPress={() => navigation.navigate("Home", { filterStatus: item.key })}
          >
            <Ionicons name={item.icon} size={24} color={colors.textMuted} style={styles.icon} />
            <Text style={styles.statNumber}>{stats?.[item.key] ?? 0}</Text>
            <Text style={styles.statLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.bigStatsRow}>
        <View style={styles.bigStat}>
          <Text style={styles.bigStatNumber}>{stats?.total_pages ?? 0}</Text>
          <Text style={styles.bigStatLabel}>Páginas leídas</Text>
        </View>
        <View style={styles.bigStat}>
          <View style={styles.bigStatTop}>
            <Ionicons name="star" size={18} color={colors.star} />
            <Text style={styles.bigStatNumber}>
              {stats?.avg_rating > 0 ? stats.avg_rating : "—"}
            </Text>
          </View>
          <Text style={styles.bigStatLabel}>Rating promedio</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    centered: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
    container: { flexGrow: 1, backgroundColor: colors.background, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text },
    yearControl: { flexDirection: "row", alignItems: "center", gap: 10 },
    yearText: { fontSize: 18, fontWeight: "bold", color: colors.text, minWidth: 56, textAlign: "center" },
    segment: { flexDirection: "row", backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 3, marginBottom: 14 },
    segBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
    segBtnActive: { backgroundColor: colors.accent },
    segText: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
    segTextActive: { color: colors.surface, fontWeight: "bold" },
    periodRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, marginBottom: 12 },
    periodLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
    card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    cardTitle: { fontSize: 14, fontWeight: "bold", color: colors.text },
    unitSeg: { flexDirection: "row", backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: 2 },
    unitBtn: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
    unitBtnActive: { backgroundColor: colors.accent },
    unitText: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
    unitTextActive: { color: colors.surface, fontWeight: "bold" },
    totalsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    totalTile: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
    totalValue: { fontSize: 18, fontWeight: "bold", color: colors.accent },
    totalLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
    goalCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, gap: 14 },
    goalInfo: { flex: 1 },
    goalTitle: { fontSize: 14, fontWeight: "bold", color: colors.text },
    goalText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    ringNumber: { fontSize: 13, fontWeight: "bold", color: colors.accent },
    noGoalRow: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    noGoalText: { fontSize: 13, color: colors.textMuted },
    noGoalBold: { color: colors.accent, fontWeight: "bold" },
    sectionTitle: { fontSize: 16, fontWeight: "bold", color: colors.text, marginBottom: 8, marginTop: 4 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    statCard: { backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: "center", minWidth: "30%", flexGrow: 1 },
    icon: { marginBottom: 4 },
    statNumber: { fontSize: 20, fontWeight: "bold", color: colors.accent },
    statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: "center" },
    bigStatsRow: { flexDirection: "row", gap: 8 },
    bigStat: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 14, alignItems: "center" },
    bigStatTop: { flexDirection: "row", alignItems: "center", gap: 6 },
    bigStatNumber: { fontSize: 20, fontWeight: "bold", color: colors.accent },
    bigStatLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  });