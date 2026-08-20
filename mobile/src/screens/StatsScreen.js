import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { getStats } from "../services/api";

const STAT_ITEMS = [
  { key: "completed", label: "Leídos", icon: "checkmark-circle" },
  { key: "reading", label: "Leyendo", icon: "book" },
  { key: "paused", label: "Pausados", icon: "pause-circle" },
  { key: "pending", label: "Pendientes", icon: "time" },
  { key: "wishlist", label: "Lista de deseos", icon: "star" },
  { key: "abandoned", label: "Abandonados", icon: "close-circle" },
];

export default function StatsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats().then(setStats).finally(() => setLoading(false));
  }, []);

  const handleStatPress = (statusKey) => {
    navigation.navigate("Main", {
      screen: "Home",
      params: { filterStatus: statusKey },
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Estadísticas</Text>

      <View style={styles.grid}>
        {STAT_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.statCard}
            onPress={() => handleStatPress(item.key)}
          >
            <Ionicons name={item.icon} size={24} color={colors.textMuted} style={styles.icon} />
            <Text style={styles.statNumber}>{stats?.[item.key] ?? 0}</Text>
            <Text style={styles.statLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.bigStatsRow}>
        <View style={styles.bigStat}>
          <Text style={styles.bigStatNumber}>{stats?.total_pages ?? 0}</Text>
          <Text style={styles.bigStatLabel}>Páginas leídas</Text>
        </View>
        <View style={styles.bigStat}>
          <View style={styles.bigStatTop}>
            <Ionicons name="star" size={18} color={colors.star} />
            <Text style={styles.bigStatNumber}>
              {stats?.avg_rating > 0 ? stats.avg_rating : "—"}
            </Text>
          </View>
          <Text style={styles.bigStatLabel}>Rating promedio</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
  centered: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  container: { flexGrow: 1, backgroundColor: colors.background, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "bold", color: colors.text, marginBottom: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, alignItems: "center", minWidth: "30%", flexGrow: 1 },
  icon: { marginBottom: 6 },
  statNumber: { fontSize: 28, fontWeight: "bold", color: colors.accent },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  bigStatsRow: { flexDirection: "row", gap: 10 },
  bigStat: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 20, alignItems: "center" },
  bigStatTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  bigStatNumber: { fontSize: 28, fontWeight: "bold", color: colors.accent },
  bigStatLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});