import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, AppState, ActivityIndicator, Modal, Switch, NativeModules, Platform, Image, ImageBackground } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { usePreventRemove } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { AppAlert } from "../components/AppAlert";
import { updateBook, addReadingSession, getReadingSpeed } from "../services/api";
import { cancelAlarm, ensureChannel, markAlarmHintSeen, openAlarmSettings, openFullScreenIntentSettings, requestAlarmPermission, scheduleAlarm, shouldShowAlarmHint } from "../services/notifications";

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
  const [saving, setSaving] = useState(false);
  const [finishVisible, setFinishVisible] = useState(false);
  const [keepAwake, setKeepAwakeState] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const savingRef = useRef(false);

  const AlarmNative = Platform.OS === "android" ? NativeModules.ReadTrackAlarm : null;

  const startPage = book.current_page ?? 0;
  const startTime = useRef(Date.now());
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef(null);
  const intervalRef = useRef(null);
  const alarmFiredRef = useRef(false);
  const alarmIdRef = useRef(null);
  const permissionWarnedRef = useRef(false);
  const alarmHintRef = useRef(false);

  const alarm = useAudioPlayer(require("../../assets/alarm.wav"));

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useEffect(() => {
    return () => {
      if (alarmIdRef.current !== null) cancelAlarm(alarmIdRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        AlarmNative?.setKeepAwake?.(false);
      } catch {}
    };
  }, [AlarmNative]);

  useEffect(() => {
    getReadingSpeed(book.id).then((data) => {
      if (data.avg_pages_per_hour > 0) setAvgSpeed(data.avg_pages_per_hour);
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
        if (isTimer && alarmFiredRef.current) setTimeUp(true);
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
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isTimer || !timerStarted || seconds > 0 || alarmFiredRef.current) return;
    alarmFiredRef.current = true;
    setRunning(false);
    if (appState.current !== "active") return;
    alarm.loop = true;
    alarm.play();
    AppAlert.alert(
      "Tiempo cumplido",
      `¡Terminaste tu sesión de ${Math.round(duration / 60)} minutos!`,
      [
        {
          text: "Detener alarma",
          onPress: () => {
            alarm.pause();
            alarm.seekTo(0);
            cancelTimerAlarm();
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

  const scheduleTimerAlarm = async (msFromNow) => {
    await ensureChannel();
    const id = await scheduleAlarm(msFromNow, {
      title: "Tiempo cumplido",
      body: `¡Terminaste tu sesión de ${Math.max(1, Math.round(msFromNow / 60000))} minutos!`,
    });
    if (id !== null) alarmIdRef.current = id;
  };

  const cancelTimerAlarm = async () => {
    if (alarmIdRef.current !== null) {
      await cancelAlarm(alarmIdRef.current);
      alarmIdRef.current = null;
    }
  };

  const requestTimerPermission = async () => {
    const { granted, available } = await requestAlarmPermission();
    if (available && !granted && !permissionWarnedRef.current) {
      permissionWarnedRef.current = true;
      AppAlert.alert(
        "Alarma con la pantalla apagada",
        "Permite las notificaciones de ReadTrack para que la alarma del temporizador suene aunque dejes la app en segundo plano."
      );
    }
    if (granted && !alarmHintRef.current) {
      alarmHintRef.current = true;
      const show = await shouldShowAlarmHint();
      if (show) {
        AppAlert.alert(
          "Suena como una alarma",
          "La alarma usa el canal de alarmas del teléfono, así que se escucha incluso en modo silencioso. Para que también suene con el modo No molestar, permite el acceso de la app en los ajustes del sistema.",
          [
            {
              text: "Abrir ajustes",
              onPress: () => {
                openAlarmSettings();
                markAlarmHintSeen();
              },
            },
            { text: "Después", style: "cancel", onPress: markAlarmHintSeen },
          ]
        );
      }
    }
    return granted;
  };

  const startTimer = () => {
    const min = parseInt(minutesInput, 10);
    if (isNaN(min) || min <= 0 || min > 600) {
      return AppAlert.alert("Error", "Elige un tiempo válido entre 1 y 600 minutos");
    }
    alarmFiredRef.current = false;
    setDuration(min * 60);
    setSeconds(min * 60);
    setTimerStarted(true);
    setRunning(true);
    requestTimerPermission();
    scheduleTimerAlarm(min * 60000);
  };

  const togglePause = () => {
    if (!isTimer) {
      setRunning((r) => !r);
      return;
    }
    if (running) {
      cancelTimerAlarm();
      setRunning(false);
    } else {
      requestTimerPermission();
      scheduleTimerAlarm(seconds * 1000);
      setRunning(true);
    }
  };

  const toggleKeepAwake = (value) => {
    setKeepAwakeState(value);
    try {
      AlarmNative?.setKeepAwake?.(value);
    } catch {}
  };

  const enterSimpleMode = () => {
    setSimpleMode(true);
    try {
      AlarmNative?.setKeepAwake?.(true);
    } catch {}
  };

  const exitSimpleMode = () => {
    setSimpleMode(false);
    try {
      AlarmNative?.setKeepAwake?.(keepAwake);
    } catch {}
  };

  const clockText = () => {
    const h = now.getHours();
    const m = now.getMinutes();
    return `${h}:${String(m).padStart(2, "0")}`;
  };

  const pagesRead = Math.max(0, parseInt(endPage || 0) - startPage);
  const hoursElapsed = (isTimer ? (duration ?? 0) - seconds : seconds) / 3600;
  const estimatedPages = avgSpeed && hoursElapsed > 0 ? Math.round(avgSpeed * hoursElapsed) : null;
  const currentSpeedH = hoursElapsed > 0 && pagesRead > 0 ? pagesRead / hoursElapsed : 0;
  const effectiveSpeed = currentSpeedH > 0 ? (avgSpeed ? (currentSpeedH + avgSpeed) / 2 : currentSpeedH) : (avgSpeed ?? 0);
  const pagesPerHour = effectiveSpeed;
  const pagesLeft = book.pages ? Math.max(0, book.pages - parseInt(endPage || 0)) : null;
  const minutesLeft = pagesPerHour > 0 && pagesLeft !== null ? pagesLeft / (pagesPerHour / 60) : null;

  const saveSession = async ({ page, pages }) => {
    if (savingRef.current) return; // toques repetidos se ignoran al instante
    savingRef.current = true;
    setSaving(true);
    setRunning(false);
    stopAlarm();
    cancelTimerAlarm();
    const readSeconds = isTimer ? (duration ?? 0) - seconds : seconds;
    try {
      const completed = !!book.pages && page >= book.pages;
      const updates = { current_page: page };
      if (completed) {
        const n = new Date();
        updates.status = "completed";
        updates.finished_at = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
      }
      await updateBook(book.id, updates);
      const saved = await addReadingSession(book.id, page, readSeconds, pages);
      navigation.replace("SessionSummary", {
        book,
        pagesRead: pages,
        readSeconds,
        endPage: page,
        speed: pagesPerHour,
        completed,
        streakInfo: saved?.first_today ? { days: saved.streak ?? 1 } : null,
      });
    } catch {
      AppAlert.alert("Error", "No se pudo guardar la sesión");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleFinish = () => setFinishVisible(true);

  // Cualquier intento de salir de la sesión (botón/gesto atrás en Android e iOS)
  // pide confirmación. No protege la pantalla previa de configurar el
  // temporizador ni el momento del guardado, que navega con replace.
  const shouldPreventLeave = !(isTimer && !timerStarted) && !saving;
  usePreventRemove(shouldPreventLeave, ({ data }) => {
    AppAlert.alert(
      "¿Seguro que quieres salir?",
      "Dejarás tu sesión de lectura y tu avance se perderá si no guardas.",
      [
        { text: "Seguir leyendo", style: "cancel" },
        { text: "Guardar y salir", onPress: () => setFinishVisible(true) },
        {
          text: "Salir sin guardar",
          style: "destructive",
          onPress: () => navigation.dispatch(data.action),
        },
      ]
    );
  });

  const confirmSave = () => {
    const page = parseInt(endPage);
    if (isNaN(page) || page < startPage) {
      return AppAlert.alert("Error", "La página final debe ser mayor o igual a la inicial");
    }
    setFinishVisible(false);
    saveSession({ page, pages: Math.max(0, page - startPage) });
  };

  const finishModal = (
    <Modal visible={finishVisible} transparent animationType="fade" onRequestClose={() => setFinishVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>¿En qué página quedaste?</Text>
          <View style={styles.customInputBox}>
            <TextInput
              style={styles.customInput}
              value={endPage}
              onChangeText={(t) => setEndPage(t.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              maxLength={4}
              autoFocus
              selectTextOnFocus
            />
            <Text style={styles.customUnit}>págs</Text>
          </View>
          <Text style={styles.pagesEndHint}>
            Leíste {Math.max(0, parseInt(endPage || 0) - startPage)} páginas
          </Text>
          <View style={styles.modalBtnRow}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnCancel]}
              onPress={() => setFinishVisible(false)}
            >
              <Text style={styles.modalBtnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.finishBtn]} onPress={confirmSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.finishBtnText}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const blockNotice = (
    <View style={styles.noticeBox}>
      <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
      <Text style={styles.noticeText}>
        No bloquees ni cierres ReadTrack o tu alarma no sonará
      </Text>
    </View>
  );

  if (isTimer && !timerStarted) {
    return (
      <View style={styles.container}>
        <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.subtitle}>Elige cuánto quieres leer</Text>

        {blockNotice}

        {Platform.Version >= 34 && (
          <TouchableOpacity style={styles.fsiBtn} onPress={openFullScreenIntentSettings}>
            <Ionicons name="expand-outline" size={16} color={colors.accent} />
            <Text style={styles.fsiBtnText}>
              ¿No salta a pantalla completa? Permite "Alarmas y recordatorios"
            </Text>
          </TouchableOpacity>
        )}

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

        <TouchableOpacity style={styles.finishBtn} onPress={handleFinish} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.finishBtnText}>Guardar sesión</Text>
          )}
        </TouchableOpacity>

        {finishModal}
      </View>
    );
  }

  if (simpleMode) {
    return (
      <TouchableOpacity style={styles.simpleContainer} activeOpacity={1} onPress={exitSimpleMode}>
        <Text style={styles.simpleClock}>{clockText()}</Text>
        <Text style={styles.simpleDate}>{now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</Text>
        {book.cover ? (
          <Image source={{ uri: book.cover }} style={styles.simpleCover} resizeMode="cover" />
        ) : (
          <View style={[styles.simpleCover, styles.simpleCoverNoImg]}>
            <Ionicons name="book" size={36} color="#444" />
          </View>
        )}
        <Text style={styles.simpleBookTitle} numberOfLines={1}>{book.title}</Text>
        <Text style={styles.simpleTimer}>{isTimer ? "Tiempo restante" : "Tiempo transcurrido"} · {formatTime(seconds)}</Text>
        <Text style={styles.simpleHint}>Toca la pantalla para volver</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {book.cover && (
        <>
          <ImageBackground source={{ uri: book.cover }} style={styles.bgImage} resizeMode="cover" />
          <View style={styles.bgOverlay} />
        </>
      )}
      <View style={styles.header}>
        <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
        <TouchableOpacity style={styles.simpleBtn} onPress={enterSimpleMode}>
          <Ionicons name="moon-outline" size={14} color={colors.accent} />
          <Text style={styles.simpleBtnText}>Modo simple</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.timerContainer}>
        <Text style={styles.timerLabel}>{isTimer ? "Tiempo restante" : "Tiempo transcurrido"}</Text>
        <Text style={styles.timer}>{formatTime(seconds)}</Text>
        <TouchableOpacity style={styles.pauseBtn} onPress={togglePause}>
          <View style={styles.pauseBtnRow}>
            <Ionicons name={running ? "pause" : "play"} size={18} color={colors.accent} />
            <Text style={styles.pauseBtnText}>{running ? "Pausar" : "Continuar"}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {isTimer && (
        <>
          {blockNotice}
          <View style={styles.toggleRow}>
            <Ionicons name="sunny-outline" size={18} color={colors.textDim} />
            <Text style={styles.toggleLabel}>Mantener pantalla encendida</Text>
            <Switch
              value={keepAwake}
              onValueChange={toggleKeepAwake}
              trackColor={{ true: colors.accent }}
              thumbColor={keepAwake ? colors.onAccent : undefined}
            />
          </View>
        </>
      )}

      {avgSpeed && (
        <Text style={styles.avgSpeed}>
          Velocidad promedio: {avgSpeed.toFixed(0)} págs/h
        </Text>
      )}

      <View style={styles.pagesContainer}>
        <View style={styles.pageBox}>
          <Text style={styles.pageBoxLabel}>Estás en la página</Text>
          <Text style={styles.pageBoxValue}>{startPage}</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{estimatedPages ?? "—"}</Text>
          <Text style={styles.statLabel}>Páginas leídas</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {pagesPerHour > 0 ? pagesPerHour.toFixed(0) : "—"}
          </Text>
          <Text style={styles.statLabel}>Págs/h</Text>
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

      <TouchableOpacity style={styles.finishBtn} onPress={handleFinish} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.finishBtnText}>Finalizar sesión</Text>
        )}
      </TouchableOpacity>

      {finishModal}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: 44, paddingHorizontal: 24, overflow: "hidden" },
    bookTitle: { fontSize: 18, fontWeight: "bold", color: colors.text, textAlign: "center", marginBottom: 12 },
    bgImage: { ...StyleSheet.absoluteFillObject },
    bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background, opacity: 0.74 },
    header: { alignItems: "center", marginBottom: 20 },
    subtitle: { fontSize: 15, color: colors.textDim, textAlign: "center", marginBottom: 24 },
    timerContainer: { alignItems: "center", marginBottom: 18 },
    timerLabel: { fontSize: 13, color: colors.textDim, marginBottom: 4 },
    timer: { fontSize: 64, fontWeight: "bold", color: colors.accent, fontVariant: ["tabular-nums"] },
    pauseBtn: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 36, paddingVertical: 14, marginTop: 14 },
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
    noticeBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 16,
    },
    noticeText: { flex: 1, color: colors.textDim, fontSize: 12.5, lineHeight: 17 },
    fsiBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      marginBottom: 24,
    },
    fsiBtnText: { color: colors.accent, fontSize: 13, fontWeight: "bold", flexShrink: 1, textAlign: "center" },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 9,
      marginBottom: 16,
    },
    toggleLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "bold" },
    backBtn: { marginTop: 12, alignItems: "center", paddingVertical: 12 },
    backBtnText: { color: colors.textDim, fontSize: 15, fontWeight: "bold" },
    pagesContainer: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 18, gap: 12 },
    pageBox: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, alignItems: "center", minWidth: 96 },
    pageBoxLabel: { color: colors.textDim, fontSize: 11, marginBottom: 6 },
    pageBoxValue: { color: colors.text, fontSize: 26, fontWeight: "bold" },
    statsContainer: { flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 18 },
    statItem: { alignItems: "center" },
    statValue: { fontSize: 22, fontWeight: "bold", color: colors.accent },
    statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
    progressSection: { marginBottom: 18 },
    progressLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 8, textAlign: "center" },
    progressContainer: { height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4, overflow: "hidden" },
    progressBar: { height: 8, backgroundColor: colors.accent, borderRadius: 4 },
    finishBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    finishBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "bold" },
    avgSpeed: { color: colors.textDim, fontSize: 12, textAlign: "center", marginBottom: 10 },
    completedBox: { alignItems: "center", marginBottom: 32, marginTop: 24 },
    completedTitle: { fontSize: 22, fontWeight: "bold", color: colors.text, marginTop: 12 },
    completedSub: { fontSize: 14, color: colors.textDim, marginTop: 6 },
    pagesEndHint: { fontSize: 12, color: colors.textDim, marginTop: 10 },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 32 },
    modalCard: {
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
    modalTitle: { fontSize: 18, fontWeight: "bold", color: colors.text, marginBottom: 18 },
    modalBtnRow: { flexDirection: "row", gap: 12, marginTop: 22 },
    modalBtn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
    modalBtnCancel: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
    modalBtnCancelText: { color: colors.textDim, fontSize: 15, fontWeight: "bold" },
    simpleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 7,
      alignSelf: "center",
    },
    simpleBtnText: { color: colors.accent, fontSize: 13, fontWeight: "bold" },
    simpleContainer: {
      flex: 1,
      backgroundColor: "#000",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    simpleClock: { fontSize: 92, fontWeight: "200", color: "#fff", fontVariant: ["tabular-nums"], letterSpacing: 2 },
    simpleDate: { fontSize: 14, color: "#777", marginTop: 4, textTransform: "capitalize", marginBottom: 36 },
    simpleCover: { width: 130, height: 195, borderRadius: 12, marginBottom: 22 },
    simpleCoverNoImg: { backgroundColor: "#16161f", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2a2a3e" },
    simpleBookTitle: { color: "#fff", fontSize: 15, fontWeight: "bold", width: "70%", textAlign: "center", marginBottom: 10 },
    simpleTimer: { color: "#999", fontSize: 14, marginBottom: 10 },
    simpleHint: { color: "#555", fontSize: 12, position: "absolute", bottom: 40 },
  });
