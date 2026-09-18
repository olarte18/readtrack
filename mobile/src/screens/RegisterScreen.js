import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, KeyboardAvoidingView, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { AppAlert } from "../components/AppAlert";
import { requestRegistrationCode } from "../services/api";

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSendCode = async () => {
    if (!email) return AppAlert.alert("Error", "Ingresa tu email");
    setLoading(true);
    try {
      await requestRegistrationCode(email);
      setEmailSent(true);
      setCode("");
      setPassword("");
      setConfirm("");
    } catch (error) {
      AppAlert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (code.length !== 6) return AppAlert.alert("Error", "Ingresa el código de 6 dígitos que llegó a tu email");
    if (!username) return AppAlert.alert("Error", "Ingresa tu nombre de usuario");
    if (password.length < 6) return AppAlert.alert("Error", "La contraseña debe tener al menos 6 caracteres");
    if (password !== confirm) return AppAlert.alert("Error", "Las contraseñas no coinciden");
    setLoading(true);
    try {
      await register(username, email, password, code);
    } catch (error) {
      AppAlert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const subtitle = emailSent
    ? "Ingresa el código que enviamos a tu email y completa tus datos"
    : "Ingresa tu email y te enviamos un código de verificación";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <Image source={require("../../assets/images/logo.png")} style={styles.logo} />
      <Text style={styles.title}>ReadTrack</Text>
      <Text style={styles.subtitle}>Crear cuenta</Text>
      <Text style={styles.subtitleStep}>{subtitle}</Text>

      {!emailSent ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.placeholder}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
          ) : (
            <TouchableOpacity style={styles.btn} onPress={handleSendCode}>
              <Text style={styles.btnText}>Enviar código</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Código (6 dígitos)"
            placeholderTextColor={colors.placeholder}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TextInput
            style={styles.input}
            placeholder="Usuario"
            placeholderTextColor={colors.placeholder}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <View style={styles.passwordInputBox}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Contraseña"
              placeholderTextColor={colors.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass((s) => !s)}>
              <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textDim} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Confirmar contraseña"
            placeholderTextColor={colors.placeholder}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showPass}
          />
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
          ) : (
            <TouchableOpacity style={styles.btn} onPress={handleRegister}>
              <Text style={styles.btnText}>Crear cuenta</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setEmailSent(false)}>
            <Text style={styles.link}>Cambiar email</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSendCode}>
            <Text style={styles.link}>Reenviar código</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={[styles.link, { marginTop: 20 }]}>¿Ya tienes cuenta? Inicia sesión</Text>
      </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flexGrow: 1, backgroundColor: colors.background, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },
    logo: { width: 110, height: 110, borderRadius: 25, alignSelf: "center", marginBottom: 16 },
    title: { fontSize: 36, fontWeight: "bold", color: colors.accent, textAlign: "center", marginBottom: 8 },
    subtitle: { fontSize: 18, color: colors.textMuted, textAlign: "center", marginBottom: 4 },
    subtitleStep: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginBottom: 24 },
    input: { backgroundColor: colors.input, color: colors.text, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
    passwordInputBox: { position: "relative" },
    passwordInput: { paddingRight: 46 },
    eyeBtn: { position: "absolute", right: 12, top: 12, padding: 4 },
    btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8 },
    btnText: { color: colors.onAccent, fontWeight: "bold", fontSize: 16 },
    link: { color: colors.accent, textAlign: "center", marginTop: 12, fontSize: 14 },
  });