import { useMemo, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { getStreakShop, buyStreakProtector } from "../services/api";
import { AppAlert } from "../components/AppAlert";

export default function StreakShopScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [buying, setBuying] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setError(false);
      getStreakShop()
        .then((data) => {
          if (!cancelled) setState(data);
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

  const handleBuy = async () => {
    if (buying) return;
    setBuying(true);
    try {
      const data = await buyStreakProtector();
      setState(data);
    } catch (err) {
      AppAlert.alert("No se pudo comprar", err?.message || "Inténtalo de nuevo.");
    } finally {
      setBuying(false);
    }
  };

  const cost = state?.cost ?? 400;
  const points = state?.points ?? 0;
  const owned = state?.owned ?? 0;
  const slots = state?.slots ?? 2;
  const canBuy = state?.can_buy ?? 0;
  const slotsFull = owned >= slots;
  const missing = Math.max(0, cost - points);

  const buyLabel = slotsFull
    ? "Ranuras llenas"
    : missing > 0
      ? `Te faltan ${missing} puntos`
      : `Comprar · ${cost} puntos`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Volver" onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} accessible={false} />
        </TouchableOpacity>
        <Text style={styles.title}>Protectores de racha</Text>
      </View>

      {loading && !state ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : error && !state ? (
        <Text style={styles.error}>No se pudo cargar la tienda</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {state.fromCache && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline" size={16} color={colors.star} accessible={false} />
              <Text style={styles.offlineText}>Sin conexión: mostrando datos guardados</Text>
            </View>
          )}

          <View style={styles.hero}>
            <Ionicons name="shield-checkmark" size={56} color={colors.accent} accessible={false} />
            <Text style={styles.heroTitle}>Protege tu racha</Text>
            <Text style={styles.heroText}>
              Un protector cubre un día sin lectura y evita que se corte tu racha. Se usan
              automáticamente cuando falta solo un día entre dos lecturas, siempre que eso
              mantenga viva tu racha actual. Si la racha ya se perdió, no se gastan.
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="sparkles" size={22} color={colors.star} accessible={false} />
              <Text style={styles.statValue}>{points}</Text>
              <Text style={styles.statLabel}>Tus puntos</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="shield" size={22} color={colors.accent} accessible={false} />
              <Text style={styles.statValue}>{owned}</Text>
              <Text style={styles.statLabel}>Protectores</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="albums" size={22} color={colors.accent} accessible={false} />
              <Text style={styles.statValue}>{slots}</Text>
              <Text style={styles.statLabel}>Ranuras</Text>
            </View>
          </View>

          {state.gift_available && (
            <View style={styles.giftCard}>
              <Ionicons name="gift" size={18} color={colors.accent} accessible={false} />
              <Text style={styles.giftText}>Tienes un protector de regalo</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.buyBtn, (!canBuy || buying) && styles.buyBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={buyLabel}
            accessibilityState={{ disabled: !canBuy || buying }}
            disabled={!canBuy || buying}
            onPress={handleBuy}
            activeOpacity={0.8}
          >
            {buying ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <Ionicons name="cart" size={18} color={colors.onAccent} accessible={false} />
                <Text style={styles.buyBtnText}>{buyLabel}</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Cómo funcionan</Text>
            <Text style={styles.infoItem}>• Ganas 100 puntos por cada hora de lectura efectiva.</Text>
            <Text style={styles.infoItem}>• Cada protector cuesta {cost} puntos y no caduca.</Text>
            <Text style={styles.infoItem}>• Tienes {slots} ranuras: suben +1 al cerrar un mes sin usar protectores con el inventario lleno (máximo 4).</Text>
            <Text style={styles.infoItem}>• Al usar un protector, tus ranuras vuelven a 2.</Text>
            {state.used_this_month > 0 && (
              <Text style={styles.infoItem}>• Este mes usaste {state.used_this_month} {state.used_this_month === 1 ? "protector" : "protectores"}.</Text>
            )}
          </View>
        </ScrollView>
      )}
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
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    offlineBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.star + "55",
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 16,
    },
    offlineText: { flex: 1, color: colors.textDim, fontSize: 13 },
    hero: { alignItems: "center", marginBottom: 20 },
    heroTitle: { fontSize: 18, fontWeight: "bold", color: colors.text, marginTop: 10 },
    heroText: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19, marginTop: 6 },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1,
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      gap: 4,
    },
    statValue: { fontSize: 20, fontWeight: "bold", color: colors.text },
    statLabel: { fontSize: 11, color: colors.textDim, textAlign: "center" },
    giftCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 16,
    },
    giftText: { color: colors.text, fontSize: 14, fontWeight: "600" },
    buyBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 16,
      marginBottom: 20,
    },
    buyBtnDisabled: { opacity: 0.5 },
    buyBtnText: { color: colors.onAccent, fontSize: 16, fontWeight: "bold" },
    infoCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 8 },
    infoTitle: { fontSize: 15, fontWeight: "bold", color: colors.text, marginBottom: 4 },
    infoItem: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
    error: { color: colors.textDim, textAlign: "center", marginTop: 40 },
  });
