import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarEmoji}>👤</Text>
        </View>
        <Text style={styles.name}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate("Stats")}>
          <Ionicons name="bar-chart-outline" size={22} color="#cba6f7" />
          <Text style={styles.menuLabel}>Estadísticas</Text>
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
  profileHeader: { alignItems: "center", marginBottom: 40 },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: "#2a2a3e", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  avatarEmoji: { fontSize: 40 },
  name: { fontSize: 22, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  email: { fontSize: 14, color: "#666" },
  menuContainer: { width: "100%", paddingHorizontal: 20, marginBottom: 30 },
  menuItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e1e2e", borderRadius: 12, padding: 16, gap: 12 },
  menuLabel: { flex: 1, fontSize: 16, color: "#fff" },
  logoutButton: { backgroundColor: "#f38ba8", borderRadius: 10, paddingHorizontal: 32, paddingVertical: 12 },
  logoutButtonText: { color: "#13131f", fontWeight: "bold", fontSize: 16 },
});
