import { useEffect, useState, useCallback } from "react";

import { getLibrary, getLibraryCached } from "../services/api";
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";

export default function HomeScreen({ navigation ,route}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
const { filterStatus } = route?.params ?? {};
const [filter, setFilter] = useState(filterStatus ?? "all");  const fetchLibrary = async () => {
    setLoading(true);
    const cached = await getLibraryCached();
    if (cached) {
      setBooks(cached);
      setLoading(false);
    }
    try {
      const data = await getLibrary();
      setBooks(data);
    } catch (error) {
      console.error("Error cargando biblioteca:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresca al volver al tab: refleja cambios de estado, imports y sesiones
  useFocusEffect(
    useCallback(() => {
      fetchLibrary();
    }, [])
  );
const filteredBooks = filter === "all" ? books : books.filter((b) => b.status === filter);
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mi Biblioteca</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Search")}>
          <Text style={styles.addBtn}>+ Agregar</Text>
        </TouchableOpacity>
      </View>
<View style={styles.filterRow}>
{[
  { key: "all", label: "Todos" },
  { key: "reading", label: "Leyendo" },
  { key: "paused", label: "Pausado" },
  { key: "completed", label: "Leídos" },
  { key: "pending", label: "Pendiente" },
  { key: "wishlist", label: "Deseos" },
  { key: "abandoned", label: "Abandonado" },
].map((f) => (
    <TouchableOpacity
      key={f.key}
      style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
      onPress={() => setFilter(f.key)}
    >
      <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
        {f.label}
      </Text>
    </TouchableOpacity>
  ))}
</View>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filteredBooks}
          keyExtractor={(item) => String(item.id)}
renderItem={({ item }) => (
  <TouchableOpacity
    style={styles.card}
    onPress={() => navigation.navigate("BookDetail", { book: item, onGoBack: fetchLibrary })}
  >
    {item.cover ? (
      <Image source={{ uri: item.cover }} style={styles.cover} />
    ) : (
      <View style={styles.noCover}>
        <Ionicons name="book" size={26} color={colors.textDim} />
      </View>
    )}
    <View style={styles.info}>
      <Text style={styles.bookTitle} numberOfLines={2}>{String(item.title)}</Text>
      <Text style={styles.author} numberOfLines={1}>{String(item.author)}</Text>
      <View style={styles.statusRow}>
{item.status === "completed" && <Text style={styles.statusBadge}>Completado</Text>}
{item.status === "reading" && <Text style={styles.statusBadge}>Leyendo</Text>}
{item.status === "pending" && <Text style={styles.statusBadge}>Pendiente</Text>}
{item.status === "abandoned" && <Text style={styles.statusBadge}>Abandonado</Text>}
{item.status === "wishlist" && <Text style={styles.statusBadge}>Deseos</Text>}
{item.status === "paused" && <Text style={styles.statusBadge}>Pausado</Text>}
      </View>
      {item.status === "reading" && !!item.pages && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${Math.min((item.current_page / item.pages) * 100, 100)}%` }]} />
        </View>
      )}
      {item.status === "reading" && (
        <Text style={styles.pageText}>
          Página {item.current_page ?? 0}{item.pages ? ` de ${item.pages}` : ""}
        </Text>
      )}
      {item.status === "completed" && item.rating > 0 && (
        <View style={styles.ratingRow}>
          {Array.from({ length: item.rating }).map((_, i) => (
            <Ionicons key={i} name="star" size={12} color={colors.star} />
          ))}
        </View>
      )}
    </View>
  </TouchableOpacity>
)}
          ListEmptyComponent={
            <Text style={styles.empty}>No tienes libros aún{"\n"}Busca uno para empezar</Text>
          }
          onRefresh={fetchLibrary}
          refreshing={loading}
        />
      )}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 50 },
  title: { fontSize: 24, fontWeight: "bold", color: colors.text },
  addBtn: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  card: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, marginVertical: 6, padding: 12, alignItems: "center" },
  cover: { width: 65, height: 95, borderRadius: 6 },
  noCover: { width: 65, height: 95, borderRadius: 6, backgroundColor: colors.surfaceAlt, justifyContent: "center", alignItems: "center" },
  info: { flex: 1, marginLeft: 12 },
  bookTitle: { fontSize: 15, fontWeight: "bold", color: colors.text, marginBottom: 3 },
  author: { fontSize: 12, color: colors.textMuted, marginBottom: 6 },
  statusRow: { flexDirection: "row", marginBottom: 6 },
  statusBadge: { fontSize: 12, color: colors.accent },
  progressContainer: { height: 4, backgroundColor: colors.surfaceAlt, borderRadius: 2, marginBottom: 4, overflow: "hidden" },
  progressBar: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
  pageText: { fontSize: 11, color: colors.textDim },
  ratingRow: { flexDirection: "row", gap: 2, marginTop: 2 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 60, fontSize: 16, lineHeight: 26 },
filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexWrap: "wrap" },
filterBtn: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
filterBtnActive: { backgroundColor: colors.accent },
filterText: { color: colors.textDim, fontSize: 12 },
filterTextActive: { color: colors.onAccent, fontWeight: "bold" },
});