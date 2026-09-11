import { useState, useEffect } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Switch, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../contexts/ThemeContext";
import {
  DEFAULT_CONFIG,
  getStreakReminderConfig,
  enableStreakReminder,
  disableStreakReminder,
  markStreakPromptSeen,
  requestNotificationPermission,
} from "../services/streakReminder";

const formatTime = (hour, minute) => {
  const lenient = new Date();
  lenient.setHours(hour, minute, 0, 0);
  return lenient.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// Modo "invite": invitación one-time tras una actualización (App).
// Modo "settings": apartado en Perfil, siempre disponible.
export default function StreakReminderModal({ visible, onClose, userId, mode = "invite", onActivated }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [step, setStep] = useState("ask");
  const [cfg, setCfg] = useState({ ...DEFAULT_CONFIG });
  const [hour, setHour] = useState(DEFAULT_CONFIG.hour);
  const [minute, setMinute] = useState(DEFAULT_CONFIG.minute);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (mode === "settings") {
      setStep("settings");
      getStreakReminderConfig(userId).then((c) => {
        setCfg(c);
        setHour(c.hour);
        setMinute(c.minute);
      });
    } else {
      setStep("ask");
    }
  }, [visible, mode, userId]);

  const applyEnable = async (h, m) => {
    const next = await enableStreakReminder(userId, { hour: h, minute: m });
    setCfg(next);
    setHour(h);
    setMinute(m);
    onActivated?.();
  };

  const handleActivate = async () => {
    const perm = await requestNotificationPermission();
    if (perm.granted) {
      setStep("time");
    } else {
      setStep("deviceSettings");
    }
  };

  const handleToggle = async (value) => {
    if (value) {
      const perm = await requestNotificationPermission();
      if (!perm.granted) {
        setStep("deviceSettings");
        return;
      }
      setCfg((prev) => ({ ...prev, enabled: true }));
      await enableStreakReminder(userId, { hour: cfg.hour, minute: cfg.minute });
      onActivated?.();
    } else {
      const next = await disableStreakReminder(userId);
      setCfg(next);
    }
  };

  const handleSaveTime = async () => {
    await applyEnable(hour, minute);
    if (mode === "invite") {
      await markStreakPromptSeen(userId);
      onClose();
    } else {
      setStep("settings");
      setShowTimePicker(false);
    }
  };

  const handleNoThanks = async () => {
    await markStreakPromptSeen(userId);
    onClose();
  };

  const openSystemSettings = async () => {
    if (mode === "invite") await markStreakPromptSeen(userId);
    try {
      Linking.openSettings();
    } catch {}
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={mode === "settings" ? undefined : onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          <View style={styles.handle} />

          {step === "ask" && (
            <>
              <View style={styles.iconWrap}>
                <Ionicons name="flame" size={34} color={colors.star} />
              </View>
              <Text style={styles.title}>¿Recibir recordatorios de tu racha?</Text>
              <Text style={styles.subtitle}>
                Cada día, si aún no has leído, te avisamos a la hora que elijas para que no pierdas tu racha.
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleNoThanks}>
                  <Text style={styles.secondaryText}>No, gracias</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleActivate}>
                  <Text style={styles.primaryText}>Activar</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === "time" && (
            <>
              <Text style={styles.title}>¿A qué hora avisarte?</Text>
              <Text style={styles.subtitle}>Si aún no hiciste sesión ese día, recibirás el recordatorio.</Text>
              {showTimePicker ? (
                <DateTimePicker
                  value={(() => { const d = new Date(); d.setHours(hour, minute, 0, 0); return d; })()}
                  mode="time"
                  display="spinner"
                  onChange={(e, date) => {
                    if (e.type === "set" && date) {
                      setHour(date.getHours());
                      setMinute(date.getMinutes());
                    }
                  }}
                />
              ) : (
                <TouchableOpacity style={styles.timeRow} onPress={() => setShowTimePicker(true)}>
                  <Ionicons name="time-outline" size={20} color={colors.accent} />
                  <Text style={styles.timeText}>{formatTime(hour, minute)}</Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textDim} />
                </TouchableOpacity>
              )}
              <View style={styles.btnRow}>
                {showTimePicker ? (
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveTime}>
                    <Text style={styles.primaryText}>Guardar</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveTime}>
                    <Text style={styles.primaryText}>Activar recordatorio</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {step === "deviceSettings" && (
            <>
              <View style={styles.iconWrap}>
                <Ionicons name="notifications-off-outline" size={34} color={colors.textDim} />
              </View>
              <Text style={styles.title}>Notificaciones apagadas</Text>
              <Text style={styles.subtitle}>
                Reactivalas en los ajustes del teléfono cuando quieras. Siempre podrás hacerlo desde tu Perfil.
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={mode === "invite" ? handleNoThanks : onClose}>
                  <Text style={styles.secondaryText}>Ahora no</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={openSystemSettings}>
                  <Text style={styles.primaryText}>Abrir ajustes</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === "settings" && (
            <>
              <Text style={styles.title}>Notificaciones de racha</Text>
              <View style={styles.switchRow}>
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                <Text style={styles.switchLabel}>Recordatorio diario</Text>
                <Switch
                  value={cfg.enabled}
                  onValueChange={handleToggle}
                  trackColor={{ true: colors.accent }}
                  thumbColor={cfg.enabled ? colors.onAccent : undefined}
                />
              </View>
              <Text style={styles.switchHint}>
                {cfg.enabled
                  ? `Cada día a las ${formatTime(cfg.hour, cfg.minute)} si aún no leíste.`
                  : "Te avisamos si aún no has leído. Puedes elegir la hora."}
              </Text>
              {cfg.enabled && (
                <TouchableOpacity style={styles.timeRow} onPress={() => { setHour(cfg.hour); setMinute(cfg.minute); setStep("time"); }}>
                  <Ionicons name="time-outline" size={20} color={colors.accent} />
                  <Text style={styles.timeText}>{formatTime(cfg.hour, cfg.minute)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                </TouchableOpacity>
              )}
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => { setStep("settings"); setShowTimePicker(false); onClose(); }}
                >
                  <Text style={styles.primaryText}>Listo</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 18,
      paddingBottom: 30,
      borderWidth: 1,
      borderColor: colors.star + "44",
      alignItems: "center",
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    title: { fontSize: 17, fontWeight: "bold", color: colors.text, textAlign: "center", marginBottom: 8 },
    subtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19, marginBottom: 18, paddingHorizontal: 8 },
    btnRow: { flexDirection: "row", gap: 10, marginTop: 14, width: "100%" },
    secondaryBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
      backgroundColor: colors.surfaceAlt,
    },
    secondaryText: { color: colors.textMuted, fontWeight: "bold", fontSize: 14 },
    primaryBtn: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
      backgroundColor: colors.accent,
    },
    primaryText: { color: colors.onAccent, fontWeight: "bold", fontSize: 14 },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
      marginTop: 6,
      width: "100%",
    },
    timeText: { flex: 1, fontSize: 16, fontWeight: "bold", color: colors.text },
    switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, alignSelf: "stretch" },
    switchLabel: { flex: 1, fontSize: 15, color: colors.text },
    switchHint: { fontSize: 12, color: colors.textDim, lineHeight: 17, alignSelf: "flex-start", marginTop: 8 },
  });