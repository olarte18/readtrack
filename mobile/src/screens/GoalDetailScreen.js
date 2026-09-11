import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { getGoalDetail } from "../services/api";

const TITLES = {
  "annual:books": "Libros completados este año",
  "monthly:books": "Libros completados este mes",
  "monthly:hours": "Horas de lectura por libro — este mes",
  "weekly:hours": "Horas de lectura por libro — esta semana",
};

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
  const [datePart] = String(str).split("T");
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export default function GoalDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { type, metric } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getGoalDetail(type, metric);
      setData(res);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [type, metric]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const title = TITLES[`${type}:${metric}`] ?? "Detalle de la meta";

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>{title}</Text>

      {error ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No se pudo cargar el detalle</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchDetail}>
            <Text style={styles.retryBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (data?.books ?? []).length === 0 ? (
        <View style={styles.card}>
          <Ionicons name="book-outline" size={32} color={colors.textDim} style={{ alignSelf: "center", marginBottom: 8 }} />
          <Text style={styles.emptyText}>Sin lecturas en {data?.period}</Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>
              {metric === "books" ? data.progress : formatDuration(data.progress)}
            </Text>
            <Text style={styles.summaryLabel}>
              {metric === "books" ? (data.progress === 1 ? "libro en" : "libros en") : "leído en"} {data?.period}
            </Text>
          </View>

          {(data.books ?? []).map((b) => (
            <TouchableOpacity
              key={`${b.id}-${b.db_id}`}
              style={styles.bookRow}
              onPress={() =>
                navigation.navigate("BookSessions", {
                  id: b.id,
                  title: b.title,
                  author: b.author,
                  cover: b.cover,
                  readingMode: b.reading_mode ?? "page",
                  onGoBack: fetchDetail,
                })
              }
            >
              {b.cover ? (
                <Image source={{ uri: b.cover }} style={styles.cover} />
              ) : (
                <View style={[styles.cover, styles.noCover]}>
                  <Ionicons name="book" size={20} color={colors.textDim} />
                </View>
              )}
              <View style={styles.bookInfo}>
                <Text style={styles.bookTitle} numberOfLines={2}>{b.title}</Text>
                {!!b.author && <Text style={styles.bookAuthor} numberOfLines={1}>{b.author}</Text>}
                <Text style={styles.bookMeta}>
                  {metric === "books" ? `Completado el ${formatDate(b.finished_at)}` : formatDuration(b.minutes)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", color: colors.text, padding: 20, paddingTop: 50 },
  summaryCard: { backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, marginBottom: 12, padding: 18, alignItems: "center" },
  summaryValue: { fontSize: 28, fontWeight: "bold", color: colors.accent },
  summaryLabel: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, padding: 24, alignItems: "center" },
  emptyText: { fontSize: 14, color: colors.textDim, textAlign: "center" },
  retryBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 12 },
  retryBtnText: { color: colors.onAccent, fontWeight: "bold" },
  bookRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, marginVertical: 6, padding: 12, gap: 12 },
  cover: { width: 48, height: 72, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  noCover: { justifyContent: "center", alignItems: "center" },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 15, fontWeight: "bold", color: colors.text, marginBottom: 2 },
  bookAuthor: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  bookMeta: { fontSize: 12, color: colors.accent },
});