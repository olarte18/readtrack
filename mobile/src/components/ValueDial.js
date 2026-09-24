import { useState, useRef, useLayoutEffect, useMemo, useCallback } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../contexts/ThemeContext";

const ROW_HEIGHT = 56;
const VISIBLE_ROWS = 3;
const TOP_PAD = (ROW_HEIGHT * VISIBLE_ROWS - ROW_HEIGHT) / 2;

// Rueda vertical tipo odómetro: arriba los valores anteriores, abajo los
// siguientes; la fila del centro es el valor actual. Hace snap fila a fila,
// sin teclado. El highlight sigue el scroll en vivo pero el valor se notifica
// al padre una sola vez cuando la rueda se asienta (con un haptic sutil).
export default function ValueDial({ min, max, value, onChange, unit }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const safeMin = min;
  const safeMax = Math.max(safeMin, max);
  const data = useMemo(() => {
    const out = [];
    for (let i = safeMin; i <= safeMax; i++) out.push(i);
    return out;
  }, [safeMin, safeMax]);

  const initialIndex = Math.max(0, Math.min(value - safeMin, safeMax - safeMin));
  const [active, setActive] = useState(initialIndex);
  const committedIndex = useRef(initialIndex);
  const listRef = useRef(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  // Centra la fila actual al montar (el snap por offset vive en multiples de ROW_HEIGHT).
  useLayoutEffect(() => {
    listRef.current?.scrollToOffset({ offset: initialIndex * ROW_HEIGHT, animated: false });
  }, [initialIndex]);

  const getItemLayout = useCallback(
    (_, index) => ({ length: ROW_HEIGHT, offset: TOP_PAD + ROW_HEIGHT * index, index }),
    []
  );
  const keyExtractor = useCallback((item) => String(item), []);
  const snapOffsets = useMemo(() => data.map((_, i) => i * ROW_HEIGHT), [data]);

  const computeIndex = (offset) =>
    Math.max(0, Math.min(Math.round(offset / ROW_HEIGHT), dataRef.current.length - 1));

  // Solo anima el highlight: no toca al padre mientras el dedo se mueve.
  const handleScroll = (e) => {
    setActive(computeIndex(e.nativeEvent.contentOffset.y));
  };

  // Al asentar el snap: notifica el valor al padre una vez y vibra sutil.
  const handleSettle = (e) => {
    const index = computeIndex(e.nativeEvent.contentOffset.y);
    setActive(index);
    if (index === committedIndex.current) return;
    committedIndex.current = index;
    onChange?.(dataRef.current[index]);
    try {
      Haptics.selectionAsync();
    } catch {}
  };

  const renderItem = ({ item, index }) => {
    const dist = Math.abs(index - active);
    const isCenter = dist === 0;
    return (
      <View style={styles.row} pointerEvents="none">
        {isCenter && unit ? (
          <Text style={[styles.value, styles.valueActive]}>
            {item}
            <Text style={styles.unit}> {unit}</Text>
          </Text>
        ) : (
          <Text style={[styles.value, dist === 1 ? styles.valueNear : styles.valueFar]}>
            {item}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={data}
        horizontal={false}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        snapToOffsets={snapOffsets}
        bounces={false}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onScrollEndDrag={handleSettle}
        onMomentumScrollEnd={handleSettle}
        overScrollMode="never"
        initialNumToRender={15}
        maxToRenderPerBatch={12}
        windowSize={7}
        extraData={active}
        contentContainerStyle={styles.content}
        style={styles.list}
      />
      <View pointerEvents="none" style={[styles.centerBand, { borderColor: colors.accent }]}>
        <View style={[styles.centerLine, { backgroundColor: colors.accent }]} />
        <View style={[styles.centerLine, styles.centerLineBottom, { backgroundColor: colors.accent }]} />
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    wrap: {
      height: ROW_HEIGHT * VISIBLE_ROWS,
      width: "100%",
      alignSelf: "center",
      maxWidth: 200,
    },
    list: { width: "100%" },
    content: { paddingTop: TOP_PAD, paddingBottom: TOP_PAD },
    row: {
      height: ROW_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
    },
    value: { fontSize: 22, color: colors.textMuted, fontWeight: "600" },
    valueNear: { color: colors.textMuted, fontSize: 18, opacity: 0.85 },
    valueFar: { color: colors.textDim, fontSize: 15, opacity: 0.55 },
    valueActive: {
      fontSize: 30,
      color: colors.accent,
      fontWeight: "bold",
    },
    unit: { fontSize: 16, color: colors.accent, fontWeight: "600" },
    centerBand: {
      position: "absolute",
      top: TOP_PAD,
      left: 0,
      right: 0,
      height: ROW_HEIGHT,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.accent,
    },
    centerLine: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
    },
    centerLineBottom: { top: undefined, bottom: 0 },
  });