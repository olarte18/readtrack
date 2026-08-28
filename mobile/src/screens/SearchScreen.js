import { useState, useEffect } from "react";
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useDebouncedCallback } from "use-debounce";
import { searchBooks } from "../services/api";
import { searchByISBN } from "../services/openLibrary";
import BookCard from "../components/BookCard";
import BarcodeScanner from "../components/BarcodeScanner";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

export default function SearchScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
const [scannerVisible, setScannerVisible] = useState(false);
  const search = useDebouncedCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const books = await searchBooks(q).catch(() => []);
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
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={handleChange}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.scanBtn} onPress={() => setScannerVisible(true)}>
  <Ionicons name="barcode-outline" size={22} color={colors.accent} />
</TouchableOpacity>
        {query.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => { setQuery(""); setResults([]); }}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      
      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />}
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
      <TouchableOpacity
        style={styles.manualBtn}
        onPress={() => navigation.navigate("ManualAdd")}
      >
        <Ionicons name="create-outline" size={18} color={colors.onAccent} />
        <Text style={styles.manualBtnText}>¿No encuentras tu libro? Créalo manualmente</Text>
      </TouchableOpacity>
          <BarcodeScanner
        visible={scannerVisible}
        onScan={handleScan}
        onClose={() => setScannerVisible(false)}
      />
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 50 },
  title: { fontSize: 24, fontWeight: "bold", color: colors.text, paddingHorizontal: 20, marginBottom: 16 },
  searchRow: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8, alignItems: "center" },
  input: { flex: 1, backgroundColor: colors.input, color: colors.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  scanBtn: { backgroundColor: colors.surface, borderRadius: 10, padding: 10 },
  clearBtn: { backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 40 },
  manualBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  manualBtnText: { color: colors.onAccent, fontWeight: "bold", fontSize: 14 },
});