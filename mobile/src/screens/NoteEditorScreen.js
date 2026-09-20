import { useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { AppAlert } from "../components/AppAlert";
import { updateNote } from "../services/api";

// Pantalla dedicada para editar notas largas sin los problemas de los modales.
// Recibe `note` y un `onGoBack(updatedNote)` opcional para que el padre
// refresque su lista al volver.
export default function NoteEditorScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { note, onGoBack } = route.params;
  const [content, setContent] = useState(note?.content ?? "");
  const [page, setPage] = useState(note?.page != null ? String(note.page) : "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const text = content.trim();
    if (!text) return AppAlert.alert("Error", "Escribe algo en la nota");
    setSaving(true);
    try {
      const updated = await updateNote(note.id, {
        content: text,
        page: page.trim() === "" ? null : parseInt(page, 10),
      });
      onGoBack?.(updated);
      navigation.goBack();
    } catch {
      AppAlert.alert("Error", "No se pudo guardar la nota");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Editar nota</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          style={styles.contentInput}
          value={content}
          onChangeText={setContent}
          placeholder="Escribe tu nota…"
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={5000}
          autoFocus
          textAlignVertical="top"
        />

        <TextInput
          style={styles.pageInput}
          value={page}
          onChangeText={setPage}
          placeholder="Página (opcional)"
          placeholderTextColor={colors.placeholder}
          keyboardType="number-pad"
          maxLength={6}
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveText}>{saving ? "Guardando…" : "Guardar"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 50,
      marginBottom: 12,
      gap: 12,
    },
    title: { fontSize: 20, fontWeight: "bold", color: colors.text },
    backBtn: { backgroundColor: colors.surface, borderRadius: 10, padding: 8 },
    content: { paddingHorizontal: 16, paddingBottom: 30 },
    contentInput: {
      backgroundColor: colors.input,
      color: colors.text,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      lineHeight: 22,
      minHeight: 260,
      maxHeight: 420,
      borderColor: colors.border,
      borderWidth: 1,
      textAlignVertical: "top",
    },
    pageInput: {
      backgroundColor: colors.input,
      color: colors.text,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      marginTop: 12,
      borderColor: colors.border,
      borderWidth: 1,
    },
    saveBtn: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 20,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveText: { color: colors.onAccent, fontWeight: "bold", fontSize: 16 },
  });