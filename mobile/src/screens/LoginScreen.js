import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("Error", "Completa todos los campos");
    setLoading(true);
    try {
      await login(email, password);
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/images/logo.png")} style={styles.logo} />
      <Text style={styles.title}>ReadTrack</Text>
      <Text style={styles.subtitle}>Inicia sesión</Text>
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.placeholder} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Contraseña" placeholderTextColor={colors.placeholder} value={password} onChangeText={setPassword} secureTextEntry />
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : (
        <TouchableOpacity style={styles.btn} onPress={handleLogin}>
          <Text style={styles.btnText}>Entrar</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={styles.link}>¿No tienes cuenta? Regístrate</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", paddingHorizontal: 24 },
    logo: { width: 110, height: 110, borderRadius: 25, alignSelf: "center", marginBottom: 16 },
    title: { fontSize: 36, fontWeight: "bold", color: colors.accent, textAlign: "center", marginBottom: 8 },
    subtitle: { fontSize: 18, color: colors.textMuted, textAlign: "center", marginBottom: 32 },
    input: { backgroundColor: colors.input, color: colors.text, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
    btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8 },
    btnText: { color: colors.onAccent, fontWeight: "bold", fontSize: 16 },
    link: { color: colors.accent, textAlign: "center", marginTop: 20, fontSize: 14 },
  });