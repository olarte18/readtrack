import { useState, useEffect, useCallback, useRef } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "../contexts/ThemeContext";

// Diálogo propio de la app con el tema de ReadTrack, centrado como el modal
// "¿En qué página quedaste?" de la sesión de lectura. Reemplaza a Alert.alert
// nativo en toda la app (misma firma: title, message, buttons).

let listener = null;
let current = null;

function setConfig(cfg) {
  current = cfg;
  if (listener) listener(cfg);
}

export const AppAlert = {
  alert(title, message, buttons) {
    setConfig({ title, message, buttons });
  },
};

export function AppAlertHost() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [, force] = useState(0);
  const configRef = useRef(null);

  useEffect(() => {
    listener = (cfg) => {
      configRef.current = cfg;
      force((n) => n + 1);
    };
    return () => {
      listener = null;
    };
  }, []);

  const dismiss = useCallback(() => {
    configRef.current = null;
    force((n) => n + 1);
  }, []);

  const buttons = configRef.current?.buttons;
  const effective =
    buttons && buttons.length > 0
      ? buttons
      : [{ text: "OK" }];
  const column = effective.length >= 3;

  const handlePress = (btn) => {
    const onPress = btn.onPress;
    dismiss();
    if (onPress) onPress();
  };

  return (
    <Modal
      visible={!!configRef.current}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{configRef.current?.title}</Text>
          {!!configRef.current?.message && (
            <Text style={styles.message}>{configRef.current.message}</Text>
          )}
          <View style={[styles.btnRow, column && styles.btnColumn]}>
            {effective.map((btn, i) => {
              const destructive = btn.style === "destructive";
              const cancel = btn.style === "cancel";
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.btn,
                    column && styles.btnFull,
                    destructive && styles.btnDanger,
                    cancel ? styles.btnCancel : styles.btnPrimary,
                  ]}
                  onPress={() => handlePress(btn)}
                >
                  <Text
                    style={[
                      styles.btnText,
                      destructive && styles.btnTextDanger,
                      cancel ? styles.btnTextCancel : styles.btnTextPrimary,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    },
    card: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingVertical: 28,
      paddingHorizontal: 24,
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.accent + "55",
    },
    title: { fontSize: 18, fontWeight: "bold", color: colors.text, marginBottom: 10, textAlign: "center" },
    message: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
    btnRow: { flexDirection: "row", gap: 12, marginTop: 22 },
    btnColumn: { flexDirection: "column", width: "100%" },
    btn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center" },
    btnFull: { width: "100%" },
    btnPrimary: { backgroundColor: colors.accent },
    btnCancel: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
    btnDanger: { backgroundColor: colors.danger },
    btnText: { fontSize: 15, fontWeight: "bold" },
    btnTextPrimary: { color: colors.onAccent },
    btnTextCancel: { color: colors.textDim },
    btnTextDanger: { color: "#ffffff" },
  });