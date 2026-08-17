import { useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { addBook, updateBook } from "../services/api";

const STATUS_OPTIONS = [
  { key: "reading", label: "📖 Leyendo" },
  { key: "completed", label: "✅ Completado" },
  { key: "pending", label: "🕐 Pendiente" },
  { key: "abandoned", label: "❌ Abandonado" },
];

export default function BookDetailScreen({ route, navigation }) {
  const { book, onGoBack } = route.params;
  const isInLibrary = !!book.status;
  const [selectedStatus, setSelectedStatus] = useState(book.status ?? null);
  const [loading, setLoading] = useState(false);

  const handleAdd = async (status) => {
    setSelectedStatus(status);
    setLoading(true);
    try {
      await addBook({ ...book, google_id: book.id }, status);
      Alert.alert("✅ Listo", `"${book.title}" agregado a tu biblioteca`, [
        { text: "OK", onPress: () => { onGoBack?.(); navigation.goBack(); } }
      ]);
    } catch (error) {
      Alert.alert("Error", "No se pudo agregar el libro");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (status) => {
    setSelectedStatus(status);
    setLoading(true);
    try {
      await updateBook(book.id, { status });
      Alert.alert("✅ Actualizado", `Estado cambiado a "${STATUS_OPTIONS.find(o => o.key === status)?.label}"`, [
        { text: "OK", onPress: () => { onGoBack?.(); navigation.goBack(); } }
      ]);
    } catch (error) {
      Alert.alert("Error", "No se pudo actualizar el estado");
    } finally {
      setLoading(false);
    }
  };

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
        <Text style={styles.sectionTitle}>
          {isInLibrary ? "Cambiar estado" : "Agregar a biblioteca"}
        </Text>
        {loading ? (
          <ActivityIndicator color="#cba6f7" />
        ) : (
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.statusBtn, selectedStatus === opt.key && styles.statusBtnActive]}
                onPress={() => isInLibrary ? handleUpdate(opt.key) : handleAdd(opt.key)}
              >
                <Text style={[styles.statusBtnText, selectedStatus === opt.key && styles.statusBtnTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
  statusBtnActive: { backgroundColor: "#cba6f7" },
  statusBtnText: { color: "#cba6f7", fontSize: 13 },
  statusBtnTextActive: { color: "#13131f", fontWeight: "bold" },
});