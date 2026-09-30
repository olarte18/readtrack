import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { AppAlert } from "../components/AppAlert";
import { useTheme } from "../contexts/ThemeContext";
import { exportBackup, exportLibraryCsv } from "../services/api";

export default function ExportScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [sharingCsv, setSharingCsv] = useState(false);
  const [backup, setBackup] = useState(null); // el "plan" completo (GET /export)

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await exportBackup();
        if (active) setBackup(data);
      } catch (e) {
        AppAlert.alert("Error", e.message || "No se pudo generar el respaldo");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const sessions = (backup?.books ?? []).reduce((acc, b) => acc + (b.sessionDays?.length ?? 0), 0);
  const archived = (backup?.books ?? []).filter((b) => b.isArchived).length;

  const shareBackup = async () => {
    if (!backup) return;
    setSharing(true);
    try {
      const name = `readtrack-respaldo-${backup.exportedAt ? backup.exportedAt.slice(0, 10) : new Date().toISOString().slice(0, 10)}.json`;
      const file = new File(Paths.cache, name);
      file.write(JSON.stringify(backup), { encoding: "utf8" });
      if (!(await Sharing.isAvailableAsync())) {
        AppAlert.alert("No disponible", "Compartir archivos no está disponible en este dispositivo");
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Respaldo de ReadTrack",
        UTI: "public.json",
      });
    } catch (e) {
      AppAlert.alert("Error", e.message || "No se pudo compartir el respaldo");
    } finally {
      setSharing(false);
    }
  };

  const shareCsv = async () => {
    setSharingCsv(true);
    try {
      const { csv } = await exportLibraryCsv();
      const name = `readtrack-biblioteca-${new Date().toISOString().slice(0, 10)}.csv`;
      const file = new File(Paths.cache, name);
      file.write(csv, { encoding: "utf8" });
      if (!(await Sharing.isAvailableAsync())) {
        AppAlert.alert("No disponible", "Compartir archivos no está disponible en este dispositivo");
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Biblioteca de ReadTrack",
        UTI: "public.comma-separated-values-text",
      });
    } catch (e) {
      AppAlert.alert("Error", e.message || "No se pudo compartir la biblioteca");
    } finally {
      setSharingCsv(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Exportar datos</Text>
      <Text style={styles.subtitle}>
        Genera un respaldo completo de tu biblioteca: libros (incluidos archivados), sesiones de lectura, notas,
        ciclos y metas. Podrás restaurarlo en otro teléfono desde "Importar biblioteca". También puedes descargar
        la biblioteca en CSV estilo Goodreads para llevarla a otra app.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 40 }} />
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryHighlight}>{(backup?.books ?? []).length} libros</Text>
            <View style={styles.statGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{sessions}</Text>
                <Text style={styles.statLabel}>sesiones</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{backup?.notes?.length ?? 0}</Text>
                <Text style={styles.statLabel}>notas</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{backup?.goals?.length ?? 0}</Text>
                <Text style={styles.statLabel}>metas</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{archived}</Text>
                <Text style={styles.statLabel}>archivados</Text>
              </View>
            </View>
            {backup?.exportedAt && (
              <Text style={styles.summaryText}>Generado el {backup.exportedAt.slice(0, 10)}</Text>
            )}
          </View>

          <TouchableOpacity style={styles.shareBtn} accessibilityRole="button" accessibilityLabel="Compartir respaldo completo (JSON)" onPress={shareBackup} disabled={sharing}>
            {sharing ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Ionicons name="share-outline" size={22} color={colors.onAccent} accessible={false} />
            )}
            <Text style={styles.shareBtnText}>Compartir respaldo completo (JSON)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.csvBtn} accessibilityRole="button" accessibilityLabel="Compartir biblioteca (CSV)" onPress={shareCsv} disabled={sharingCsv}>
            {sharingCsv ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Ionicons name="document-text-outline" size={20} color={colors.accent} accessible={false} />
            )}
            <Text style={styles.csvBtnText}>Compartir biblioteca (CSV)</Text>
          </TouchableOpacity>
          <Text style={styles.csvHint}>
            El CSV lleva título, autor, rating, fechas, estante y reseña. Para una copia con todo (sesiones,
            notas y metas), usa el respaldo JSON.
          </Text>

          <TouchableOpacity style={styles.doneBtn} accessibilityRole="button" accessibilityLabel="Listo" onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>Listo</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flexGrow: 1, backgroundColor: colors.background, paddingTop: 60, paddingHorizontal: 20 },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text, marginBottom: 6 },
    subtitle: { fontSize: 14, color: colors.textDim, lineHeight: 20, marginBottom: 24 },
    summaryCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16 },
    summaryText: { fontSize: 13, color: colors.textMuted, marginTop: 8, textAlign: "center" },
    summaryHighlight: { fontWeight: "bold", color: colors.accent, fontSize: 18, marginBottom: 4 },
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 8 },
    statItem: { flexGrow: 1, minWidth: "22%", backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10, alignItems: "center" },
    statNumber: { fontSize: 18, fontWeight: "bold", color: colors.accent },
    statLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center", marginTop: 2 },
    shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, marginTop: 20 },
    shareBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "bold" },
    csvBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 14, marginTop: 12, borderWidth: 1, borderColor: colors.surfaceAlt },
    csvBtnText: { color: colors.accent, fontSize: 15, fontWeight: "bold" },
    csvHint: { fontSize: 12, color: colors.textDim, textAlign: "center", marginTop: 8, lineHeight: 16 },
    doneBtn: { alignItems: "center", marginTop: 14, paddingVertical: 8 },
    doneBtnText: { color: colors.textDim, fontSize: 14 },
  });