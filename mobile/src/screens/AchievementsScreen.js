import { useState, useRef, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { getAchievements, markAchievementsSeen } from "../services/api";
import { readSnapshot, saveSnapshot, hasInitialized, markInitialized } from "../services/achievementsSnapshot";
import { CelebrationModal, TIER_COLORS } from "../components/AchievementCelebration";

const TIER_WEIGHT = { bronze: 1, silver: 2, gold: 3, special: 4 };

const TIER_LABELS = {
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
  special: "Especial",
};

function AchievementDetailModal({ item, onClose }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  if (!item) return null;
  const tierColor = item.tier && TIER_COLORS[item.tier] ? TIER_COLORS[item.tier] : colors.accent;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.detailOverlay}>
        <TouchableOpacity style={styles.detailBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.detailCard, { backgroundColor: colors.surface }]}>
          <View
            style={[
              styles.detailIcon,
              { borderColor: item.unlocked ? tierColor : colors.textDim, backgroundColor: colors.surfaceAlt },
              !item.unlocked && styles.itemCircleLocked,
            ]}
          >
            <Ionicons name={item.icon} size={32} color={item.unlocked ? tierColor : colors.textDim} />
          </View>
          <View style={styles.detailTitles}>
            <Text style={[styles.detailName, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.detailTier, { color: tierColor }]}>
              {item.unlocked ? TIER_LABELS[item.tier] ?? item.tier : "Por desbloquear"}
            </Text>
          </View>
          <Text style={[styles.detailDescription, { color: colors.textMuted }]}>{item.description}</Text>
          {item.unlocked && item.leyenda ? (
            <Text style={[styles.detailLeyenda, { color: colors.textDim }]}>“{item.leyenda}”</Text>
          ) : null}
          <View style={styles.detailProgressBlock}>
            <ProgressBlock item={item} variant="detail" />
          </View>
          <TouchableOpacity style={[styles.detailBtn, { backgroundColor: colors.accent }]} onPress={onClose}>
            <Text style={[styles.detailBtnText, { color: colors.onAccent }]}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ProgressBlock({ item, variant = "grid" }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const isDetail = variant === "detail";
  const trackStyle = isDetail ? styles.detailProgressTrack : styles.progressTrack;
  const fillStyle = isDetail ? styles.detailProgressFill : styles.progressFill;
  const textStyle = isDetail ? styles.detailProgressText : styles.itemProgressText;

  if (item.unlocked && !item.next_tier) return null;
  if (item.target == null) {
    return (
      <Text style={[{ marginTop: 6 }, textStyle]} numberOfLines={1}>
        Configura una meta
      </Text>
    );
  }
  const fmt = (n) => Number(n).toLocaleString("es-CO");
  return (
    <>
      <View style={[trackStyle, { backgroundColor: colors.surfaceAlt }]}>
        <View
          style={[
            fillStyle,
            { backgroundColor: colors.accent, width: `${Math.min((item.progress / item.target) * 100, 100)}%` },
          ]}
        />
      </View>
      <Text style={textStyle} numberOfLines={1}>
        {`${fmt(item.progress)}/${fmt(item.target)}`}
      </Text>
    </>
  );
}

