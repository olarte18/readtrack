import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { AppAlert } from "../components/AppAlert";
import { updateBook } from "../services/api";

const formatTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const formatMinutes = (min) => {
  if (min >= 60) return `${(min / 60).toFixed(1)}h`;
  return `${Math.round(min)}min`;
};

export default function SessionSummaryScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { book, pagesRead, readSeconds, endPage, speed, streakInfo, completed } = route.params;
  const [rating, setRating] = useState(0);

  const handleRate = async (stars) => {
    setRating(stars);
    try {
      await updateBook(book.id, { rating: stars });
    } catch {
      AppAlert.alert("Error", "No se pudo guardar la calificación");
    }
  };

  const [streakVisible, setStreakVisible] = useState(!!streakInfo);
  const flameScale = useRef(new Animated.Value(0)).current;
  const flameRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!streakInfo) return;
    Animated.sequence([
      Animated.parallel([
        Animated.spring(flameScale, { toValue: 1, friction: 4, useNativeDriver: true }),
        Animated.timing(flameRotate, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.loop(
        Animated.sequence([
          Animated.timing(flameScale, { toValue: 1.12, duration: 650, useNativeDriver: true }),
          Animated.timing(flameScale, { toValue: 1, duration: 650, useNativeDriver: true }),
        ])
      ),
    ]).start();
  }, [streakInfo]);

  const pagesLeft = book.pages ? Math.max(0, book.pages - endPage) : null;
  const hoursLeft = speed > 0 && pagesLeft !== null ? pagesLeft / speed : null;
  const progress = book.pages ? Math.min((endPage / book.pages) * 100, 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {completed ? (
          <>
            <Ionicons name="trophy" size={64} color={colors.star} />
            <Text style={styles.title}>¡Felicidades!</Text>
            <Text style={styles.completedText}>Terminaste "{book.title}"</Text>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={64} color={colors.accent} />
            <Text style={styles.title}>¡Sesión guardada!</Text>
            <Text style={styles.completedText}>{book.title}</Text>
          </>
        )}
      </View>

      {completed && (
        <View style={styles.card}>
          <Text style={styles.ratingTitle}>¿Qué te pareció?</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => handleRate(star)}>
                <Ionicons
                  name={star <= rating ? "star" : "star-outline"}
                  size={36}
                  color={star <= rating ? colors.star : colors.textDim}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ratingHint}>
            {rating > 0 ? `${rating} de 5 — toca para cambiarla` : "Opcional — tócalas para calificar"}
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="book" size={20} color={colors.accent} />
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>Estás en</Text>
            <Text style={styles.rowValue}>Página {endPage}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Ionicons name="time" size={20} color={colors.accent} />
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>Leíste</Text>
            <Text style={styles.rowValue}>{pagesRead} páginas · {formatTime(readSeconds)}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Ionicons name="speedometer" size={20} color={colors.accent} />
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>Velocidad</Text>
            <Text style={styles.rowValue}>{speed > 0 ? `${speed.toFixed(0)} págs/h` : "—"}</Text>
          </View>
        </View>
      </View>

      {!completed && pagesLeft !== null && (
        <View style={styles.card}>
          <Text style={styles.leftText}>
            Te faltan <Text style={styles.leftHighlight}>{pagesLeft} páginas</Text> para terminar
          </Text>
          {hoursLeft !== null && hoursLeft > 0 ? (
            <Text style={styles.leftEstimate}>
              A este ritmo, cerca de {formatMinutes(hoursLeft * 60)} de lectura
            </Text>
          ) : (
            <Text style={styles.leftEstimate}>A este ritmo, cerca de terminar</Text>
          )}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{Math.round(progress)}% del libro</Text>
        </View>
      )}

      <TouchableOpacity style={styles.finishBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.finishBtnText}>Listo</Text>
      </TouchableOpacity>

      <Modal visible={streakVisible} transparent animationType="fade">
        <View style={styles.streakOverlay}>
          <View style={styles.streakCard}>
            <Animated.View
              style={{
                transform: [
                  { scale: flameScale },
                  {
                    rotate: flameRotate.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["-10deg", "10deg"],
                    }),
                  },
                ],
              }}
            >
              <Ionicons name="flame" size={96} color={colors.star} />
            </Animated.View>
            <Text style={styles.streakTitle}>¡Se activó tu racha!</Text>
            <Text style={styles.streakNumber}>{streakInfo?.days ?? 1}</Text>
            <Text style={styles.streakDays}>
              {(streakInfo?.days ?? 1) === 1 ? "día seguido" : "días seguidos"} de lectura
            </Text>
            <Text style={styles.streakCheer}>
              {(streakInfo?.days ?? 1) === 1
                ? "El fuego está encendido, no lo dejes apagar 🔥"
                : "Sigue así, el fuego crece cada día más 🔥"}
            </Text>
            <TouchableOpacity style={styles.streakBtn} onPress={() => setStreakVisible(false)}>
              <Text style={styles.streakBtnText}>¡Vamos!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: 70, paddingHorizontal: 24 },
    header: { alignItems: "center", marginBottom: 24 },
    title: { fontSize: 24, fontWeight: "bold", color: colors.text, marginTop: 10 },
    completedText: { fontSize: 15, color: colors.textMuted, marginTop: 6, textAlign: "center" },
    ratingTitle: { fontSize: 16, fontWeight: "bold", color: colors.text, textAlign: "center", marginBottom: 12 },
    starsRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
    ratingHint: { fontSize: 12, color: colors.textDim, textAlign: "center", marginTop: 10 },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
    rowInfo: { flex: 1 },
    rowLabel: { fontSize: 12, color: colors.textDim, marginBottom: 2 },
    rowValue: { fontSize: 15, fontWeight: "bold", color: colors.text },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
    leftText: { fontSize: 15, color: colors.text, marginBottom: 4 },
    leftHighlight: { fontWeight: "bold", color: colors.accent },
    leftEstimate: { fontSize: 13, color: colors.textDim, marginTop: 2, marginBottom: 14 },
    progressContainer: { height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4, overflow: "hidden" },
    progressBar: { height: 8, backgroundColor: colors.accent, borderRadius: 4 },
    progressLabel: { fontSize: 11, color: colors.textDim, marginTop: 6 },
    finishBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
    finishBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "bold" },
    streakOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 32 },
    streakCard: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderRadius: 24,
      paddingVertical: 36,
      paddingHorizontal: 24,
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.accent + "55",
    },
    streakTitle: { fontSize: 22, fontWeight: "bold", color: colors.text, marginTop: 12 },
    streakNumber: { fontSize: 64, fontWeight: "bold", color: colors.star, lineHeight: 72 },
    streakDays: { fontSize: 15, color: colors.textMuted, marginBottom: 10 },
    streakCheer: { fontSize: 13, color: colors.textDim, textAlign: "center", marginBottom: 24 },
    streakBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 48 },
    streakBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "bold" },
  });