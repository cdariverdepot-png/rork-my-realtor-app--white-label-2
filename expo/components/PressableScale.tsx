import React, { useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** Press scale (0.92 – 1). */
  scaleTo?: number;
  /** Haptic strength on press in. */
  haptic?: "light" | "medium" | "selection" | "none";
  children?: React.ReactNode;
};

/**
 * Pressable wrapper with a spring scale + haptic — the small luxury
 * micro-interaction we use across primary/secondary CTAs.
 */
export default function PressableScale({
  style,
  scaleTo = 0.97,
  haptic = "selection",
  onPressIn,
  onPressOut,
  children,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 7,
      tension: 220,
    }).start();

  const fire = () => {
    if (Platform.OS === "web" || haptic === "none") return;
    if (haptic === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (haptic === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.selectionAsync();
  };

  return (
    <Pressable
      {...rest}
      style={style}
      onPressIn={(e) => {
        spring(scaleTo);
        fire();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring(1);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={{ transform: [{ scale }], flexGrow: 1 }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