export default function AchievementsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [celebration, setCelebration] = useState([]);
  const [selected, setSelected] = useState(null);
  const celebratingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setError(false);

      getAchievements()
        .then(async (data) => {
          if (cancelled) return;
          const rows = data.groups ?? [];
          setGroups(rows);
          const unlocked = rows.flatMap((g) => g.items.filter((i) => i.unlocked));

          const known = (await readSnapshot()) ?? {};
          const initialized = await hasInitialized();

          let fresh = initialized
            ? unlocked.filter((i) => known[`${i.code}:${i.tier}`] !== i.unlocked_at)
            : [];

          // Si varios escalones del mismo logro se desbloquean de una vez, solo
          // se celebra la insignia más alta.
          if (fresh.length > 1) {
            const best = new Map();
            for (const i of fresh) {
              const prev = best.get(i.code);
              if (!prev || TIER_WEIGHT[i.tier] > TIER_WEIGHT[prev.tier]) best.set(i.code, i);
            }
            fresh = [...best.values()];
          }

          const next = {};
          for (const i of unlocked) next[`${i.code}:${i.tier}`] = i.unlocked_at;
          if (Object.keys(next).length) {
            saveSnapshot(next);
          }

          // Primera apertura (sin historial): no celebramos el inventario viejo,
          // solo lo marcamos como visto en silencio.
          if (initialized && fresh.length > 0 && !celebratingRef.current) {
            celebratingRef.current = true;
            setCelebration(fresh.slice(0, 3));
            markAchievementsSeen().catch(() => {});
          } else if ((data.unseen_count ?? 0) > 0) {
            markAchievementsSeen().catch(() => {});
          }
          if (!initialized) markInitialized();
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [])
  );

  const closeCelebration = () => {
    celebratingRef.current = false;
    setCelebration([]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Logros</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.error}>No se pudieron cargar los logros</Text>
      ) : groups.length === 0 ? (
        <Text style={styles.empty}>Tus logros aparecerán aquí a medida que leas</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {groups.map((group) => (
            <View key={group.code} style={styles.group}>
              <Text style={styles.groupTitle}>{group.label}</Text>
              <View style={styles.grid}>
                {group.items.map((item) => {
                  const tierColor = item.tier && TIER_COLORS[item.tier] ? TIER_COLORS[item.tier] : colors.accent;
                  return (
                    <TouchableOpacity
                      key={`${item.code}:${item.tier}`}
                      style={styles.item}
                      activeOpacity={0.6}
                      onPress={() => setSelected(item)}
                    >
                      <View
                        style={[
                          styles.itemCircle,
                          { borderColor: item.unlocked ? tierColor : colors.textDim },
                          !item.unlocked && styles.itemCircleLocked,
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={28}
                          color={item.unlocked ? tierColor : colors.textDim}
                        />
                      </View>
                      <Text
                        style={[
                          styles.itemName,
                          { color: item.unlocked ? colors.text : colors.textDim },
                        ]}
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>
                      <View style={styles.itemProgress}>
                        <ProgressBlock item={item} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <CelebrationModal items={celebration} onClose={closeCelebration} />
      <AchievementDetailModal item={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 50,
      paddingBottom: 14,
      paddingHorizontal: 16,
    },
    backBtn: { padding: 4, marginRight: 8 },
    title: { fontSize: 22, fontWeight: "bold", color: colors.text },
    list: { paddingHorizontal: 16, paddingBottom: 40 },
    group: { marginBottom: 24 },
    groupTitle: { fontSize: 15, fontWeight: "bold", color: colors.textMuted, marginBottom: 12 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 12 },
    item: { width: "30%", alignItems: "center", marginBottom: 22 },
    itemCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceAlt,
    },
    itemCircleLocked: { borderStyle: "dashed" },
    itemName: { fontSize: 11, textAlign: "center", marginTop: 6, minHeight: 28 },
    itemProgress: { alignItems: "center", marginTop: 2 },
    progressTrack: { height: 4, width: 56, borderRadius: 2, overflow: "hidden" },
    progressFill: { height: 4, borderRadius: 2 },
    itemProgressText: { fontSize: 10, color: colors.textDim, marginTop: 3 },
    error: { color: colors.textDim, textAlign: "center", marginTop: 40 },
    empty: { color: colors.textDim, textAlign: "center", marginTop: 40, paddingHorizontal: 30 },
    detailOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    detailBackdrop: { ...StyleSheet.absoluteFillObject },
    detailCard: {
      borderRadius: 20,
      padding: 24,
      width: "100%",
      maxWidth: 360,
      alignItems: "center",
    },
    detailIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    detailTitles: { alignItems: "center", marginBottom: 10 },
    detailName: { fontSize: 18, fontWeight: "bold", textAlign: "center" },
    detailTier: { fontSize: 13, fontWeight: "600", marginTop: 2 },
    detailDescription: { fontSize: 14, lineHeight: 20, textAlign: "center" },
    detailLeyenda: {
      fontSize: 13,
      fontStyle: "italic",
      lineHeight: 19,
      textAlign: "center",
      marginTop: 10,
      paddingHorizontal: 8,
    },
    detailProgressBlock: { marginTop: 16, alignSelf: "stretch" },
    detailProgressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
    detailProgressFill: { height: 6, borderRadius: 3 },
    detailProgressText: { fontSize: 12, color: colors.textDim, marginTop: 6, textAlign: "center" },
    detailBtn: {
      marginTop: 20,
      borderRadius: 12,
      paddingHorizontal: 28,
      paddingVertical: 10,
      alignSelf: "stretch",
      alignItems: "center",
    },
    detailBtnText: { fontWeight: "bold", fontSize: 15 },
  });