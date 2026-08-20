import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { getGoals, saveGoal } from "../services/api";

const GOAL_TYPES = [
  { key: "annual", label: "Anual", description: "Libros al año", metrics: ["books"] },
  { key: "monthly", label: "Mensual", description: "Libros u horas al mes", metrics: ["books", "hours"] },
  { key: "weekly", label: "Semanal", description: "Horas a la semana", metrics: ["hours"] },
  { key: "daily", label: "Diaria", description: "Minutos al día", metrics: ["minutes"] },
];

const METRIC_LABELS = { books: "libros", hours: "horas", minutes: "minutos" };

export default function GoalsScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editMetric, setEditMetric] = useState("books");
  const [editValue, setEditValue] = useState("");

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const res = await getGoals();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGoals(); }, []);

  const getGoal = (type) => data?.goals?.find((g) => g.type === type);

  const getProgress = (type) => {
    if (!data) return 0;
    const goal = getGoal(type);
    if (!goal) return 0;
    if (type === "annual") return data.progress.annual;
   if (type === "monthly") return goal.metric === "books" ? data.progress.monthly_books : data.progress.monthly_hours;
if (type === "weekly") return data.progress.weekly;
    if (type === "daily") return data.progress.daily;
    return 0;
  };

  const handleSave = async (type) => {
    const v = parseInt(editValue);
    if (isNaN(v) || v <= 0) return Alert.alert("Error", "Ingresa un valor válido");
    try {
      await saveGoal(type, editMetric, v);
      await fetchGoals();
      setEditing(null);
    } catch {
      Alert.alert("Error", "No se pudo guardar la meta");
    }
  };

  const renderCalendar = () => {
    if (!data?.calendar?.length) return (
      <Text style={styles.calendarEmpty}>No hay sesiones registradas aún</Text>
    );

    const calendarMap = {};
data.calendar.forEach((d) => {
  const key = String(d.date).split("T")[0];
  calendarMap[key] = d;
});
    const days = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days.push({ key, data: calendarMap[key] ?? null });
    }

    return (
      <View style={styles.calendarGrid}>
        {days.map((d) => (
          <View
            key={d.key}
            style={[styles.calendarDay, d.data ? styles.calendarDayActive : null,
              d.data?.minutes > 30 ? styles.calendarDayHigh : null]}
          />
        ))}
      </View>
    );
  };

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Mis metas {data?.year}</Text>

      {GOAL_TYPES.map((type) => {
        const goal = getGoal(type.key);
        const progress = getProgress(type.key);
        const isEditing = editing === type.key;

        return (
          <View key={type.key} style={styles.goalCard}>
            <View style={styles.goalCardHeader}>
              <Text style={styles.goalCardTitle}>{type.label}</Text>
              <TouchableOpacity onPress={() => {
                setEditing(type.key);
                setEditMetric(goal?.metric ?? type.metrics[0]);
                setEditValue(String(goal?.value ?? ""));
              }}>
                <Text style={styles.editBtn}>{goal ? "Editar" : "Agregar"}</Text>
              </TouchableOpacity>
            </View>

            {goal ? (
              <>
                <Text style={styles.goalValue}>
                  {progress} / {goal.value} {METRIC_LABELS[goal.metric]}
                </Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, {
                    width: `${Math.min((progress / goal.value) * 100, 100)}%`
                  }]} />
                </View>
                <Text style={styles.goalPercent}>
                  {Math.round((progress / goal.value) * 100)}% completado
                </Text>
              </>
            ) : (
              <Text style={styles.noGoal}>{type.description} — sin meta configurada</Text>
            )}

            {isEditing && (
              <View style={styles.editContainer}>
                {type.metrics.length > 1 && (
                  <View style={styles.metricRow}>
                    {type.metrics.map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.metricBtn, editMetric === m && styles.metricBtnActive]}
                        onPress={() => setEditMetric(m)}
                      >
                        <Text style={[styles.metricBtnText, editMetric === m && styles.metricBtnTextActive]}>
                          {METRIC_LABELS[m]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder={`Meta en ${METRIC_LABELS[editMetric]}`}
                    placeholderTextColor={colors.placeholder}
                    keyboardType="numeric"
                    value={editValue}
                    onChangeText={setEditValue}
                  />
                  <TouchableOpacity style={styles.saveBtn} onPress={() => handleSave(type.key)}>
                    <Text style={styles.saveBtnText}>Guardar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditing(null)}>
                    <Ionicons name="close" size={20} color={colors.textDim} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.calendarCard}>
        <Text style={styles.calendarTitle}>Actividad — últimos 90 días</Text>
        <View style={styles.calendarLegendRow}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.calendarLow }]} />
          <Text style={styles.calendarLegendText}>Sin sesión</Text>
          <View style={[styles.legendSwatch, { backgroundColor: colors.calendarMid }]} />
          <Text style={styles.calendarLegendText}>Sesión</Text>
          <View style={[styles.legendSwatch, { backgroundColor: colors.calendarHigh }]} />
          <Text style={styles.calendarLegendText}>+30 min</Text>
        </View>
        {renderCalendar()}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", color: colors.text, padding: 20, paddingTop: 50 },
  goalCard: { backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, marginBottom: 12, padding: 16 },
  goalCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  goalCardTitle: { fontSize: 16, fontWeight: "bold", color: colors.text },
  editBtn: { color: colors.accent, fontSize: 13 },
  goalValue: { color: colors.textMuted, fontSize: 14, marginBottom: 8 },
  progressBar: { height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: 8, backgroundColor: colors.accent, borderRadius: 4 },
  goalPercent: { color: colors.textDim, fontSize: 12 },
  noGoal: { color: colors.textDim, fontSize: 13 },
  editContainer: { marginTop: 12 },
  metricRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  metricBtn: { backgroundColor: colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  metricBtnActive: { backgroundColor: colors.accent },
  metricBtnText: { color: colors.textMuted, fontSize: 13 },
  metricBtnTextActive: { color: colors.onAccent, fontWeight: "bold" },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, backgroundColor: colors.input, color: colors.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  saveBtnText: { color: colors.onAccent, fontWeight: "bold" },
  calendarCard: { backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, marginBottom: 12, padding: 16 },
  calendarTitle: { fontSize: 16, fontWeight: "bold", color: colors.text, marginBottom: 6 },
  calendarLegendRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  calendarLegendText: { fontSize: 11, color: colors.textDim, marginRight: 10 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
  calendarDay: { width: 10, height: 10, borderRadius: 2, backgroundColor: colors.calendarLow },
  calendarDayActive: { backgroundColor: colors.calendarMid },
  calendarDayHigh: { backgroundColor: colors.calendarHigh },
  calendarEmpty: { color: colors.textDim, fontSize: 13 },
});