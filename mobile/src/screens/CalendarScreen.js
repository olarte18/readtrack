import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Modal, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { AppAlert } from "../components/AppAlert";
import { getCalendar, getReadingSessions, updateReadingSession } from "../services/api";
import { getPending } from "../services/offline";
import { calendarWithLocal } from "../utils/offlineCompute";
import { todayString } from "../utils/dates";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEK_DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const SECRET_MINUTES = 180;

export default function CalendarScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [editBook, setEditBook] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const t = todayString().split("-");
      setSelectedDate(year === Number(t[0]) && month === Number(t[1]) ? todayString() : null);
      getCalendar(year, month)
        .then(async (res) => { if (!cancelled) setData(res?.fromCache ? calendarWithLocal(res, await getPending()) : res); })
        .catch((e) => console.error(e))
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [year, month])
  );

  const refreshMonth = async () => {
    try {
      const res = await getCalendar(year, month);
      setData(res?.fromCache ? calendarWithLocal(res, await getPending()) : res);
    } catch (e) {
      console.error(e);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshMonth();
    } finally {
      setRefreshing(false);
    }
  };

  const openEdit = async (b) => {
    setEditBook(b);
    setSessions(null);
    setSessionsLoading(true);
    try {
      const list = await getReadingSessions(b.user_book_id, selectedDate);
      setSessions(list.map((s) => ({
        ...s,
        pageStr: String(s.page ?? 0),
        readStr: String(s.pages_read ?? 0),
        minutesStr: String(Math.round((s.duration_seconds ?? 0) / 60)),
      })));
    } catch {
      AppAlert.alert("Error", "No se pudieron cargar las sesiones");
      setEditBook(null);
    } finally {
      setSessionsLoading(false);
    }
  };

  const updateDraft = (id, field, value) =>
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value.replace(/[^0-9]/g, "") } : s)));

  const saveSession = async (s) => {
    const page = parseInt(s.pageStr, 10);
    const minutes = parseInt(s.minutesStr, 10);
    const pagesRead = parseInt(s.readStr, 10);
    if (isNaN(page) || page < 0) return AppAlert.alert("Error", "Página inválida");
    if (isNaN(minutes) || minutes < 0 || minutes > 1440) return AppAlert.alert("Error", "Minutos inválidos");
    if (isNaN(pagesRead) || pagesRead < 0) return AppAlert.alert("Error", "Páginas leídas inválidas");

    setSavingId(s.id);
    try {
      await updateReadingSession(s.id, {
        page,
        duration_seconds: minutes * 60,
        pages_read: pagesRead,
      });
      await refreshMonth();
      AppAlert.alert("Guardado", "Sesión actualizada");
      setEditBook(null);
    } catch {
      AppAlert.alert("Error", "No se pudo guardar la sesión");
    } finally {
      setSavingId(null);
    }
  };

  const goPrevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };

  const goNextMonth = () => {
    const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
    if (isCurrent) return;
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const todayStr = todayString();

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const dayMap = {};
  (data?.days ?? []).forEach((d) => { dayMap[d.date] = d; });
  const selectedDay = selectedDate ? dayMap[selectedDate] : null;
  // El fuego se enciende solo si HOY califica para la racha (todayCounts).
  // hasSessionToday queda como respaldo para clientes con el server viejo.
  const streakActiveToday = data?.todayCounts === true || data?.hasSessionToday === true;

  const infoFor = (day) =>
    dayMap[`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`];

  const dayStyleFor = (day) => {
    const info = infoFor(day);
    if (!info) return styles.dayCellIdle;
    // Por elección del usuario, un día con sesiones que NO califica para la
    // racha se ve como un día sin sesión (sigue consultable al tocarlo).
    if (info.counts === false) return styles.dayCellIdle;
    if (info.minutes >= SECRET_MINUTES) return styles.dayCellSecret;
    const dailyGoal = data?.daily_goal_minutes ?? 30;
    if (info.minutes >= dailyGoal) return styles.dayCellComplete;
    return styles.dayCellActive;
  };

  const hasSecret = (data?.days ?? []).some((d) => d.minutes >= SECRET_MINUTES);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calendario de lectura</Text>

      <View style={styles.streakCard}>
        <View style={styles.streakItem}>
          <Ionicons name="flame" size={28} color={streakActiveToday ? colors.accent : colors.textMuted} />
          <Text style={[styles.streakNumber, { color: streakActiveToday ? colors.text : colors.textMuted }]}>{data?.streak?.current ?? 0}</Text>
          <Text style={styles.streakLabel}>días de racha</Text>
        </View>
        <View style={styles.streakDivider} />
        <View style={styles.streakItem}>
          <Ionicons name="trophy" size={24} color={colors.star} />
          <Text style={styles.streakNumber}>{data?.streak?.best ?? 0}</Text>
          <Text style={styles.streakLabel}>mejor racha</Text>
        </View>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity style={styles.navBtn} onPress={goPrevMonth}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTH_NAMES[month - 1]} {year}</Text>
        <TouchableOpacity style={styles.navBtn} onPress={goNextMonth} disabled={isCurrentMonth}>
          <Ionicons
            name="chevron-forward"
            size={22}
            color={isCurrentMonth ? colors.textDim : colors.text}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />
          }
        >
          <View style={styles.calendarCard}>
            <View style={styles.weekRow}>
              {WEEK_DAYS.map((d, i) => (
                <Text key={`${d}-${i}`} style={styles.weekDayLabel}>{d}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((day, i) =>
                day === null ? (
                  <View key={`blank-${i}`} style={styles.blankCell} />
                ) : (
                  <TouchableOpacity key={day} style={styles.dayCellWrapper} accessibilityLabel={`Día ${day}`} onPress={() => setSelectedDate(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`)}>
                    <View
                      style={[
                        styles.dayCell,
                        dayStyleFor(day),
                        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` === todayStr && styles.dayCellToday,
                        selectedDate === `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` && styles.dayCellSelected,
                      ]}
                    >
                      {dayStyleFor(day) !== styles.dayCellComplete ? (
                        <Text
                          style={[
                            styles.dayText,
                            infoFor(day) && infoFor(day).counts !== false && styles.dayTextActive,
                          ]}
                        >
                          {day}
                        </Text>
                      ) : (
                        <Text style={styles.dayTextComplete}>{day}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                )
              )}
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.calendarLow }]} />
              <Text style={styles.legendText}>Sin sesión</Text>
              <View style={[styles.legendSwatch, { backgroundColor: colors.calendarMid }]} />
              <Text style={styles.legendText}>Sesión</Text>
              <View style={[styles.legendSwatch, { backgroundColor: colors.calendarComplete }]} />
              <Text style={styles.legendText}>Meta cumplida</Text>
            </View>
            {hasSecret && (
              <View style={styles.secretLegend}>
                <View style={[styles.legendSwatch, { backgroundColor: colors.calendarSecret }]} />
                <Text style={styles.legendText}>Días con 3+ horas</Text>
              </View>
            )}
          </View>

          {selectedDate && (
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>
                {selectedDay ? `¿Qué leíste el ${selectedDate.split("-").reverse().join("/")}?` : `El ${selectedDate.split("-").reverse().join("/")} no registraste sesiones`}
              </Text>
              {selectedDay ? (
                <>
                  <Text style={styles.detailSummary}>
                    {selectedDay.minutes} min · {selectedDay.pages} páginas
                  </Text>
                  {selectedDay.books.map((b, i) => (
                    <TouchableOpacity
                      key={`${b.user_book_id}-${i}`}
                      style={styles.bookRow}
                      onPress={() => openEdit(b)}
                    >
                      {b.cover ? (
                        <Image source={{ uri: b.cover }} style={styles.bookCover} />
                      ) : (
                        <View style={[styles.bookCover, styles.noCover]}>
                          <Ionicons name="book" size={18} color={colors.textDim} />
                        </View>
                      )}
                      <View style={styles.bookInfo}>
                        <Text style={styles.bookTitle} numberOfLines={2}>{b.title}</Text>
                        {!!b.author && <Text style={styles.bookAuthor} numberOfLines={1}>{b.author}</Text>}
                        <Text style={styles.bookMeta}>{b.minutes} min · {b.pages} páginas</Text>
                      </View>
                      <Ionicons name="pencil" size={16} color={colors.textDim} />
                    </TouchableOpacity>
                  ))}
                  <Text style={styles.editHint}>Toca un libro para corregir sus sesiones</Text>
                </>
              ) : (
                <Text style={styles.detailEmpty}>Toca otro día para ver tu historial</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={!!editBook} transparent animationType="fade" onRequestClose={() => setEditBook(null)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} numberOfLines={2}>{editBook?.title}</Text>
            <Text style={styles.modalSubtitle}>Sesiones del {selectedDate?.split("-").reverse().join("/")}</Text>
            {sessionsLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={styles.sessionsList} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                {(sessions ?? []).map((s) => (
                  <View key={s.id} style={styles.sessionCard}>
                    <View style={styles.sessionHeader}>
                      <Ionicons name="time" size={14} color={colors.textDim} />
                      <Text style={styles.sessionTime}>{s.time_bogota}</Text>
                      {!s.pages_read ? <Text style={styles.sessionWarning}>sin páginas</Text> : null}
                    </View>
                    <View style={styles.sessionFieldsRow}>
                      <View style={styles.sessionField}>
                        <Text style={styles.sessionFieldLabel}>Página</Text>
                        <TextInput
                          style={styles.sessionInput}
                          value={s.pageStr}
                          onChangeText={(t) => updateDraft(s.id, "pageStr", t)}
                          keyboardType="numeric"
                          maxLength={4}
                          selectTextOnFocus
                        />
                      </View>
                      <View style={styles.sessionField}>
                        <Text style={styles.sessionFieldLabel}>Págs leídas</Text>
                        <TextInput
                          style={styles.sessionInput}
                          value={s.readStr}
                          onChangeText={(t) => updateDraft(s.id, "readStr", t)}
                          keyboardType="numeric"
                          maxLength={4}
                          selectTextOnFocus
                        />
                      </View>
                      <View style={styles.sessionField}>
                        <Text style={styles.sessionFieldLabel}>Minutos</Text>
                        <TextInput
                          style={styles.sessionInput}
                          value={s.minutesStr}
                          onChangeText={(t) => updateDraft(s.id, "minutesStr", t)}
                          keyboardType="numeric"
                          maxLength={4}
                          selectTextOnFocus
                        />
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.sessionSaveBtn, savingId === s.id && styles.sessionSaveBtnDisabled]}
                      onPress={() => saveSession(s)}
                      disabled={savingId !== null}
                    >
                      {savingId === s.id ? (
                        <ActivityIndicator color={colors.onAccent} size="small" />
                      ) : (
                        <Text style={styles.sessionSaveBtnText}>Guardar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setEditBook(null)}>
              <Text style={styles.modalCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: "bold", color: colors.text, paddingTop: 50, paddingBottom: 20, paddingHorizontal: 4 },
  streakCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    marginBottom: 12,
    padding: 16,
    alignItems: "center",
  },
  streakItem: { flex: 1, alignItems: "center", gap: 4 },
  streakDivider: { width: 1, height: 40, backgroundColor: colors.border },
  streakNumber: { fontSize: 26, fontWeight: "bold", color: colors.text },
  streakLabel: { fontSize: 12, color: colors.textMuted },
  monthNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    marginBottom: 12,
  },
  navBtn: { backgroundColor: colors.surface, borderRadius: 10, padding: 8 },
  monthLabel: { fontSize: 17, fontWeight: "bold", color: colors.text },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    padding: 14,
  },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekDayLabel: { width: "14.2857%", textAlign: "center", fontSize: 12, fontWeight: "bold", color: colors.textMuted },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  blankCell: { width: "14.2857%" },
  dayCellWrapper: { width: "14.2857%", aspectRatio: 1, padding: 2 },
  dayCell: {
    flex: 1,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.calendarLow,
  },
  dayCellIdle: { backgroundColor: colors.calendarLow },
  dayCellActive: { backgroundColor: colors.calendarMid },
  dayCellComplete: { backgroundColor: colors.calendarComplete },
  dayCellSecret: { backgroundColor: colors.calendarSecret },
  dayCellToday: { borderWidth: 2, borderColor: colors.star },
  dayCellSelected: { borderWidth: 2, borderColor: colors.text },
  dayText: { fontSize: 13, color: colors.textDim },
  dayTextActive: { color: "#fff", fontWeight: "bold" },
  dayTextComplete: { color: "#fff", fontWeight: "bold" },
  legendRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, rowGap: 6, marginTop: 12 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, color: colors.textDim, marginRight: 10 },
  secretLegend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    marginTop: 12,
    padding: 16,
  },
  detailTitle: { fontSize: 15, fontWeight: "bold", color: colors.text, marginBottom: 6 },
  detailSummary: { fontSize: 13, color: colors.accent, marginBottom: 10 },
  detailEmpty: { fontSize: 13, color: colors.textDim },
  bookRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 10 },
  bookCover: { width: 42, height: 62, borderRadius: 6 },
  noCover: { backgroundColor: colors.surfaceAlt, justifyContent: "center", alignItems: "center" },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 14, fontWeight: "bold", color: colors.text },
  bookAuthor: { fontSize: 12, color: colors.textMuted },
  bookMeta: { fontSize: 11, color: colors.accent, marginTop: 2 },
  editHint: { fontSize: 11, color: colors.textMuted, marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 30,
    maxHeight: "85%",
  },
  modalTitle: { fontSize: 17, fontWeight: "bold", color: colors.text, textAlign: "center" },
  modalSubtitle: { fontSize: 12, color: colors.textDim, textAlign: "center", marginTop: 4, marginBottom: 14 },
  sessionsList: { flexGrow: 0 },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  sessionTime: { fontSize: 13, color: colors.textDim, fontWeight: "bold" },
  sessionWarning: { fontSize: 11, color: colors.star, marginLeft: "auto" },
  sessionFieldsRow: { flexDirection: "row", gap: 8 },
  sessionField: { flex: 1 },
  sessionFieldLabel: { fontSize: 11, color: colors.textDim, marginBottom: 4 },
  sessionInput: {
    backgroundColor: colors.input,
    color: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: "bold",
    textAlign: "center",
  },
  sessionSaveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 12,
  },
  sessionSaveBtnDisabled: { opacity: 0.6 },
  sessionSaveBtnText: { color: colors.onAccent, fontWeight: "bold", fontSize: 14 },
  modalCloseBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 32, marginTop: 4 },
  modalCloseBtnText: { color: colors.textDim, fontWeight: "bold", fontSize: 15 },
});
