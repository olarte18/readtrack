import { useEffect, useState } from "react";

import { getLibrary } from "../services/api";
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";

export default function HomeScreen({ navigation }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLibrary = async () => {
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mi Biblioteca</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Search")}>
          <Text style={styles.addBtn}>+ Agregar</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#cba6f7" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={books}
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
    <Text style={styles.coverEmoji}>📚</Text>
  </View>
)}
              
              
              <View style={styles.info}>
                <Text style={styles.bookTitle} numberOfLines={2}>{String(item.title)}</Text>
                <Text style={styles.author}>{String(item.author)}</Text>
                <Text style={styles.status}>
                  {item.status === "completed" && "✅ Completado"}
                  {item.status === "reading" && `📖 Página ${item.current_page ?? 0} de ${item.pages ?? "?"}`}
                  {item.status === "pending" && "🕐 Pendiente"}
                  {item.status === "abandoned" && "❌ Abandonado"}
                </Text>
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
  noCover: { width: 60, height: 90, borderRadius: 6, backgroundColor: "#2a2a3e", justifyContent: "center", alignItems: "center" },
  coverEmoji: { fontSize: 28 },
  info: { flex: 1, marginLeft: 12 },
  bookTitle: { fontSize: 15, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  author: { fontSize: 13, color: "#aaa", marginBottom: 6 },
  status: { fontSize: 12, color: "#cba6f7" },
  empty: { color: "#666", textAlign: "center", marginTop: 60, fontSize: 16, lineHeight: 26 },
  cover: { width: 60, height: 90, borderRadius: 6 },
});