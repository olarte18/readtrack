import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { getLibrary } from "../services/api";

export default function ReadingScreen({ navigation }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReading = async () => {
    setLoading(true);
    try {
      const all = await getLibrary();
      setBooks(all.filter((b) => b.status === "reading"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchReading(); }, []));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>En curso</Text>
      {loading ? (
        <ActivityIndicator color="#cba6f7" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.bookInfo}
                onPress={() => navigation.navigate("BookDetail", { book: item, onGoBack: fetchReading })}
              >
                {item.cover ? (
                  <Image source={{ uri: item.cover }} style={styles.cover} />
                ) : (
                  <View style={styles.noCover}>
                    <Ionicons name="book" size={24} color="#666" />
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.author} numberOfLines={1}>{item.author}</Text>
                  {!!item.pages && (
                    <View style={styles.progressContainer}>
                      <View style={[styles.progressBar, { width: `${Math.min((item.current_page / item.pages) * 100, 100)}%` }]} />
                    </View>
                  )}
                  <Text style={styles.pageText}>
                    Página {item.current_page ?? 0}{item.pages ? ` de ${item.pages}` : ""}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.continueBtn}
                onPress={() => navigation.navigate("ActiveSession", { book: item })}
              >
                <Ionicons name="play" size={16} color="#13131f" />
                <Text style={styles.continueBtnLabel}>Leer</Text>
              </TouchableOpacity>
            </View>
          )}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#13131f" },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff", padding: 20, paddingTop: 50 },
  card: { flexDirection: "row", backgroundColor: "#1e1e2e", borderRadius: 12, marginHorizontal: 16, marginVertical: 6, padding: 12, alignItems: "center" },
  bookInfo: { flex: 1, flexDirection: "row", alignItems: "center" },
  cover: { width: 60, height: 90, borderRadius: 6 },
  noCover: { width: 60, height: 90, borderRadius: 6, backgroundColor: "#2a2a3e", justifyContent: "center", alignItems: "center" },
  info: { flex: 1, marginLeft: 12 },
  bookTitle: { fontSize: 14, fontWeight: "bold", color: "#fff", marginBottom: 3 },
  author: { fontSize: 12, color: "#aaa", marginBottom: 6 },
  progressContainer: { height: 4, backgroundColor: "#2a2a3e", borderRadius: 2, marginBottom: 4, overflow: "hidden" },
  progressBar: { height: 4, backgroundColor: "#cba6f7", borderRadius: 2 },
  pageText: { fontSize: 11, color: "#666" },
  continueBtn: { backgroundColor: "#cba6f7", borderRadius: 10, padding: 12, alignItems: "center", marginLeft: 10, minWidth: 50 },
  continueBtnLabel: { color: "#13131f", fontSize: 10, fontWeight: "bold" },
  empty: { color: "#666", textAlign: "center", marginTop: 60, fontSize: 16, lineHeight: 26 },
});
