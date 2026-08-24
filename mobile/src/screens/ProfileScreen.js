import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { getGoals, saveGoal } from "../services/api";
import { isWhatsNewVisible } from "../utils/whatsNew";
import { Ionicons } from "@expo/vector-icons";

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { colors, theme, setTheme } = useTheme();
  const styles = createStyles(colors);
  const [goalData, setGoalData] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [whatsNewVisible, setWhatsNewVisible] = useState(false);

  useEffect(() => {
    isWhatsNewVisible().then(setWhatsNewVisible);
  }, []);

  useEffect(() => {
    getGoals().then((res) => {
      const annual = res.goals?.find((g) => g.type === "annual");
      const value = Number(annual?.value) || 0;
      const completed = Number.isInteger(res.progress?.annual) ? res.progress.annual : 0;
      setGoalData({ value, completed, year: res.year });
    }).catch(console.error);
  }, []);

  const handleSaveGoal = async () => {
    const g = parseInt(goalInput);
    if (isNaN(g) || g <= 0) return Alert.alert("Error", "Ingresa una meta válida");
    try {
      await saveGoal("annual", "books", g);
      setGoalData((prev) => ({ ...prev, value: g }));
      setEditingGoal(false);
    } catch {
      Alert.alert("Error", "No se pudo guardar la meta");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={40} color={colors.textDim} />
        </View>
        <Text style={styles.name}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalTitle}>Meta {goalData?.year ?? new Date().getFullYear()}</Text>
          <TouchableOpacity onPress={() => { setEditingGoal(true); setGoalInput(String(goalData?.value ?? "")); }}>
            <Text style={styles.editBtn}>Editar</Text>
          </TouchableOpacity>
        </View>
        {goalData?.value > 0 ? (
          <>
            <Text style={styles.goalProgress}>{goalData.completed} de {goalData.value} libros</Text>
            <View style={styles.goalProgressBar}>
              <View style={[styles.goalProgressFill, { width: `${Math.min((goalData.completed / goalData.value) * 100, 100)}%` }]} />
            </View>
            <Text style={styles.goalPercent}>{Math.round((goalData.completed / goalData.value) * 100)}% completado</Text>
          </>
        ) : (
          <Text style={styles.goalEmpty}>No has configurado una meta aún</Text>
        )}
        {editingGoal && (
          <View style={styles.goalInputRow}>
            <TextInput
              style={styles.goalInput}
              placeholder="Ej. 24"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={goalInput}
              onChangeText={setGoalInput}
            />
            <TouchableOpacity style={styles.goalSaveBtn} onPress={handleSaveGoal}>
              <Text style={styles.goalSaveBtnText}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingGoal(false)}>
              <Text style={styles.cancelBtn}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tema de la app</Text>
        <View style={styles.themeRow}>
          <TouchableOpacity
            style={[styles.themeBtn, theme === "light" && styles.themeBtnActive]}
            onPress={() => setTheme("light")}
          >
            <Ionicons name="sunny" size={18} color={theme === "light" ? colors.onAccent : colors.textMuted} />
            <Text style={[styles.themeBtnText, theme === "light" && styles.themeBtnTextActive]}>Claro</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.themeBtn, theme === "dark" && styles.themeBtnActive]}
            onPress={() => setTheme("dark")}
          >
            <Ionicons name="moon" size={18} color={theme === "dark" ? colors.onAccent : colors.textMuted} />
            <Text style={[styles.themeBtnText, theme === "dark" && styles.themeBtnTextActive]}>Oscuro</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.menuContainer}>
        {whatsNewVisible && (
          <TouchableOpacity
            style={[styles.menuItem, styles.whatsNewItem]}
            onPress={() => navigation.navigate("WhatsNew")}
          >
            <Ionicons name="sparkles" size={22} color={colors.star} />
            <Text style={styles.menuLabel}>Novedades</Text>
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NUEVO</Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.menuItem, whatsNewVisible && { marginTop: 8 }]} onPress={() => navigation.navigate("Import")}>
          <Ionicons name="cloud-upload-outline" size={22} color={colors.accent} />
          <Text style={styles.menuLabel}>Importar biblioteca</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuItem, { marginTop: 8 }]} onPress={() => navigation.navigate("Calendar")}>
          <Ionicons name="calendar-outline" size={22} color={colors.accent} />
          <Text style={styles.menuLabel}>Calendario de lectura</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuItem, { marginTop: 8 }]} onPress={() => navigation.navigate("Stats")}>
          <Ionicons name="bar-chart-outline" size={22} color={colors.accent} />
          <Text style={styles.menuLabel}>Estadísticas</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuItem, { marginTop: 8 }]} onPress={() => navigation.navigate("Goals")}>
          <Ionicons name="trophy-outline" size={22} color={colors.accent} />
          <Text style={styles.menuLabel}>Metas</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.background, alignItems: "center", paddingTop: 60, paddingBottom: 40 },
  profileHeader: { alignItems: "center", marginBottom: 30 },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.surfaceAlt, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  name: { fontSize: 22, fontWeight: "bold", color: colors.text, marginBottom: 4 },
  email: { fontSize: 14, color: colors.textDim },
  section: { width: "100%", padding: 16, borderRadius: 12, marginBottom: 20, backgroundColor: colors.surface, marginHorizontal: 20, maxWidth: 400 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: colors.text, marginBottom: 12 },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  goalTitle: { fontSize: 16, fontWeight: "bold", color: colors.text },
  editBtn: { color: colors.accent, fontSize: 13 },
  goalProgress: { color: colors.textMuted, fontSize: 14, marginBottom: 8 },
  goalProgressBar: { height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  goalProgressFill: { height: 8, backgroundColor: colors.accent, borderRadius: 4 },
  goalPercent: { color: colors.textDim, fontSize: 12 },
  goalEmpty: { color: colors.textDim, fontSize: 13 },
  goalInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  goalInput: { flex: 1, backgroundColor: colors.input, color: colors.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  goalSaveBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  goalSaveBtnText: { color: colors.onAccent, fontWeight: "bold" },
  cancelBtn: { color: colors.textDim, fontSize: 13 },
  themeRow: { flexDirection: "row", gap: 8 },
  themeBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  themeBtnActive: { backgroundColor: colors.accent },
  themeBtnText: { color: colors.textMuted, fontSize: 14 },
  themeBtnTextActive: { color: colors.onAccent, fontWeight: "bold" },
    menuContainer: { width: "100%", paddingHorizontal: 20, marginBottom: 30, maxWidth: 440 },
    menuItem: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 12 },
    whatsNewItem: { borderWidth: 1, borderColor: colors.star + "66" },
    newBadge: {
      backgroundColor: colors.star + "22",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    newBadgeText: { fontSize: 10, fontWeight: "bold", color: colors.star },
  menuLabel: { flex: 1, fontSize: 16, color: colors.text },
  logoutButton: { backgroundColor: colors.danger, borderRadius: 10, paddingHorizontal: 32, paddingVertical: 12 },
  logoutButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});