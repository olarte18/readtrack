import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, AppState } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useTheme } from "../contexts/ThemeContext";
import { updateBook, addReadingSession, getReadingSpeed } from "../services/api";

const QUICK_MINUTES = [10, 15, 20, 30, 45, 60];

export default function ActiveSessionScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { book, mode = "stopwatch" } = route.params;
  const isTimer = mode === "timer";

  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const [endPage, setEndPage] = useState(String(book.current_page ?? 0));
  const [duration, setDuration] = useState(null);
  const [timerStarted, setTimerStarted] = useState(false);
  const [minutesInput, setMinutesInput] = useState("15");
  const [avgSpeed, setAvgSpeed] = useState(null);
  const [timeUp, setTimeUp] = useState(false);

  const startPage = book.current_page ?? 0;
  const startTime = useRef(Date.now());
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef(null);
  const intervalRef = useRef(null);
  const alarmFiredRef = useRef(false);

  const alarm = useAudioPlayer(require("../../assets/alarm.wav"));

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useEffect(() => {
    getReadingSpeed(book.id).then((data) => {
      if (data.avg_pages_per_minute > 0) setAvgSpeed(data.avg_pages_per_minute);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appState.current === "active" && nextState.match(/inactive|background/)) {
        backgroundTime.current = Date.now();
      }
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        if (backgroundTime.current && running) {
          const elapsed = Math.floor((Date.now() - backgroundTime.current) / 1000);
          setSeconds((s) => (isTimer ? Math.max(0, s - elapsed) : s + elapsed));
        }
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [running, isTimer]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(
        () => setSeconds((s) => (isTimer ? (s > 0 ? s - 1 : 0) : s + 1)),
        1000
      );
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, isTimer]);

  useEffect(() => {
    if (!isTimer || !timerStarted || seconds > 0 || alarmFiredRef.current) return;
    alarmFiredRef.current = true;
    setRunning(false);
    alarm.loop = true;
    alarm.play();
    Alert.alert(
      "Tiempo cumplido",
      `¡Terminaste tu sesión de ${Math.round(duration / 60)} minutos!`,
      [
        {
          text: "Detener alarma",
          onPress: () => {
            alarm.pause();
            alarm.seekTo(0);
            setTimeUp(true);
          },
        },
      ]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, isTimer, timerStarted, duration]);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const stopAlarm = () => {
    alarm.pause();
    alarm.seekTo(0);
  };

  const startTimer = () => {
    const min = parseInt(minutesInput, 10);
    if (isNaN(min) || min <= 0 || min > 600) {
      return Alert.alert("Error", "Elige un tiempo válido entre 1 y 600 minutos");
    }
    alarmFiredRef.current = false;
    setDuration(min * 60);
    setSeconds(min * 60);
    setTimerStarted(true);
    setRunning(true);
  };

  const pagesRead = Math.max(0, parseInt(endPage || 0) - startPage);
  const minutesElapsed = (isTimer ? (duration ?? 0) - seconds : seconds) / 60;
  const currentSpeed = minutesElapsed > 0 && pagesRead > 0 ? pagesRead / minutesElapsed : 0;
  const effectiveSpeed = currentSpeed > 0 ? (avgSpeed ? (currentSpeed + avgSpeed) / 2 : currentSpeed) : (avgSpeed ?? 0);
  const pagesPerMinute = effectiveSpeed;
  const pagesLeft = book.pages ? Math.max(0, book.pages - parseInt(endPage || 0)) : null;
  const minutesLeft = pagesPerMinute > 0 && pagesLeft !== null ? pagesLeft / pagesPerMinute : null;

  const saveSession = async ({ page, pages }) => {
    setRunning(false);
    stopAlarm();
    const readSeconds = isTimer ? (duration ?? 0) - seconds : seconds;
    try {
      await updateBook(book.id, { current_page: page });
      await addReadingSession(book.id, page, readSeconds, pages);
      navigation.replace("SessionSummary", {
        book,
        pagesRead: pages,
        readSeconds,
        endPage: page,
        speed: pagesPerMinute,
      });
    } catch {
      Alert.alert("Error", "No se pudo guardar la sesión");
    }
  };

  const handleFinish = () => {
    const page = parseInt(endPage);
    if (isNaN(page) || page < startPage) {
      return Alert.alert("Error", "La página final debe ser mayor o igual a la inicial");
    }
    saveSession({ page, pages: Math.max(0, page - startPage) });
  };

  if (isTimer && !timerStarted) {
    return (
      <View style={styles.container}>
        <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.subtitle}>Elige cuánto quieres leer</Text>

        <View style={styles.chipsRow}>
          {QUICK_MINUTES.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.chip, minutesInput === String(m) && styles.chipActive]}
              onPress={() => setMinutesInput(String(m))}
            >
              <Text style={[styles.chipText, minutesInput === String(m) && styles.chipTextActive]}>
                {m} min
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.customRow}>
          <Text style={styles.customLabel}>Tiempo personalizado</Text>
          <View style={styles.customInputBox}>
            <TextInput
              style={styles.customInput}
              value={minutesInput}
              onChangeText={(t) => setMinutesInput(t.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              maxLength={3}
              placeholderTextColor={colors.placeholder}
            />
            <Text style={styles.customUnit}>min</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.finishBtn} onPress={startTimer}>
          <Text style={styles.finishBtnText}>Comenzar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (timeUp) {
    const readPages = Math.max(0, parseInt(endPage || 0) - startPage);
    return (
      <View style={styles.container}>
        <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>

        <View style={styles.completedBox}>
          <Ionicons name="checkmark-circle" size={52} color={colors.accent} />
          <Text style={styles.completedTitle}>¡Tiempo cumplido!</Text>
          <Text style={styles.completedSub}>
            Terminaste tu sesión de {Math.round(duration / 60)} minutos
          </Text>
        </View>

        <View style={styles.customRow}>
          <Text style={styles.customLabel}>¿En qué página quedaste?</Text>
          <View style={styles.customInputBox}>
            <TextInput
              style={styles.customInput}
              value={endPage}
              onChangeText={(t) => setEndPage(t.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              maxLength={4}
              placeholderTextColor={colors.placeholder}
            />
            <Text style={styles.customUnit}>págs</Text>
          </View>
          <Text style={styles.pagesEndHint}>
            Leíste {readPages} páginas
          </Text>
        </View>

        <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
          <Text style={styles.finishBtnText}>Guardar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>

      <View style={styles.timerContainer}>
        <Text style={styles.timerLabel}>{isTimer ? "Tiempo restante" : "Tiempo transcurrido"}</Text>
        <Text style={styles.timer}>{formatTime(seconds)}</Text>
        <TouchableOpacity style={styles.pauseBtn} onPress={() => setRunning((r) => !r)}>
          <View style={styles.pauseBtnRow}>
            <Ionicons name={running ? "pause" : "play"} size={18} color={colors.accent} />
            <Text style={styles.pauseBtnText}>{running ? "Pausar" : "Continuar"}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {avgSpeed && (
        <Text style={styles.avgSpeed}>
          Velocidad promedio: {avgSpeed.toFixed(1)} págs/min
        </Text>
      )}

      <View style={styles.pagesContainer}>
        <View style={styles.pageBox}>
          <Text style={styles.pageBoxLabel}>Página inicial</Text>
          <Text style={styles.pageBoxValue}>{startPage}</Text>
        </View>

        <View style={styles.pageBoxArrow}>
          <Ionicons name="arrow-forward" size={24} color={colors.textDim} />
        </View>
        <View style={styles.pageBox}>
          <Text style={styles.pageBoxLabel}>Página actual</Text>
          <TextInput
            style={styles.pageInput}
            value={endPage}
            onChangeText={setEndPage}
            keyboardType="numeric"
            placeholderTextColor={colors.placeholder}
          />
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{pagesRead}</Text>
          <Text style={styles.statLabel}>Páginas leídas</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {pagesPerMinute > 0 ? pagesPerMinute.toFixed(1) : "—"}
          </Text>
          <Text style={styles.statLabel}>Págs/min</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {minutesLeft !== null && minutesLeft > 0
              ? minutesLeft > 60
                ? `${(minutesLeft / 60).toFixed(1)}h`
                : `${Math.round(minutesLeft)}min`
              : "—"}
          </Text>
          <Text style={styles.statLabel}>Para terminar</Text>
        </View>
      </View>

      {book.pages && (
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>
            {parseInt(endPage || 0)} de {book.pages} páginas
          </Text>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, {
              width: `${Math.min((parseInt(endPage || 0) / book.pages) * 100, 100)}%`
            }]} />
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
        <Text style={styles.finishBtnText}>Finalizar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: 60, paddingHorizontal: 24 },
    bookTitle: { fontSize: 18, fontWeight: "bold", color: colors.text, textAlign: "center", marginBottom: 30 },
    subtitle: { fontSize: 15, color: colors.textDim, textAlign: "center", marginBottom: 24 },
    timerContainer: { alignItems: "center", marginBottom: 30 },
    timerLabel: { fontSize: 13, color: colors.textDim, marginBottom: 4 },
    timer: { fontSize: 64, fontWeight: "bold", color: colors.accent, fontVariant: ["tabular-nums"] },
    pauseBtn: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 40, paddingVertical: 19, marginTop: 20 },
    pauseBtnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    pauseBtnText: { color: colors.accent, fontSize: 20, fontWeight: "bold" },
    chipsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginBottom: 24 },
    chip: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.textDim, fontSize: 14, fontWeight: "bold" },
    chipTextActive: { color: colors.onAccent },
    customRow: { alignItems: "center", marginBottom: 32 },
    customLabel: { fontSize: 13, color: colors.textDim, marginBottom: 10 },
    customInputBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
    customInput: { fontSize: 24, fontWeight: "bold", color: colors.accent, textAlign: "center", minWidth: 60, paddingVertical: 10 },
    customUnit: { fontSize: 16, color: colors.textDim, marginLeft: 4 },
    backBtn: { marginTop: 12, alignItems: "center", paddingVertical: 12 },
    backBtnText: { color: colors.textDim, fontSize: 15, fontWeight: "bold" },
    pagesContainer: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 30, gap: 12 },
    pageBox: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, alignItems: "center", minWidth: 100 },
    pageBoxLabel: { color: colors.textDim, fontSize: 12, marginBottom: 8 },
    pageBoxValue: { color: colors.text, fontSize: 28, fontWeight: "bold" },
    pageInput: { color: colors.accent, fontSize: 28, fontWeight: "bold", textAlign: "center", minWidth: 80 },
    pageBoxArrow: { alignItems: "center" },
    statsContainer: { flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 24 },
    statItem: { alignItems: "center" },
    statValue: { fontSize: 22, fontWeight: "bold", color: colors.accent },
    statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
    progressSection: { marginBottom: 30 },
    progressLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 8, textAlign: "center" },
    progressContainer: { height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4, overflow: "hidden" },
    progressBar: { height: 8, backgroundColor: colors.accent, borderRadius: 4 },
    finishBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
    finishBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "bold" },
    avgSpeed: { color: colors.textDim, fontSize: 12, textAlign: "center", marginBottom: 16 },
    completedBox: { alignItems: "center", marginBottom: 32, marginTop: 24 },
    completedTitle: { fontSize: 22, fontWeight: "bold", color: colors.text, marginTop: 12 },
    completedSub: { fontSize: 14, color: colors.textDim, marginTop: 6 },
    pagesEndHint: { fontSize: 12, color: colors.textDim, marginTop: 10 },
  });
