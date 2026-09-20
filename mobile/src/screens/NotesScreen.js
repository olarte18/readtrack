import { useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Image, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { getAllNotes, deleteNote } from "../services/api";
import { AppAlert } from "../components/AppAlert";

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
};

export default function NotesScreen({ navigation }) {
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

  const handleDeleteNote = (id) => {
    AppAlert.alert("Eliminar nota", "¿Eliminar esta nota?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar", style: "destructive",
        onPress: async () => {
          await deleteNote(id);
          setNotes((prev) => prev.filter((n) => n.id !== id));
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Notas</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 30 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.7} onLongPress={() => handleDeleteNote(item.id)}>
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
                <View style={styles.actions}>
                  <TouchableOpacity hitSlop={8} onPress={() =>
                    navigation.navigate("NoteEditor", {
                      note: item,
                      onGoBack: (updated) =>
                        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n))),
                    })
                  } style={styles.actionBtn}>
                    <Ionicons name="pencil-outline" size={18} color={colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity hitSlop={8} onPress={() => handleDeleteNote(item.id)} style={styles.actionBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
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
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 50,
      marginBottom: 12,
      gap: 12,
    },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text },
    backBtn: { backgroundColor: colors.surface, borderRadius: 10, padding: 8 },
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
    actions: { flexDirection: "row", gap: 14, marginLeft: 14 },
    actionBtn: { padding: 2 },
    empty: { color: colors.textDim, textAlign: "center", marginTop: 60, fontSize: 16, lineHeight: 26 },
  });
