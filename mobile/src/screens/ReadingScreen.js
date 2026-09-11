import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { getLibrary, getReadingSpeed, getStreak, getGoals } from "../services/api";
import { reconcileStreakReminder } from "../services/streakReminder";
import { formatPoint, progressFraction, pagesLeftEquivalent } from "../utils/progress";
import ProgressRing from "../components/ProgressRing";

const formatRemaining = (minutes) => {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `~${h} h ${m} min`;
  if (h > 0) return `~${h} h`;
  return `~${Math.max(m, 1)} min`;
};

export default function ReadingScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = createStyles(colors);
  const [books, setBooks] = useState([]);
  const [speeds, setSpeeds] = useState({});
  const [streak, setStreak] = useState(null);
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReading = async () => {
    setLoading(true);
    try {
      const all = await getLibrary();
      const reading = all.filter((b) => b.status === "reading");
      setBooks(reading);

      // Velocidad promedio (páginas/hora) de cada libro en curso
      const entries = await Promise.all(
        reading.map((b) =>
          getReadingSpeed(b.id)
            .then((d) => [b.id, d.avg_pages_per_hour > 0 ? d.avg_pages_per_hour : null])
            .catch(() => [b.id, null])
        )
      );
      setSpeeds(Object.fromEntries(entries));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchReading();
      getStreak()
        .then((s) => {
          setStreak(s);
          if (user) {
            reconcileStreakReminder(user.id, { hasSessionToday: !!s.hasSessionToday, streak: s.current ?? 0 }).catch(() => {});
          }
        })
        .catch(console.error);
      getGoals().then(setGoals).catch(console.error);
    }, [user])
  );

  const dailyGoal = goals?.goals?.find((g) => g.type === "daily");
  const dailyPct =
    dailyGoal?.value > 0 ? Math.min(100, Math.round(((goals?.progress?.daily ?? 0) / dailyGoal.value) * 100)) : null;
  const hasSessionToday = streak?.hasSessionToday === true;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Leyendo</Text>
        <TouchableOpacity
          style={[
            styles.streakChip,
            { borderColor: hasSessionToday ? colors.star + "55" : colors.border }
          ]}
          onPress={() => navigation.navigate("Main", { screen: "Calendar" })}
          activeOpacity={0.7}
        >
          <Ionicons name="flame" size={20} color={hasSessionToday ? colors.star : colors.textMuted} />
          <Text style={[styles.streakValue, { color: hasSessionToday ? colors.text : colors.textMuted }]}>{streak?.current ?? 0}</Text>
          <View style={styles.streakDivider} />
          <Ionicons name="trophy" size={14} color={colors.textMuted} />
          <Text style={styles.streakBest}>{streak?.best ?? 0}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 30 }}
          ListFooterComponent={
            dailyPct != null ? (
              <View style={styles.goalCard}>
                <Text style={styles.goalTitle}>Meta diaria</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate("Main", { screen: "Calendar" })}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <ProgressRing
                    percent={dailyPct}
                    radius={40}
                    borderWidth={8}
                    color={colors.accent}
                    trackColor={colors.surfaceAlt}
                    bgColor={colors.surface}
                  >
                    <Text style={styles.goalPct}>{dailyPct}%</Text>
                  </ProgressRing>
                </TouchableOpacity>
                <Text style={styles.goalDetail}>
                  {goals.progress.daily} de {dailyGoal.value} min hoy
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const perHour = speeds[item.id];
            const pagesLeft = pagesLeftEquivalent(item, item.current_page);
            const remaining =
              pagesLeft != null && perHour > 0 ? formatRemaining(pagesLeft / (perHour / 60)) : null;
            const frac = progressFraction(item);
            const progressPct = frac != null ? Math.round(frac * 100) : null;
            const pageText = (() => {
              const mode = item.reading_mode ?? "page";
              const point = formatPoint(item, item.current_page ?? 0);
              if (mode === "percentage") return progressPct != null ? `${item.current_page ?? 0}% del libro` : point;
              if (mode === "chapter") return item.chapters ? `${point} de ${item.chapters}` : point;
              return item.pages ? `${point} de ${item.pages}${progressPct != null ? ` · ${progressPct}%` : ""}` : point;
            })();

            return (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.bookInfo}
                  onPress={() => navigation.navigate("BookDetail", { book: item, onGoBack: fetchReading })}
                >
                  {item.cover ? (
                    <Image source={{ uri: item.cover }} style={styles.cover} />
                  ) : (
                    <View style={styles.noCover}>
                      <Ionicons name="book" size={28} color={colors.textDim} />
                    </View>
                  )}
                  <View style={styles.info}>
                    <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.author} numberOfLines={1}>{item.author}</Text>

                    {!!progressPct && (
                      <>
                        <View style={styles.progressContainer}>
                          <View style={[styles.progressBar, { width: `${progressPct}%` }]} />
                        </View>
                        <Text style={styles.pageText}>
                          {pageText}
                        </Text>
                      </>
                    )}

                    <View style={styles.metaRow}>
                      {remaining ? (
                        <View style={styles.remainingBadge}>
                          <Ionicons name="time-outline" size={13} color={colors.accent} />
                          <Text style={styles.remainingText}>{remaining}</Text>
                        </View>
                      ) : null}
                      {item.rating > 0 && (
                        <View style={styles.ratingRow}>
                          {Array.from({ length: item.rating }).map((_, i) => (
                            <Ionicons key={i} name="star" size={11} color={colors.star} />
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.continueBtn}
                  onPress={() => navigation.navigate("ReadingMode", { book: item })}
                >
                  <Ionicons name="play" size={18} color={colors.onAccent} />
                  <Text style={styles.continueBtnLabel}>Leer</Text>
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>No tienes libros en curso{"\n"}Agrega uno desde tu biblioteca</Text>
          }
          onRefresh={fetchReading}
          refreshing={loading}
        />
      )}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 20,
      paddingTop: 50,
    },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text },
    streakChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.star + "55",
    },
    streakValue: { fontSize: 16, fontWeight: "bold", color: colors.text },
    streakDivider: { width: 1, height: 14, backgroundColor: colors.border, marginHorizontal: 2 },
    streakBest: { fontSize: 12, fontWeight: "bold", color: colors.textMuted },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
    },
    bookInfo: { flex: 1, flexDirection: "row", alignItems: "center" },
    cover: { width: 74, height: 112, borderRadius: 8 },
    noCover: {
      width: 74,
      height: 112,
      borderRadius: 8,
      backgroundColor: colors.surfaceAlt,
      justifyContent: "center",
      alignItems: "center",
    },
    info: { flex: 1, marginLeft: 14 },
    bookTitle: { fontSize: 16, fontWeight: "bold", color: colors.text, marginBottom: 3 },
    author: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
    progressContainer: {
      height: 6,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 3,
      marginBottom: 5,
      overflow: "hidden",
    },
    progressBar: { height: 6, backgroundColor: colors.accent, borderRadius: 3 },
    pageText: { fontSize: 12, color: colors.textDim, marginBottom: 8 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    remainingBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
    remainingText: { fontSize: 12, fontWeight: "bold", color: colors.accent },
    ratingRow: { flexDirection: "row", gap: 2 },
    continueBtn: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: "center",
      marginLeft: 12,
      gap: 4,
    },
    continueBtnLabel: { color: colors.onAccent, fontSize: 12, fontWeight: "bold" },
    empty: { color: colors.textDim, textAlign: "center", marginTop: 60, fontSize: 16, lineHeight: 26 },
    goalCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginHorizontal: 16,
      marginVertical: 16,
      padding: 20,
      alignItems: "center",
      gap: 12,
    },
    goalTitle: { fontSize: 16, fontWeight: "bold", color: colors.text },
    goalPct: { fontSize: 20, fontWeight: "bold", color: colors.accent },
    goalDetail: { fontSize: 13, color: colors.textMuted },
  });
