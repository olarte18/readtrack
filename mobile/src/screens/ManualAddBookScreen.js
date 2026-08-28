import { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { addBook } from "../services/api";

const STATUS_OPTIONS = [
  { key: "reading", label: "Leyendo" },
  { key: "paused", label: "Pausado" },
  { key: "completed", label: "Completado" },
  { key: "pending", label: "Pendiente" },
  { key: "wishlist", label: "Deseos" },
  { key: "abandoned", label: "Abandonado" },
];

const BOOK_TYPES = [
  { key: "physical", label: "Físico" },
  { key: "ebook", label: "eBook" },
  { key: "audio", label: "Audiolibro" },
];

export default function ManualAddBookScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [title, setTitle] = useState("");
  const [pages, setPages] = useState("");
  const [author, setAuthor] = useState("");
  const [cover, setCover] = useState("");
  const [publisher, setPublisher] = useState("");
  const [bookType, setBookType] = useState(null);
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("pending");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return Alert.alert("Error", "El título es obligatorio");
    const pageCount = parseInt(pages, 10);
    if (isNaN(pageCount) || pageCount <= 0) {
      return Alert.alert("Error", "Ingresa un número de páginas válido");
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        pages: pageCount,
        author: author.trim() || undefined,
        cover: cover.trim() || undefined,
        publisher: publisher.trim() || undefined,
        book_type: bookType || undefined,
        year: year ? parseInt(year, 10) : undefined,
        isbn: isbn.trim() || undefined,
        genre: genre.trim() || undefined,
        description: description.trim() || undefined,
      };
      await addBook(payload, status);
      Alert.alert("Listo", `"${title.trim()}" agregado a tu biblioteca`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert("Error", "No se pudo guardar el libro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Agregar manualmente</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          placeholder="Nombre del libro"
          placeholderTextColor={colors.placeholder}
          value={title}
          onChangeText={setTitle}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Páginas *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 320"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
          value={pages}
          onChangeText={setPages}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Autor</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Gabriel García Márquez"
          placeholderTextColor={colors.placeholder}
          value={author}
          onChangeText={setAuthor}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Portada (URL)</Text>
        <TextInput
          style={styles.input}
          placeholder="https://..."
          placeholderTextColor={colors.placeholder}
          value={cover}
          onChangeText={setCover}
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Editorial</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Penguin Random House"
          placeholderTextColor={colors.placeholder}
          value={publisher}
          onChangeText={setPublisher}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Tipo de libro</Text>
        <View style={styles.segRow}>
          {BOOK_TYPES.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.segBtn, bookType === opt.key && styles.segBtnActive]}
              onPress={() => setBookType(opt.key)}
            >
              <Text style={[styles.segBtnText, bookType === opt.key && styles.segBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Año</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 2020"
          placeholderTextColor={colors.placeholder}
          keyboardType="numeric"
          value={year}
          onChangeText={setYear}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>ISBN</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 978-9584292153"
          placeholderTextColor={colors.placeholder}
          value={isbn}
          onChangeText={setIsbn}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Género</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Novela, Fantasía..."
          placeholderTextColor={colors.placeholder}
          value={genre}
          onChangeText={setGenre}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Descripción</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          placeholder="Sinopsis o notas del libro..."
          placeholderTextColor={colors.placeholder}
          value={description}
          onChangeText={setDescription}
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Estado</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.statusBtn, status === opt.key && styles.statusBtnActive]}
              onPress={() => setStatus(opt.key)}
            >
              <Text style={[styles.statusBtnText, status === opt.key && styles.statusBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.saveBtnText}>Guardar libro</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: 50 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text },
    backBtn: { backgroundColor: colors.surface, borderRadius: 10, padding: 8 },
    section: { paddingHorizontal: 20, marginTop: 16 },
    label: { fontSize: 13, fontWeight: "bold", color: colors.textMuted, marginBottom: 8 },
    input: {
      backgroundColor: colors.input,
      color: colors.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
    },
    descriptionInput: { minHeight: 90, textAlignVertical: "top" },
    segRow: { flexDirection: "row", gap: 8 },
    segBtn: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
    segBtnActive: { backgroundColor: colors.accent },
    segBtnText: { color: colors.accent, fontSize: 13 },
    segBtnTextActive: { color: colors.onAccent, fontWeight: "bold" },
    statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    statusBtn: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    statusBtnActive: { backgroundColor: colors.accent },
    statusBtnText: { color: colors.accent, fontSize: 13 },
    statusBtnTextActive: { color: colors.onAccent, fontWeight: "bold" },
    saveBtn: {
      marginTop: 24,
      marginHorizontal: 20,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    saveBtnText: { color: colors.onAccent, fontWeight: "bold", fontSize: 16 },
  });