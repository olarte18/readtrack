import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import StreakReminderModal from "../components/StreakReminderModal";

const THEMES = [
  { id: "system", label: "Sistema", icon: "contrast" },
  { id: "light", label: "Claro", icon: "sunny" },
  { id: "dark", label: "Oscuro", icon: "moon" },
];

export default function SettingsScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { colors, theme, setTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    try {
      setUpdateInfo({
        id: Updates.updateId,
        createdAt: Updates.createdAt ? new Date(Updates.createdAt) : null,
        runtimeVersion: Updates.runtimeVersion,
        channel: Updates.channel,
        embedded: Updates.isEmbeddedLaunch,
      });
    } catch {}
  }, []);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Volver al perfil"
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} accessible={false} />
          </TouchableOpacity>
          <Text style={styles.title}>Ajustes</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Apariencia</Text>
          <Text style={styles.description}>Elige cómo se muestra ReadTrack.</Text>
          <View style={styles.themeRow}>
            {THEMES.map((item) => {
              const selected = theme === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.themeButton, selected && styles.themeButtonSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={`Tema de la app: ${item.label.toLowerCase()}${selected ? ". Seleccionado" : ""}`}
                  accessibilityState={{ selected }}
                  onPress={() => setTheme(item.id)}
                >
                  <Ionicons name={item.icon} size={16} color={selected ? colors.onAccent : colors.textMuted} accessible={false} />
                  <Text style={[styles.themeText, selected && styles.themeTextSelected]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notificaciones</Text>
          <TouchableOpacity
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel="Notificaciones de racha"
            onPress={() => setReminderOpen(true)}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.accent} accessible={false} />
            <Text style={styles.rowLabel}>Recordatorio de racha</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} accessible={false} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tus datos</Text>
          <TouchableOpacity
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel="Importar biblioteca"
            onPress={() => navigation.navigate("Import")}
          >
            <Ionicons name="cloud-upload-outline" size={22} color={colors.accent} accessible={false} />
            <Text style={styles.rowLabel}>Importar biblioteca</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} accessible={false} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.rowSpacing]}
            accessibilityRole="button"
            accessibilityLabel="Exportar datos"
            onPress={() => navigation.navigate("Export")}
          >
            <Ionicons name="share-outline" size={22} color={colors.accent} accessible={false} />
            <Text style={styles.rowLabel}>Exportar datos</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} accessible={false} />
          </TouchableOpacity>
        </View>

        {updateInfo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Información de la app</Text>
            <DiagnosticRow label="Update ID" value={updateInfo.id ?? "ninguno (integrados)"} styles={styles} />
            <DiagnosticRow label="Fecha" value={updateInfo.createdAt ? updateInfo.createdAt.toLocaleString() : "-"} styles={styles} />
            <DiagnosticRow label="Runtime" value={updateInfo.runtimeVersion} styles={styles} />
            <DiagnosticRow label="Canal" value={updateInfo.channel} styles={styles} />
            <DiagnosticRow label="Origen" value={updateInfo.embedded ? "integrado en el APK" : "desde EAS Update"} styles={styles} />
          </View>
        )}

        <StreakReminderModal
          visible={reminderOpen}
          onClose={() => setReminderOpen(false)}
          userId={user?.id}
          mode="settings"
        />

        <TouchableOpacity
          style={styles.logoutButton}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          onPress={logout}
        >
          <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function DiagnosticRow({ label, value, styles }) {
  return (
    <View style={styles.diagnosticRow}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={styles.diagnosticValue}>{value}</Text>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, alignItems: "center" },
  header: { width: "100%", maxWidth: 440, flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backButton: { width: 44, height: 44, justifyContent: "center", alignItems: "flex-start" },
  title: { color: colors.text, fontSize: 24, fontWeight: "bold", marginLeft: 4 },
  section: { width: "100%", maxWidth: 440, backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "bold", marginBottom: 10 },
  description: { color: colors.textDim, fontSize: 13, marginBottom: 12 },
  themeRow: { flexDirection: "row", gap: 8 },
  themeButton: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingVertical: 11 },
  themeButtonSelected: { backgroundColor: colors.accent },
  themeText: { color: colors.textMuted, fontSize: 13 },
  themeTextSelected: { color: colors.onAccent, fontWeight: "bold" },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  rowSpacing: { marginTop: 8 },
  rowLabel: { flex: 1, color: colors.text, fontSize: 15 },
  diagnosticRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 5 },
  diagnosticLabel: { color: colors.textDim, fontSize: 13, width: 90 },
  diagnosticValue: { flex: 1, color: colors.text, fontSize: 13, textAlign: "right" },
  logoutButton: { backgroundColor: colors.danger, borderRadius: 10, paddingHorizontal: 32, paddingVertical: 12, marginTop: 4 },
  logoutButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
