import { useEffect, useState } from "react";

import { getLibrary } from "../services/api";
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function HomeScreen({ navigation ,route}) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
const { filterStatus } = route?.params ?? {};
const [filter, setFilter] = useState(filterStatus ?? "all");  const fetchLibrary = async () => {
    setLoading(true);
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
  }, []);
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
        <ActivityIndicator color="#cba6f7" style={{ marginTop: 60 }} />
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
        <Ionicons name="book" size={26} color="#666" />
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
            <Ionicons key={i} name="star" size={12} color="#f5c97b" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#13131f" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 50 },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  addBtn: { color: "#cba6f7", fontSize: 16, fontWeight: "600" },
  card: { flexDirection: "row", backgroundColor: "#1e1e2e", borderRadius: 12, marginHorizontal: 16, marginVertical: 6, padding: 12, alignItems: "center" },
  cover: { width: 65, height: 95, borderRadius: 6 },
  noCover: { width: 65, height: 95, borderRadius: 6, backgroundColor: "#2a2a3e", justifyContent: "center", alignItems: "center" },
  info: { flex: 1, marginLeft: 12 },
  bookTitle: { fontSize: 15, fontWeight: "bold", color: "#fff", marginBottom: 3 },
  author: { fontSize: 12, color: "#aaa", marginBottom: 6 },
  statusRow: { flexDirection: "row", marginBottom: 6 },
  statusBadge: { fontSize: 12, color: "#cba6f7" },
  progressContainer: { height: 4, backgroundColor: "#2a2a3e", borderRadius: 2, marginBottom: 4, overflow: "hidden" },
  progressBar: { height: 4, backgroundColor: "#cba6f7", borderRadius: 2 },
  pageText: { fontSize: 11, color: "#666" },
  ratingRow: { flexDirection: "row", gap: 2, marginTop: 2 },
  rating: { fontSize: 12, marginTop: 2 },
  empty: { color: "#666", textAlign: "center", marginTop: 60, fontSize: 16, lineHeight: 26 },
filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexWrap: "wrap" },
filterBtn: { backgroundColor: "#1e1e2e", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
filterBtnActive: { backgroundColor: "#cba6f7" },
filterText: { color: "#666", fontSize: 12 },
filterTextActive: { color: "#13131f", fontWeight: "bold" },
});