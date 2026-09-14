import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { AppAlert } from "../components/AppAlert";
import { requestPasswordReset, verifyResetCode, resetPassword } from "../services/api";

export default function ForgotPasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSendCode = async () => {
    if (!email) return AppAlert.alert("Error", "Ingresa tu email");
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setStep("code");
    } catch (error) {
      AppAlert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) return AppAlert.alert("Error", "Ingresa el código de 6 dígitos");
    setLoading(true);
    try {
      await verifyResetCode(email, code);
      setStep("password");
    } catch (error) {
      AppAlert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (password.length < 6) return AppAlert.alert("Error", "La contraseña debe tener al menos 6 caracteres");
    if (password !== confirm) return AppAlert.alert("Error", "Las contraseñas no coinciden");
    setLoading(true);
    try {
      await resetPassword(email, code, password);
      AppAlert.alert(
        "Listo",
        "Tu contraseña se actualizó. Inicia sesión con la nueva.",
        [{ text: "OK", onPress: () => navigation.navigate("Login") }]
      );
    } catch (error) {
      AppAlert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const goBack = (target, resetValues) => {
    setStep(target);
    if (resetValues) {
      setCode("");
      setPassword("");
      setConfirm("");
    }
  };

  const subtitle =
    step === "email"
      ? "Ingresa tu email y te enviamos un código"
      : step === "code"
      ? "Te enviamos un código de 6 dígitos"
      : "Elige tu nueva contraseña";

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/images/logo.png")} style={styles.logo} />
      <Text style={styles.title}>ReadTrack</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {step === "email" && (
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
      )}

      {step === "code" && (
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
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
          ) : (
            <TouchableOpacity style={styles.btn} onPress={handleVerifyCode}>
              <Text style={styles.btnText}>Continuar</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => goBack("email", true)}>
            <Text style={styles.link}>Cambiar email</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSendCode}>
            <Text style={styles.link}>Reenviar código</Text>
          </TouchableOpacity>
        </>
      )}

      {step === "password" && (
        <>
          <View style={styles.passwordInputBox}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Nueva contraseña"
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
            <TouchableOpacity style={styles.btn} onPress={handleReset}>
              <Text style={styles.btnText}>Cambiar contraseña</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => goBack("code")}>
            <Text style={styles.link}>Volver al código</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={[styles.link, { marginTop: 20 }]}>← Volver al inicio de sesión</Text>
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
    passwordInputBox: { position: "relative" },
    passwordInput: { paddingRight: 46 },
    eyeBtn: { position: "absolute", right: 12, top: 12, padding: 4 },
    btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8 },
    btnText: { color: colors.onAccent, fontWeight: "bold", fontSize: 16 },
    link: { color: colors.accent, textAlign: "center", marginTop: 12, fontSize: 14 },
  });