import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";

export default function ActivityChart({ data = [], colors, showValues = true, height = 150, formatValue, maxValue }) {
  const scaleMax = maxValue && maxValue > 0 ? maxValue : Math.max(1, ...data.map((d) => d.value));
  const barArea = height - 30;
  const styles = createStyles(colors);

  return (
    <View style={[styles.row, { height }]}>
      {data.map((d, i) => (
        <BarColumn
          key={i}
          d={d}
          maxValue={scaleMax}
          barArea={barArea}
          colors={colors}
          styles={styles}
          showValue={showValues}
          formatValue={formatValue}
          delay={i * 35}
        />
      ))}
    </View>
  );
}

function BarColumn({ d, maxValue, barArea, colors, styles, showValue, formatValue, delay }) {
  const value = Number(d.value) || 0;
  const barHeight = Math.max(Math.min(value / maxValue, 1) * (barArea - 6), value > 0 ? 4 : 2);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: barHeight,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [barHeight, delay, progress]);

  return (
    <View style={styles.col}>
      {showValue ? (
        <Text style={[styles.value, value > 0 && styles.valueActive]} numberOfLines={1}>
          {value > 0 ? (formatValue ? formatValue(value) : value) : ""}
        </Text>
      ) : null}
      <View style={[styles.track, { height: barArea, backgroundColor: colors.surfaceAlt }]}>
        <Animated.View
          style={[
            styles.bar,
            { backgroundColor: d.met ? colors.calendarComplete : colors.accent, height: progress },
          ]}
        />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {d.label}
      </Text>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "flex-start" },
    col: { flex: 1, alignItems: "center" },
    value: { fontSize: 9, color: colors.textMuted, marginBottom: 2 },
    valueActive: { color: colors.accent, fontWeight: "bold" },
    track: { width: "62%", borderRadius: 6, overflow: "hidden", justifyContent: "flex-end" },
    bar: { width: "100%" },
    label: { fontSize: 9, color: colors.textMuted, marginTop: 3 },
  });