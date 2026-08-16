import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useAuth } from "../contexts/AuthContext";

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileHeader}>
        <Image source={{ uri: user.avatar }} style={styles.avatar} />
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#13131f", alignItems: "center", paddingTop: 50 },
  profileHeader: { alignItems: "center", marginBottom: 30 },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 10 },
  name: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  email: { fontSize: 16, color: "#666" },
  logoutButton: { backgroundColor: "#cba6f7", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  logoutButtonText: { color: "#13131f", fontWeight: "bold" },
});
