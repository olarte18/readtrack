import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useAuth } from "../contexts/AuthContext";

export default function ProfileScreen() {
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
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#13131f", alignItems: "center", paddingTop: 80 },
  profileHeader: { alignItems: "center", marginBottom: 40 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#2a2a3e", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  avatarEmoji: { fontSize: 48 },
  name: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  email: { fontSize: 16, color: "#666" },
  logoutButton: { backgroundColor: "#f38ba8", borderRadius: 10, paddingHorizontal: 32, paddingVertical: 12 },
  logoutButtonText: { color: "#13131f", fontWeight: "bold", fontSize: 16 },
});