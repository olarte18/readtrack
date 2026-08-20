import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { saveGoal } from "../services/api";

const UNITS = { books: "libros", hours: "horas", minutes: "minutos" };

const GOAL_TYPES = [
  { key: "annual", label: "Meta anual", metric: "books", presets: [12, 24, 36, 52] },
  { key: "monthly", label: "Meta mensual", metric: "books", metrics: ["books", "hours"], presetsByMetric: { books: [1, 2, 3, 5], hours: [5, 10, 15, 20] } },
  { key: "weekly", label: "Lectura semanal", metric: "hours", presets: [3, 5, 10] },
  { key: "daily", label: "Lectura diaria", metric: "minutes", presets: [15, 30, 45, 60] },
];

export default function GoalSetupScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { finishSetup } = useAuth();

  const [saved, setSaved] = useState({});
  const [values, setValues] = useState({});
  const [busyType, setBusyType] = useState(null);
  const [metricByType, setMetricByType] = useState({ monthly: "books" });
  const [customs, setCustoms] = useState({});

  const selectGoal = async (type, metric, value) => {
    if (!value || value <= 0) return Alert.alert("Error", "Ingresa un valor válido");
    setBusyType(type);
    try {
      await saveGoal(type, metric, value);
      setValues((v) => ({ ...v, [type]: { metric, value } }));
      setSaved((s) => ({ ...s, [type]: true }));
    } catch {
      Alert.alert("Error", "No se pudo guardar la meta");
    } finally {
      setBusyType(null);
    }
  };

  const presetsOf = (goal) => {
    if (goal.presetsByMetric) return goal.presetsByMetric[metricByType[goal.key] ?? goal.metric] ?? [];
    return goal.presets;
  };

  const metricOf = (goal) => (goal.metrics ? metricByType[goal.key] ?? goal.metric : goal.metric);

  const anySaved = Object.keys(saved).length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Ionicons name="trophy" size={48} color={colors.accent} />
        <Text style={styles.title}>¡Bienvenido!</Text>
        <Text style={styles.subtitle}>
          Configura tus metas de lectura para empezar. Puedes cambiarlas cuando quieras.
        </Text>
      </View>

      {GOAL_TYPES.map((goal) => {
        const isSaved = !!saved[goal.key];
        const metric = metricOf(goal);
        const presets = presetsOf(goal);
        const savedData = saved[goal.key] ? values[goal.key] : null;

        return (
          <View key={goal.key} style={styles.goalCard}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalLabel}>{goal.label}</Text>
              {isSaved && (
                <View style={styles.savedBadge}>
                  <Ionicons name="checkmark" size={14} color={colors.onAccent} />
                  <Text style={styles.savedText}>Guardada</Text>
                </View>
              )}
            </View>

            {goal.metrics && (
              <View style={styles.metricRow}>
                {goal.metrics.map((m) => {
                  const active = metric === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.metricBtn, active && styles.metricBtnActive]}
                      onPress={() => {
                        setMetricByType((prev) => ({ ...prev, [goal.key]: m }));
                        setSaved((s) => ({ ...s, [goal.key]: false }));
                      }}
                    >
                      <Text style={[styles.metricBtnText, active && styles.metricBtnTextActive]}>
                        {UNITS[m]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {!goal.metrics && <Text style={styles.goalHint}>en {UNITS[metric]}</Text>}

            {isSaved ? (
              <View style={styles.savedRow}>
                <Text style={styles.savedValue}>
                  Meta: {savedData.value} {UNITS[savedData.metric]}
                </Text>
                <TouchableOpacity onPress={() => setSaved((s) => ({ ...s, [goal.key]: false }))}>
                  <Text style={styles.changeBtn}>Cambiar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.goalHint}>Sugerencias</Text>
                <View style={styles.chipsRow}>
                  {presets.map((p) => {
                    const active = values[goal.key]?.value === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => selectGoal(goal.key, metric, p)}
                        disabled={busyType !== null}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{p}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.customRow}>
                  <TextInput
                    style={styles.customInput}
                    placeholder={`Tu propia meta en ${UNITS[metric]}`}
                    placeholderTextColor={colors.placeholder}
                    keyboardType="numeric"
                    value={customs[goal.key] ?? ""}
                    onChangeText={(t) => setCustoms((c) => ({ ...c, [goal.key]: t.replace(/[^0-9]/g, "") }))}
                  />
                  <TouchableOpacity
                    style={styles.customSaveBtn}
                    onPress={() => selectGoal(goal.key, metric, parseInt(customs[goal.key], 10))}
                    disabled={busyType !== null}
                  >
                    {busyType === goal.key ? (
                      <ActivityIndicator color={colors.onAccent} size="small" />
                    ) : (
                      <Ionicons name="checkmark" size={18} color={colors.onAccent} />
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.continueBtn, !anySaved && styles.continueBtnDisabled]}
        disabled={!anySaved}
        onPress={finishSetup}
      >
        <Text style={styles.continueBtnText}>Continuar</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.laterBtn} onPress={finishSetup}>
        <Text style={styles.laterBtnText}>Más tarde</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flexGrow: 1, backgroundColor: colors.background, paddingTop: 70, paddingHorizontal: 24, paddingBottom: 40 },
    header: { alignItems: "center", marginBottom: 28 },
    title: { fontSize: 26, fontWeight: "bold", color: colors.text, marginTop: 12 },
    subtitle: { fontSize: 14, color: colors.textDim, textAlign: "center", marginTop: 8, lineHeight: 20 },
    goalCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    goalLabel: { fontSize: 16, fontWeight: "bold", color: colors.text },
    savedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    savedText: { color: colors.onAccent, fontSize: 11, fontWeight: "bold" },
    metricRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    metricBtn: { backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
    metricBtnActive: { backgroundColor: colors.accent },
    metricBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: "bold" },
    metricBtnTextActive: { color: colors.onAccent },
    goalHint: { fontSize: 12, color: colors.textDim, marginBottom: 10 },
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { fontSize: 15, fontWeight: "bold", color: colors.textMuted },
    chipTextActive: { color: colors.onAccent },
    customRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
    customInput: { flex: 1, backgroundColor: colors.input, color: colors.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
    customSaveBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
    savedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    savedValue: { fontSize: 14, color: colors.textMuted },
    changeBtn: { color: colors.accent, fontSize: 13, fontWeight: "bold" },
    continueBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
    continueBtnDisabled: { opacity: 0.4 },
    continueBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "bold" },
    laterBtn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
    laterBtnText: { color: colors.textDim, fontSize: 15, fontWeight: "bold" },
  });