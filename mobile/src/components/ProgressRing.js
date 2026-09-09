import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
} from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function ProgressRing({
  percent,
  radius,
  borderWidth,
  color,
  trackColor,
  bgColor,
  style,
  children,
}) {
  const pct = Math.max(Math.min(100, percent), 0);
  const r = Math.max(radius - borderWidth / 2, 1);
  const circumference = 2 * Math.PI * r;

  const progress = useSharedValue(pct / 100);

  useEffect(() => {
    progress.value = withSpring(pct / 100, {
      damping: 18,
      stiffness: 120,
      mass: 0.8,
    });
  }, [pct, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      style={[
        styles.wrapper,
        { width: radius * 2, height: radius * 2 },
        style,
      ]}
    >
      <Svg width={radius * 2} height={radius * 2}>
        <Circle
          cx={radius}
          cy={radius}
          r={r}
          stroke={trackColor}
          strokeWidth={borderWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={radius}
          cy={radius}
          r={r}
          stroke={color}
          strokeWidth={borderWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          rotation="-90"
          origin={`${radius}, ${radius}`}
        />
      </Svg>
      <View
        style={[
          styles.inner,
          {
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: bgColor,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  inner: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
});