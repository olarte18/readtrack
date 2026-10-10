import { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { sessionSeconds, computeSessionStats } from "../utils/sessionStats";

// Fila de estadísticas vivas (páginas leídas, ritmo, tiempo para terminar).
// Aislada en su propio componente para que su recálculo no re-renderice la
// pantalla completa. No necesita precisión por segundo: refresca cada 5s.
export default function SessionStats({ book, endPage, startPage, avgSpeed, isTimer, duration, anchor, running }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    if (!running) return;
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, [running, anchor]);

  const seconds = sessionSeconds(isTimer, anchor, running, nowMs);
  const { pagesPerHour, readLabel, readValue, minutesLeft } = computeSessionStats({
    book,
    endPage,
    startPage,
    avgSpeed,
    isTimer,
    duration,
    seconds,
  });

  return (
    <View style={styles.statsContainer}>
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{readValue}</Text>
        <Text style={styles.statLabel}>{readLabel}</Text>
      </View>
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{pagesPerHour > 0 ? pagesPerHour.toFixed(0) : "—"}</Text>
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
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    statsContainer: { flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 18 },
    statItem: { alignItems: "center" },
    statValue: { fontSize: 22, fontWeight: "bold", color: colors.accent },
    statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  });
