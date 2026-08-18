import { useState, useEffect } from "react";
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useDebouncedCallback } from "use-debounce";
import { searchBooks } from "../services/openLibrary";
import BookCard from "../components/BookCard";
import BarcodeScanner from "../components/BarcodeScanner";
import { searchByISBN } from "../services/openLibrary";
import { Ionicons } from "@expo/vector-icons";

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
const [scannerVisible, setScannerVisible] = useState(false);
  const search = useDebouncedCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const books = await searchBooks(q);
    setResults(books);
    setLoading(false);
  }, 500);

  const handleChange = (text) => {
    setQuery(text);
    search(text);
  };
const handleScan = async (isbn) => {
  setScannerVisible(false);
  setLoading(true);
  const book = await searchByISBN(isbn);
  if (book) {
    navigation.navigate("BookDetail", { book });
  } else {
    setQuery(isbn);
    search(isbn);
  }
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
          onChangeText={handleChange}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.scanBtn} onPress={() => setScannerVisible(true)}>
  <Ionicons name="barcode-outline" size={22} color="#cba6f7" />
</TouchableOpacity>
        {query.length > 0 && (
          
          <TouchableOpacity style={styles.clearBtn} onPress={() => { setQuery(""); setResults([]); }}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
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
          <BarcodeScanner
        visible={scannerVisible}
        onScan={handleScan}
        onClose={() => setScannerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#13131f", paddingTop: 50 },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff", paddingHorizontal: 20, marginBottom: 16 },
  searchRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8, alignItems: "center" },
  input: { flex: 1, backgroundColor: "#1e1e2e", color: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  clearBtn: { backgroundColor: "#2a2a3e", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  clearText: { color: "#aaa", fontSize: 14 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
});