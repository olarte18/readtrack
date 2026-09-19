import { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
} from "react-native-reanimated";

export const TIER_COLORS = {
  bronze: "#D85A30",
  silver: "#C0C8D0",
  gold: "#EF9F27",
  special: "#cba6f7",
};

const CONFETTI_COLORS = ["#D85A30", "#C0C8D0", "#EF9F27", "#cba6f7", "#7ee787", "#42A5F5"];

const confettiSeed = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 7.3 + 5) % 90,
  delay: (i * 90) % 700,
  duration: 1400 + (i * 130) % 700,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 6 + (i % 3) * 3,
}));

const confettiStyle = { position: "absolute", top: 40, borderRadius: 2 };

function ConfettiPiece({ piece }) {
  const translateY = useSharedValue(-30);
  const rotate = useSharedValue(0);
  useEffect(() => {
    translateY.value = withDelay(
      piece.delay,
      withRepeat(
        withSequence(
          withTiming(600 + piece.duration, { duration: piece.duration }),
          withTiming(600 + piece.duration, { duration: 0 })
        ),
        piece.delay % 2 ? -1 : 2,
        false
      )
    );
    rotate.value = withDelay(piece.delay, withRepeat(withTiming(360, { duration: piece.duration }), -1, false));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
  }));
  return (
    <Animated.View
      style={[
        confettiStyle,
        { left: `${piece.left}%`, width: piece.size, height: piece.size, backgroundColor: piece.color },
        style,
      ]}
    />
  );
}

function Confetti() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {confettiSeed.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} />
      ))}
    </View>
  );
}

export function CelebrationModal({ items, onClose }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 9, stiffness: 140 });
    opacity.value = withSpring(1);
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Modal transparent visible={items.length > 0} animationType="none" onRequestClose={onClose}>
      <View style={styles.celebrateOverlay}>
        <Confetti />
        <Animated.View style={[styles.celebrateCard, { backgroundColor: colors.surface }, cardStyle]}>
          <View style={[styles.celebrateIconWrap, { backgroundColor: colors.star + "22" }]}>
            <Ionicons name="trophy" size={40} color={colors.star} />
          </View>
          <Text style={[styles.celebrateTitle, { color: colors.text }]}>
            {items.length === 1 ? "¡Nuevo logro desbloqueado!" : `¡${items.length} logros desbloqueados!`}
          </Text>
          <View style={styles.celebrateRow}>
            {items.slice(0, 3).map((item) => (
              <View key={`${item.code}:${item.tier}`} style={styles.celebrateItem}>
                <View
                  style={[
                    styles.celebrateIcon,
                    { borderColor: TIER_COLORS[item.tier] ?? colors.accent, backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <Ionicons name={item.icon} size={26} color={TIER_COLORS[item.tier] ?? colors.accent} />
                </View>
                <Text style={[styles.celebrateItemName, { color: colors.textMuted }]} numberOfLines={2}>
                  {item.name}
                </Text>
              </View>
            ))}
          </View>
          {items[0]?.leyenda && (
            <Text style={[styles.celebrateLeyenda, { color: colors.textMuted }]}>“{items[0].leyenda}”</Text>
          )}
          <TouchableOpacity style={[styles.celebrateBtn, { backgroundColor: colors.accent }]} onPress={onClose}>
            <Text style={[styles.celebrateBtnText, { color: colors.onAccent }]}>¡Genial!</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    celebrateOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    celebrateCard: {
      borderRadius: 20,
      padding: 24,
      width: "82%",
      maxWidth: 360,
      alignItems: "center",
    },
    celebrateIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.star + "44",
    },
    celebrateTitle: { fontSize: 18, fontWeight: "bold", textAlign: "center" },
    celebrateRow: { flexDirection: "row", gap: 12, marginTop: 18 },
    celebrateItem: { alignItems: "center", width: 84 },
    celebrateIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    celebrateItemName: { fontSize: 11, textAlign: "center", marginTop: 6 },
    celebrateLeyenda: {
      fontSize: 13,
      fontStyle: "italic",
      lineHeight: 19,
      textAlign: "center",
      marginTop: 16,
      paddingHorizontal: 8,
    },
    celebrateBtn: {
      marginTop: 20,
      borderRadius: 12,
      paddingHorizontal: 28,
      paddingVertical: 10,
      alignSelf: "stretch",
      alignItems: "center",
    },
    celebrateBtnText: { fontWeight: "bold", fontSize: 15 },
  });
