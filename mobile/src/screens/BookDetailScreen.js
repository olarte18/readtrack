import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView } from "react-native";

const STATUS_OPTIONS = [
  { key: "reading", label: "📖 Leyendo" },
  { key: "completed", label: "✅ Completado" },
  { key: "pending", label: "🕐 Pendiente" },
  { key: "abandoned", label: "❌ Abandonado" },
];

export default function BookDetailScreen({ route }) {
  const { book } = route.params;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        {book.cover ? (
          <Image source={{ uri: book.cover }} style={styles.cover} />
        ) : (
          <View style={styles.noCover}>
            <Text style={styles.noCoverEmoji}>📚</Text>
          </View>
        )}
        <Text style={styles.title}>{String(book.title)}</Text>
        <Text style={styles.author}>{String(book.author)}</Text>
        {!!book.year && <Text style={styles.meta}>{String(book.year)}</Text>}
        {!!book.pages && <Text style={styles.meta}>{String(book.pages)} páginas</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Estado</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => (
            <TouchableOpacity key={opt.key} style={styles.statusBtn}>
              <Text style={styles.statusBtnText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#13131f" },
  hero: { alignItems: "center", paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20 },
  cover: { width: 120, height: 180, borderRadius: 10, marginBottom: 16 },
  noCover: { width: 120, height: 180, borderRadius: 10, backgroundColor: "#2a2a3e", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  noCoverEmoji: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: "bold", color: "#fff", textAlign: "center", marginBottom: 6 },
  author: { fontSize: 15, color: "#aaa", marginBottom: 4 },
  meta: { fontSize: 13, color: "#666" },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#fff", marginBottom: 12 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusBtn: { backgroundColor: "#1e1e2e", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  statusBtnText: { color: "#cba6f7", fontSize: 13 },
});
