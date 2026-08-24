import { useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { getAllNotes } from "../services/api";

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
};

export default function NotesScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      getAllNotes()
        .then((rows) => { if (!cancelled) setNotes(rows); })
        .catch(console.error)
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notas</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 30 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.bookRow}>
                {item.book_cover ? (
                  <Image source={{ uri: item.book_cover }} style={styles.cover} />
                ) : (
                  <View style={[styles.cover, styles.noCover]}>
                    <Ionicons name="book" size={16} color={colors.textDim} />
                  </View>
                )}
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle} numberOfLines={1}>{item.book_title}</Text>
                  <Text style={styles.bookAuthor} numberOfLines={1}>{item.book_author}</Text>
                </View>
              </View>
              <Text style={styles.content}>{item.content}</Text>
              <View style={styles.metaRow}>
                {!!item.page && <Text style={styles.pageBadge}>Página {item.page}</Text>}
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Aún no tienes notas{"\n"}Escríbelas desde la página de un libro</Text>
          }
          onRefresh={() => getAllNotes().then(setNotes).catch(console.error)}
          refreshing={loading && notes.length > 0}
        />
      )}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text, padding: 20, paddingTop: 50 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      marginHorizontal: 16,
      marginVertical: 6,
      padding: 14,
    },
    bookRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    cover: { width: 34, height: 50, borderRadius: 5 },
    noCover: { justifyContent: "center", alignItems: "center", backgroundColor: colors.surfaceAlt },
    bookInfo: { flex: 1 },
    bookTitle: { fontSize: 13, fontWeight: "bold", color: colors.text },
    bookAuthor: { fontSize: 11, color: colors.textMuted },
    content: { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 10 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    pageBadge: {
      fontSize: 11,
      color: colors.accent,
      backgroundColor: colors.accent + "22",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      overflow: "hidden",
      fontWeight: "bold",
    },
    date: { fontSize: 11, color: colors.textDim, marginLeft: "auto" },
    empty: { color: colors.textDim, textAlign: "center", marginTop: 60, fontSize: 16, lineHeight: 26 },
  });
