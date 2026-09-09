import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { getReadingSessions } from "../services/api";

function formatDuration(minutes) {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  if (rest === 0) return `${h} h`;
  return `${h} h ${rest} min`;
}

function formatDate(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function sessionPageLabel(s) {
  const page = s.page ?? 0;
  const read = s.pages_read ?? 0;
  const storedStart = s.start_page;
  const dur = s.duration_seconds ?? 0;
  if (read <= 0) {
    return dur > 0 ? "Sesión registrada" : "—";
  }
  const start = storedStart !== undefined && storedStart !== null ? storedStart : Math.max(0, page - read);
  const validStart = start < page ? start : Math.max(0, page - read);
  return `Págs. ${validStart}-${page} · ${read} ${read === 1 ? "página" : "páginas"} leídas`;
}

export default function BookSessionsScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { id: userBookId, title, author, cover, onGoBack } = route.params;
  const [sessions, setSessions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("asc");

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getReadingSessions(userBookId);
      setSessions(list);
    } catch (e) {
      console.error(e);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [userBookId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const sorted = [...(sessions ?? [])].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "date") {
      const da = `${a.date_bogota ?? ""} ${a.time_bogota ?? ""}`;
      const db = `${b.date_bogota ?? ""} ${b.time_bogota ?? ""}`;
      if (da < db) cmp = -1;
      else if (da > db) cmp = 1;
    } else if (sortKey === "duration") {
      cmp = (a.duration_seconds ?? -1) - (b.duration_seconds ?? -1);
    } else {
      cmp = (a.pages_read ?? -1) - (b.pages_read ?? -1);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalSeconds = sorted.reduce((acc, s) => acc + (s.duration_seconds ?? 0), 0);
  const totalPages = sorted.reduce((acc, s) => acc + (s.pages_read ?? 0), 0);

  const groups = [];
  if (sortKey === "date") {
    let current = null;
    for (const s of sorted) {
      if (!current || current.date !== s.date_bogota) {
        current = { date: s.date_bogota, sessions: [] };
        groups.push(current);
      }
      current.sessions.push(s);
    }
  }

  const sortDirLabel =
    sortKey === "date"
      ? sortDir === "asc" ? "Primera → Última" : "Última → Primera"
      : sortDir === "asc" ? "Menor → Mayor" : "Mayor → Menor";

  const filters = [
    { key: "date", label: "Fecha" },
    { key: "duration", label: "Duración" },
    { key: "pages", label: "Páginas" },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.miniCover} />
        ) : (
          <View style={[styles.miniCover, styles.noCover]}>
            <Ionicons name="book" size={18} color={colors.textDim} />
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {!!author && <Text style={styles.author} numberOfLines={1}>{author}</Text>}
        </View>
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterPill, sortKey === f.key && styles.filterPillActive]}
            onPress={() => setSortKey(f.key)}
          >
            <Text style={[styles.filterPillText, sortKey === f.key && styles.filterPillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.dirRow}>
        <TouchableOpacity
          style={styles.dirBtn}
          onPress={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
        >
          <Ionicons name={sortDir === "asc" ? "arrow-up" : "arrow-down"} size={16} color={colors.accent} />
          <Text style={styles.dirBtnText}>{sortDirLabel}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
          {sorted.length === 0 ? (
            <View style={styles.card}>
              <Ionicons name="time-outline" size={32} color={colors.textDim} style={{ alignSelf: "center", marginBottom: 8 }} />
              <Text style={styles.emptyText}>Este libro aún no tiene sesiones registradas</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{formatDuration(totalSeconds / 60)}</Text>
                  <Text style={styles.summaryLabel}>leído</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{totalPages}</Text>
                  <Text style={styles.summaryLabel}>páginas</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{sorted.length}</Text>
                  <Text style={styles.summaryLabel}>{sorted.length === 1 ? "sesión" : "sesiones"}</Text>
                </View>
              </View>

              {sortKey === "date" ? (
                groups.map((g) => (
                  <View key={g.date} style={styles.dayGroup}>
                    <Text style={styles.dayLabel}>{formatDate(g.date)}</Text>
                    {g.sessions.map((s) => (
                      <View key={s.id} style={styles.sessionRow}>
                        <View style={styles.sessionTimeCol}>
                          <Text style={styles.sessionTime}>{s.time_bogota}</Text>
                        </View>
                        <View style={styles.sessionInfo}>
                          <Text style={styles.sessionMeta}>
                            {sessionPageLabel(s)}
                          </Text>
                          <Text style={styles.sessionDuration}>{formatDuration((s.duration_seconds ?? 0) / 60)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))
              ) : (
                sorted.map((s) => (
                  <View key={s.id} style={styles.sessionRow}>
                    <View style={styles.sessionDateCol}>
                      <Text style={styles.sessionTime}>{s.time_bogota}</Text>
                      <Text style={styles.sessionDate}>{formatDate(s.date_bogota)}</Text>
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionMeta}>
                        {sessionPageLabel(s)}
                      </Text>
                      <Text style={styles.sessionDuration}>{formatDuration((s.duration_seconds ?? 0) / 60)}</Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16 },
  backBtn: { padding: 4, marginRight: 4 },
  miniCover: { width: 40, height: 58, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  noCover: { justifyContent: "center", alignItems: "center" },
  headerInfo: { flex: 1 },
  title: { fontSize: 17, fontWeight: "bold", color: colors.text },
  author: { fontSize: 13, color: colors.textMuted },
  scroll: { flex: 1 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  filterPill: { backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  filterPillActive: { backgroundColor: colors.accent },
  filterPillText: { color: colors.textMuted, fontSize: 13 },
  filterPillTextActive: { color: colors.onAccent, fontWeight: "bold" },
  dirRow: { paddingHorizontal: 16, marginBottom: 12, flexDirection: "row" },
  dirBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  dirBtnText: { color: colors.accent, fontSize: 13, fontWeight: "bold" },
  card: { backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, padding: 24, alignItems: "center", marginTop: 20 },
  emptyText: { fontSize: 14, color: colors.textDim, textAlign: "center" },
  summaryRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    alignItems: "center",
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 4 },
  summaryDivider: { width: 1, height: 36, backgroundColor: colors.border },
  summaryValue: { fontSize: 20, fontWeight: "bold", color: colors.accent },
  summaryLabel: { fontSize: 12, color: colors.textMuted },
  dayGroup: { marginHorizontal: 16, marginBottom: 14 },
  dayLabel: { fontSize: 14, fontWeight: "bold", color: colors.text, marginBottom: 8 },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  sessionTimeCol: { width: 52 },
  sessionDateCol: { width: 64 },
  sessionTime: { fontSize: 15, fontWeight: "bold", color: colors.accent },
  sessionDate: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  sessionInfo: { flex: 1 },
  sessionMeta: { fontSize: 13, color: colors.text },
  sessionDuration: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});