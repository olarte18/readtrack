import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView } from "react-native";

const mockUser = {
  name: "Alejandro",
  email: "alejandro@email.com",
  avatar: null,
};

export default function ProfileScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarEmoji}>👤</Text>
        </View>
        <Text style={styles.name}>{mockUser.name}</Text>
        <Text style={styles.email}>{mockUser.email}</Text>
      </View>
      <TouchableOpacity style={styles.logoutButton}>
        <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#13131f", alignItems: "center", paddingTop: 50 },
  profileHeader: { alignItems: "center", marginBottom: 30 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#2a2a3e", justifyContent: "center", alignItems: "center", marginBottom: 10 },
  avatarEmoji: { fontSize: 48 },
  name: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  email: { fontSize: 16, color: "#666" },
  logoutButton: { backgroundColor: "#cba6f7", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  logoutButtonText: { color: "#13131f", fontWeight: "bold" },
});
