import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useAuth } from "../contexts/AuthContext";

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!username || !email || !password) return Alert.alert("Error", "Completa todos los campos");
    setLoading(true);
    try {
      await register(username, email, password);
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ReadTrack</Text>
      <Text style={styles.subtitle}>Crear cuenta</Text>
      <TextInput style={styles.input} placeholder="Usuario" placeholderTextColor="#666" value={username} onChangeText={setUsername} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#666" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Contraseña" placeholderTextColor="#666" value={password} onChangeText={setPassword} secureTextEntry />
      {loading ? (
        <ActivityIndicator color="#cba6f7" style={{ marginTop: 20 }} />
      ) : (
        <TouchableOpacity style={styles.btn} onPress={handleRegister}>
          <Text style={styles.btnText}>Registrarse</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.link}>¿Ya tienes cuenta? Inicia sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#13131f", justifyContent: "center", paddingHorizontal: 24 },
  title: { fontSize: 36, fontWeight: "bold", color: "#cba6f7", textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 18, color: "#aaa", textAlign: "center", marginBottom: 32 },
  input: { backgroundColor: "#1e1e2e", color: "#fff", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  btn: { backgroundColor: "#cba6f7", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: "#13131f", fontWeight: "bold", fontSize: 16 },
  link: { color: "#cba6f7", textAlign: "center", marginTop: 20, fontSize: 14 },
});
