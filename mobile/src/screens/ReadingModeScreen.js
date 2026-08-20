import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

export default function ReadingModeScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { book } = route.params;

  const selectMode = (mode) => {
    navigation.replace("ActiveSession", { book, mode });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
      <Text style={styles.subtitle}>¿Cómo quieres leer hoy?</Text>

      <TouchableOpacity style={styles.optionCard} onPress={() => selectMode("stopwatch")}>
        <View style={styles.optionIcon}>
          <Ionicons name="stopwatch" size={28} color={colors.onAccent} />
        </View>
        <View style={styles.optionInfo}>
          <Text style={styles.optionTitle}>Cronómetro</Text>
          <Text style={styles.optionDesc}>Deja que fluya el tiempo y mide lo que leas sin límite.</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textDim} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={() => selectMode("timer")}>
        <View style={[styles.optionIcon, { backgroundColor: colors.accent }]}>
          <Ionicons name="timer" size={28} color={colors.onAccent} />
        </View>
        <View style={styles.optionInfo}>
          <Text style={styles.optionTitle}>Temporizador</Text>
          <Text style={styles.optionDesc}>Elige cuánto quieres leer y recibe una alarma al terminar.</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textDim} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: 70, paddingHorizontal: 24 },
    bookTitle: { fontSize: 20, fontWeight: "bold", color: colors.text, textAlign: "center", marginBottom: 8 },
    subtitle: { fontSize: 15, color: colors.textDim, textAlign: "center", marginBottom: 32 },
    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 18,
      marginBottom: 16,
      gap: 14,
    },
    optionIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
    optionInfo: { flex: 1 },
    optionTitle: { fontSize: 17, fontWeight: "bold", color: colors.text, marginBottom: 4 },
    optionDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  });
