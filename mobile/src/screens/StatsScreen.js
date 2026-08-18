import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { getStats } from "../services/api";

const STAT_ITEMS = [
  { key: "completed", label: "Leídos", emoji: "✅" },
  { key: "reading", label: "Leyendo", emoji: "📖" },
  { key: "paused", label: "Pausados", emoji: "⏸" },
  { key: "pending", label: "Pendientes", emoji: "🕐" },
  { key: "wishlist", label: "Lista de deseos", emoji: "🌟" },
  { key: "abandoned", label: "Abandonados", emoji: "❌" },
];

export default function StatsScreen({ navigation }) {
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
        <ActivityIndicator color="#cba6f7" size="large" />
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
            <Text style={styles.emoji}>{item.emoji}</Text>
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
          <Text style={styles.bigStatNumber}>
            {stats?.avg_rating > 0 ? stats.avg_rating + " ⭐" : "—"}
          </Text>
          <Text style={styles.bigStatLabel}>Rating promedio</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: "#13131f", justifyContent: "center", alignItems: "center" },
  container: { flexGrow: 1, backgroundColor: "#13131f", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: { backgroundColor: "#1e1e2e", borderRadius: 12, padding: 16, alignItems: "center", minWidth: "30%", flexGrow: 1 },
  emoji: { fontSize: 24, marginBottom: 6 },
  statNumber: { fontSize: 28, fontWeight: "bold", color: "#cba6f7" },
  statLabel: { fontSize: 11, color: "#aaa", marginTop: 4, textAlign: "center" },
  bigStatsRow: { flexDirection: "row", gap: 10 },
  bigStat: { flex: 1, backgroundColor: "#1e1e2e", borderRadius: 12, padding: 20, alignItems: "center" },
  bigStatNumber: { fontSize: 28, fontWeight: "bold", color: "#cba6f7" },
  bigStatLabel: { fontSize: 12, color: "#aaa", marginTop: 4 },
});
