import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, AppState } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { updateBook, addReadingSession, getReadingSpeed } from "../services/api";

export default function ActiveSessionScreen({ route, navigation }) {
  const { book } = route.params;
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const [endPage, setEndPage] = useState(String(book.current_page ?? 0));
  const startPage = book.current_page ?? 0;
  const startTime = useRef(Date.now());
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef(null);
  const intervalRef = useRef(null);
const [avgSpeed, setAvgSpeed] = useState(null);

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
          setSeconds((s) => s + elapsed);
        }
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [running]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const pagesRead = Math.max(0, parseInt(endPage || 0) - startPage);
  const minutesElapsed = seconds / 60;
const currentSpeed = minutesElapsed > 0 && pagesRead > 0 ? pagesRead / minutesElapsed : 0;
const effectiveSpeed = currentSpeed > 0 ? (avgSpeed ? (currentSpeed + avgSpeed) / 2 : currentSpeed) : (avgSpeed ?? 0);
const pagesPerMinute = effectiveSpeed;  const pagesLeft = book.pages ? Math.max(0, book.pages - parseInt(endPage || 0)) : null;
  const minutesLeft = pagesPerMinute > 0 && pagesLeft !== null ? pagesLeft / pagesPerMinute : null;

const handleFinish = async () => {
  const page = parseInt(endPage);
  if (isNaN(page) || page < startPage) {
    return Alert.alert("Error", "La página final debe ser mayor o igual a la inicial");
  }
  setRunning(false);
  try {
    await updateBook(book.id, { current_page: page });
    await addReadingSession(book.id, page, seconds, pagesRead);
    Alert.alert(
      "Sesión guardada",
      `Leíste ${pagesRead} páginas en ${formatTime(seconds)}`,
      [{ text: "OK", onPress: () => navigation.goBack() }]
    );
  } catch {
    Alert.alert("Error", "No se pudo guardar la sesión");
  }
};

  return (
    <View style={styles.container}>
      <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>

      <View style={styles.timerContainer}>
        <Text style={styles.timer}>{formatTime(seconds)}</Text>
        <TouchableOpacity style={styles.pauseBtn} onPress={() => setRunning((r) => !r)}>
          <View style={styles.pauseBtnRow}>
            <Ionicons name={running ? "pause" : "play"} size={18} color="#cba6f7" />
            <Text style={styles.pauseBtnText}>{running ? "Pausar" : "Continuar"}</Text>
          </View>
        </TouchableOpacity>
      </View>
        {avgSpeed && (
  <Text style={styles.avgSpeed}>
    Velocidad promedio : {avgSpeed.toFixed(1)} págs/min
  </Text>
)}
      <View style={styles.pagesContainer}>
        <View style={styles.pageBox}>
          <Text style={styles.pageBoxLabel}>Página inicial</Text>
          <Text style={styles.pageBoxValue}>{startPage}</Text>
        </View>

        <View style={styles.pageBoxArrow}>
          <Ionicons name="arrow-forward" size={24} color="#666" />
        </View>
        <View style={styles.pageBox}>
          <Text style={styles.pageBoxLabel}>Página actual</Text>
          <TextInput
            style={styles.pageInput}
            value={endPage}
            onChangeText={setEndPage}
            keyboardType="numeric"
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#13131f", paddingTop: 60, paddingHorizontal: 24 },
  bookTitle: { fontSize: 18, fontWeight: "bold", color: "#fff", textAlign: "center", marginBottom: 30 },
  timerContainer: { alignItems: "center", marginBottom: 30 },
  timer: { fontSize: 64, fontWeight: "bold", color: "#cba6f7", fontVariant: ["tabular-nums"] },
  pauseBtn: { backgroundColor: "#1e1e2e", borderRadius: 12, paddingHorizontal: 40, paddingVertical: 19, marginTop: 20 },
  pauseBtnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pauseBtnText: { color: "#cba6f7", fontSize: 20, fontWeight: "bold" },
  pagesContainer: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 30, gap: 12 },
  pageBox: { backgroundColor: "#1e1e2e", borderRadius: 12, padding: 16, alignItems: "center", minWidth: 100 },
  pageBoxLabel: { color: "#666", fontSize: 12, marginBottom: 8 },
  pageBoxValue: { color: "#fff", fontSize: 28, fontWeight: "bold" },
  pageInput: { color: "#cba6f7", fontSize: 28, fontWeight: "bold", textAlign: "center", minWidth: 80 },
  pageBoxArrow: { alignItems: "center" },
  statsContainer: { flexDirection: "row", justifyContent: "space-around", backgroundColor: "#1e1e2e", borderRadius: 12, padding: 16, marginBottom: 24 },
  statItem: { alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "bold", color: "#cba6f7" },
  statLabel: { fontSize: 11, color: "#aaa", marginTop: 4 },
  progressSection: { marginBottom: 30 },
  progressLabel: { color: "#aaa", fontSize: 13, marginBottom: 8, textAlign: "center" },
  progressContainer: { height: 8, backgroundColor: "#2a2a3e", borderRadius: 4, overflow: "hidden" },
  progressBar: { height: 8, backgroundColor: "#cba6f7", borderRadius: 4 },
  finishBtn: { backgroundColor: "#cba6f7", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  finishBtnText: { color: "#13131f", fontSize: 16, fontWeight: "bold" },
avgSpeed: { color: "#666", fontSize: 12, textAlign: "center", marginBottom: 16 },
});
