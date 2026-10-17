import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { AccessibilityInfo, Animated } from "react-native";
import ActivityChart from "../ActivityChart";

const colors = {
  accent: "#7153ad",
  calendarComplete: "#42a5f5",
  surfaceAlt: "#e6e6ee",
  textMuted: "#585858",
};

const data = [{ label: "Ene", value: 1 }];

describe("ActivityChart motion preference", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows bars immediately without animation when reduced motion is enabled", async () => {
    const removeListener = jest.fn();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: removeListener });
    const timing = jest.spyOn(Animated, "timing");
    let chart;

    await act(async () => {
      chart = TestRenderer.create(<ActivityChart data={data} colors={colors} />);
      await Promise.resolve();
    });

    expect(timing).not.toHaveBeenCalled();
    act(() => chart.unmount());
    expect(removeListener).toHaveBeenCalled();
  });

  it("stops running bar animations when reduced motion is enabled", async () => {
    let onMotionChanged;
    const animation = { start: jest.fn(), stop: jest.fn() };
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_event, listener) => {
      onMotionChanged = listener;
      return { remove: jest.fn() };
    });
    const timing = jest.spyOn(Animated, "timing").mockReturnValue(animation);
    let chart;

    await act(async () => {
      chart = TestRenderer.create(<ActivityChart data={data} colors={colors} />);
      await Promise.resolve();
    });
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ useNativeDriver: true }));
    expect(animation.start).toHaveBeenCalled();

    act(() => onMotionChanged(true));

    expect(animation.stop).toHaveBeenCalled();
    expect(timing).toHaveBeenCalledTimes(1);
    act(() => chart.unmount());
  });
});
