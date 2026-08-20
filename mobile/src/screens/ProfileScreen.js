import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { getReadingGoal, updateReadingGoal } from "../services/api";
import { Ionicons } from "@expo/vector-icons";

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [goalData, setGoalData] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  useEffect(() => {
    getReadingGoal().then(setGoalData).catch(console.error);
  }, []);

  const handleSaveGoal = async () => {
    const g = parseInt(goalInput);
    if (isNaN(g) || g <= 0) return Alert.alert("Error", "Ingresa una meta válida");
    try {
      await updateReadingGoal(g);
      setGoalData((prev) => ({ ...prev, goal: g }));
      setEditingGoal(false);
    } catch {
      Alert.alert("Error", "No se pudo guardar la meta");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={40} color="#666" />
        </View>
        <Text style={styles.name}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalTitle}>Meta {goalData?.year ?? new Date().getFullYear()}</Text>
          <TouchableOpacity onPress={() => { setEditingGoal(true); setGoalInput(String(goalData?.goal ?? "")); }}>
            <Text style={styles.editBtn}>Editar</Text>
          </TouchableOpacity>
        </View>
        {goalData?.goal > 0 ? (
          <>
            <Text style={styles.goalProgress}>{goalData.completed} de {goalData.goal} libros</Text>
            <View style={styles.goalProgressBar}>
              <View style={[styles.goalProgressFill, { width: `${Math.min((goalData.completed / goalData.goal) * 100, 100)}%` }]} />
            </View>
            <Text style={styles.goalPercent}>{Math.round((goalData.completed / goalData.goal) * 100)}% completado</Text>
          </>
        ) : (
          <Text style={styles.goalEmpty}>No has configurado una meta aún</Text>
        )}
        {editingGoal && (
          <View style={styles.goalInputRow}>
            <TextInput
              style={styles.goalInput}
              placeholder="Ej. 24"
              placeholderTextColor="#666"
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

      <View style={styles.menuContainer}>
                <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate("Stats")}>
          <Ionicons name="bar-chart-outline" size={22} color="#cba6f7" />
          <Text style={styles.menuLabel}>Estadísticas</Text>
          <Ionicons name="chevron-forward" size={18} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuItem, { marginTop: 8 }]} onPress={() => navigation.navigate("Goals")}>
          <Ionicons name="trophy-outline" size={22} color="#cba6f7" />
          <Text style={styles.menuLabel}>Metas</Text>
          <Ionicons name="chevron-forward" size={18} color="#666" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#13131f", alignItems: "center", paddingTop: 60, paddingBottom: 40 },
  profileHeader: { alignItems: "center", marginBottom: 30 },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: "#2a2a3e", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  name: { fontSize: 22, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  email: { fontSize: 14, color: "#666" },
  section: { width: "100%", paddingHorizontal: 20, marginBottom: 20, backgroundColor: "#1e1e2e", padding: 16, borderRadius: 12, marginHorizontal: 20 },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  goalTitle: { fontSize: 16, fontWeight: "bold", color: "#fff" },
  editBtn: { color: "#cba6f7", fontSize: 13 },
  goalProgress: { color: "#aaa", fontSize: 14, marginBottom: 8 },
  goalProgressBar: { height: 8, backgroundColor: "#2a2a3e", borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  goalProgressFill: { height: 8, backgroundColor: "#cba6f7", borderRadius: 4 },
  goalPercent: { color: "#666", fontSize: 12 },
  goalEmpty: { color: "#666", fontSize: 13 },
  goalInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  goalInput: { flex: 1, backgroundColor: "#2a2a3e", color: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  goalSaveBtn: { backgroundColor: "#cba6f7", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  goalSaveBtnText: { color: "#13131f", fontWeight: "bold" },
  cancelBtn: { color: "#666", fontSize: 13 },
  menuContainer: { width: "100%", paddingHorizontal: 20, marginBottom: 30 },
  menuItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e1e2e", borderRadius: 12, padding: 16, gap: 12 },
  menuLabel: { flex: 1, fontSize: 16, color: "#fff" },
  logoutButton: { backgroundColor: "#f38ba8", borderRadius: 10, paddingHorizontal: 32, paddingVertical: 12 },
  logoutButtonText: { color: "#13131f", fontWeight: "bold", fontSize: 16 },
});
