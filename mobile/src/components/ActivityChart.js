import { useMemo, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, ScrollView, useWindowDimensions, AccessibilityInfo } from "react-native";

export default function ActivityChart({ data = [], colors, showValues = true, height = 150, formatValue, maxValue }) {
  const scaleMax = maxValue && maxValue > 0 ? maxValue : Math.max(1, ...data.map((d) => d.value));
  const { fontScale } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(null);
  const fontSize = 11;
  const textBand = Math.max(30, (fontSize * 2 + 8) * fontScale);
  const chartHeight = height + textBand - 30;
  const barArea = chartHeight - textBand;
  const maxTextLength = Math.max(1, ...data.map((d) => {
    const labelLength = String(d.label ?? "").length;
    if (!showValues || Number(d.value) <= 0) return labelLength;
    const valueText = formatValue ? formatValue(Number(d.value)) : d.value;
    return Math.max(labelLength, String(valueText).length);
  }));
  const minColumnWidth = fontScale > 1
    ? Math.ceil(maxTextLength * fontSize * fontScale * 0.55 + 12)
    : 0;
  const contentWidth = minColumnWidth * data.length;
  const shouldScroll = fontScale > 1 && viewportWidth > 0 && contentWidth > viewportWidth;
  const styles = useMemo(() => createStyles(colors), [colors]);
  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      receivedChange = true;
      setReduceMotionEnabled(enabled);
    });

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active && !receivedChange) setReduceMotionEnabled(enabled);
      })
      .catch(() => {
        if (active && !receivedChange) setReduceMotionEnabled(false);
      });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  const onLayout = (event) => {
    const width = event.nativeEvent.layout.width;
    setViewportWidth((current) => (Math.abs(current - width) > 0.5 ? width : current));
  };
  const columns = data.map((d, i) => (
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
      columnWidth={shouldScroll ? minColumnWidth : undefined}
      reduceMotionEnabled={reduceMotionEnabled}
    />
  ));
  const chart = (
    <View style={[styles.row, { height: chartHeight, width: shouldScroll ? contentWidth : undefined }]}>
      {columns}
    </View>
  );

  return (
    shouldScroll ? (
      <ScrollView
        horizontal
        style={{ height: chartHeight }}
        onLayout={onLayout}
        showsHorizontalScrollIndicator
      >
        {chart}
      </ScrollView>
    ) : (
      <View style={{ height: chartHeight }} onLayout={onLayout}>
        {chart}
      </View>
    )
  );
}

function BarColumn({ d, maxValue, barArea, colors, styles, showValue, formatValue, delay, columnWidth, reduceMotionEnabled }) {
  const value = Number(d.value) || 0;
  const barHeight = Math.max(Math.min(value / maxValue, 1) * (barArea - 6), value > 0 ? 4 : 2);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotionEnabled == null) return;
    progress.setValue(reduceMotionEnabled ? 1 : 0);
    if (reduceMotionEnabled) return;

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [barHeight, delay, progress, reduceMotionEnabled]);

  return (
    <View style={[styles.col, columnWidth ? { flex: 0, width: columnWidth } : null]}>
      {showValue ? (
        <Text allowFontScaling style={[styles.value, value > 0 && styles.valueActive]} numberOfLines={1}>
          {value > 0 ? (formatValue ? formatValue(value) : value) : ""}
        </Text>
      ) : null}
      <View
  style={[styles.track, { height: barArea, backgroundColor: colors.surfaceAlt }]}
  accessible={false}
  importantForAccessibility="no-hide-descendants"
>
        <Animated.View
          style={[
            styles.bar,
            {
              backgroundColor: d.met ? colors.calendarComplete : colors.accent,
              height: barHeight,
              transformOrigin: "bottom",
              transform: [{ scaleY: progress }],
            },
          ]}
        />
      </View>
      <Text allowFontScaling style={styles.label} numberOfLines={1}>
        {d.label}
      </Text>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "flex-start" },
    col: { flex: 1, alignItems: "center" },
    value: { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
    valueActive: { color: colors.accent, fontWeight: "bold" },
    track: { width: "62%", borderRadius: 6, overflow: "hidden", justifyContent: "flex-end" },
    bar: { width: "100%" },
    label: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  });
