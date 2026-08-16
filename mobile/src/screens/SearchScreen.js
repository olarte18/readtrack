import { useState } from "react";
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { searchBooks } from "../services/openLibrary";
import BookCard from "../components/BookCard";

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const books = await searchBooks(query);
    setResults(books);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Buscar libros</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Título, autor..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.btn} onPress={handleSearch}>
          <Text style={styles.btnText}>Buscar</Text>
        </TouchableOpacity>
      </View>
      {loading && <ActivityIndicator color="#cba6f7" style={{ marginTop: 20 }} />}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BookCard
            book={item}
            onPress={() => navigation.navigate("BookDetail", { book: item })}
          />
        )}
        ListEmptyComponent={
          !loading && query ? <Text style={styles.empty}>Sin resultados</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#13131f", paddingTop: 50 },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff", paddingHorizontal: 20, marginBottom: 16 },
  searchRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  input: { flex: 1, backgroundColor: "#1e1e2e", color: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  btn: { backgroundColor: "#cba6f7", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  btnText: { color: "#13131f", fontWeight: "bold" },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
});
