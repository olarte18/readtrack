import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useTheme } from "../contexts/ThemeContext";
import { previewImport, importBooks } from "../services/api";

export default function ImportScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [fileName, setFileName] = useState(null);
  const [csv, setCsv] = useState(null);
  const [preview, setPreview] = useState(null);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const pickFile = async () => {
    setPicking(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "application/vnd.ms-excel", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets || picked.assets.length === 0) return;
      const asset = picked.assets[0];
      const text = await new File(asset.uri).text();
      setFileName(asset.name);
      setCsv(text);
      setResult(null);

      setLoading(true);
      try {
        const data = await previewImport(text);
        setPreview(data);
      } catch (e) {
        setPreview(null);
        Alert.alert("Error", e.message || "No se pudo leer el archivo CSV");
      } finally {
        setLoading(false);
      }
    } catch {
      Alert.alert("Error", "No se pudo abrir el archivo");
    } finally {
      setPicking(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await importBooks(csv);
      setResult(res);
    } catch (e) {
      Alert.alert("Error", e.message || "No se pudo importar");
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFileName(null);
    setCsv(null);
    setPreview(null);
    setResult(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Importar biblioteca</Text>
      <Text style={styles.subtitle}>
        Importa tu librería desde un CSV exportado de Goodreads, Bookmory u otra app
      </Text>

      <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={picking}>
        {picking ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Ionicons name="document-attach" size={22} color={colors.onAccent} />
        )}
        <Text style={styles.pickBtnText}>{fileName ? "Cambiar archivo" : "Seleccionar archivo CSV"}</Text>
      </TouchableOpacity>

      {fileName && (
        <View style={styles.fileCard}>
          <Ionicons name="document-text" size={20} color={colors.accent} />
          <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
          {preview && (
            <View style={styles.formatBadge}>
              <Text style={styles.formatText}>{preview.format}</Text>
            </View>
          )}
        </View>
      )}

      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />}

      {preview && !loading && (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>
              Se detectó el formato <Text style={styles.summaryHighlight}>{preview.format}</Text>
            </Text>
            <Text style={styles.summaryText}>
              {preview.total} {preview.total === 1 ? "libro" : "libros"} listos para importar
            </Text>
          </View>

          {preview.rows.length > 0 && (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>Vista previa</Text>
              {preview.rows.slice(0, 15).map((row, i) => (
                <View key={i} style={styles.previewRow}>
                  <Text style={styles.previewBook} numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text style={styles.previewMeta} numberOfLines={1}>
                    {row.author || "Autor desconocido"}
                  </Text>
                </View>
              ))}
              {preview.total > 15 && (
                <Text style={styles.previewMore}>...y {preview.total - 15} más</Text>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.importBtn} onPress={handleImport} disabled={importing}>
            {importing ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.importBtnText}>Importar {preview.total} libros</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {result && (
        <View style={styles.resultCard}>
          {result.imported > 0 ? (
            <>
              <Ionicons name="checkmark-circle" size={40} color={colors.accent} />
              <Text style={styles.resultTitle}>Importación completada</Text>
              <Text style={styles.resultText}>{result.imported} libros importados</Text>
            </>
          ) : (
            <>
              <Ionicons name="information-circle" size={40} color={colors.textDim} />
              <Text style={styles.resultTitle}>Sin libros nuevos</Text>
            </>
          )}
          {(result.already > 0 || result.skipped > 0) && (
            <Text style={styles.resultText}>
              {result.already} ya estaban en tu biblioteca
              {result.skipped > 0 ? ` · ${result.skipped} duplicados` : ""}
            </Text>
          )}
          {result.errors?.length > 0 && (
            <Text style={styles.resultError}>
              {result.errors.length} filas no se pudieron importar
            </Text>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>Listo</Text>
          </TouchableOpacity>
        </View>
      )}

      {!preview && fileName && !result && (
        <TouchableOpacity style={styles.resetBtn} onPress={reset}>
          <Text style={styles.resetBtnText}>Quitar archivo</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flexGrow: 1, backgroundColor: colors.background, paddingTop: 60, paddingHorizontal: 20 },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text, marginBottom: 6 },
    subtitle: { fontSize: 14, color: colors.textDim, lineHeight: 20, marginBottom: 24 },
    pickBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16 },
    pickBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "bold" },
    fileCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 16 },
    fileName: { flex: 1, fontSize: 14, color: colors.text },
    formatBadge: { backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    formatText: { color: colors.accent, fontSize: 12, fontWeight: "bold" },
    summaryCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginTop: 20 },
    summaryText: { fontSize: 14, color: colors.text, marginBottom: 4 },
    summaryHighlight: { fontWeight: "bold", color: colors.accent },
    previewCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginTop: 12 },
    previewTitle: { fontSize: 14, fontWeight: "bold", color: colors.text, marginBottom: 10 },
    previewRow: { marginBottom: 10 },
    previewBook: { fontSize: 13, fontWeight: "bold", color: colors.text },
    previewMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    previewMore: { fontSize: 12, color: colors.textDim, marginTop: 4 },
    importBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 20 },
    importBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "bold" },
    resultCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, marginTop: 20, alignItems: "center" },
    resultTitle: { fontSize: 17, fontWeight: "bold", color: colors.text, marginTop: 10, marginBottom: 6 },
    resultText: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginBottom: 2 },
    resultError: { fontSize: 12, color: colors.danger, marginTop: 4 },
    doneBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40, marginTop: 16 },
    doneBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: "bold" },
    resetBtn: { alignItems: "center", marginTop: 14, paddingVertical: 8 },
    resetBtnText: { color: colors.textDim, fontSize: 14 },
  });