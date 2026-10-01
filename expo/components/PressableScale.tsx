import React, { useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

/** Placement-only keys that stay on the outer touch target. */
const OUTER_KEYS = new Set(["flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf", "position", "top", "left", "right", "bottom", "zIndex", "opacity", "display"]);
/** Size keys both layers need so the visible button fills its slot. */
const SHARED_KEYS = new Set(["width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "aspectRatio"]);

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
  const opacity = useRef(new Animated.Value(1)).current;

  const spring = (pressed: boolean) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: pressed ? scaleTo : 1,
        useNativeDriver: true,
        friction: 7,
        tension: 220,
      }),
      Animated.timing(opacity, {
        toValue: pressed ? 0.82 : 1,
        duration: pressed ? 60 : 140,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const fire = () => {
    if (Platform.OS === "web" || haptic === "none") return;
    if (haptic === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (haptic === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.selectionAsync();
  };

  // The button's own look (row layout, padding, fill, radius, border) belongs on
  // the animated inner view that holds the icon and label; only placement
  // (margins, flex sizing, position, opacity) stays on the outer touch target.
  // Previously everything sat on the outer layer, so icons and labels stacked
  // and drifted off-centre inside it.
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle & Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (OUTER_KEYS.has(key) || key.startsWith("margin")) outer[key] = value;
    else inner[key] = value;
    if (SHARED_KEYS.has(key)) outer[key] = value;
  }

  return (
    <Pressable
      {...rest}
      style={outer as ViewStyle}
      hitSlop={rest.hitSlop ?? 10}
      onPressIn={(e) => {
        spring(true);
        fire();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring(false);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[{ flexGrow: 1 }, inner as ViewStyle, { opacity, transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
