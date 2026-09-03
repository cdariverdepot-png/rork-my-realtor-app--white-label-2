import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import Svg, { Path } from "react-native-svg";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Animated cursive signature — traces itself in on mount.
 * Cosmetic, sits beside the hero byline. Uses a stylized
 * single-stroke path that works for any realtor name.
 */
export default function SignatureStroke({
  color = "#EBC776",
  width = 130,
  height = 44,
  duration = 1800,
}: {
  color?: string;
  width?: number;
  height?: number;
  duration?: number;
}) {
  // Pre-measured: total path length close to 320 units for the path below.
  const LENGTH = 340;
  const dash = useRef(new Animated.Value(LENGTH)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(dash, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, 350);
    return () => clearTimeout(t);
  }, [dash, duration]);

  const d = "M6 48 C 14 18, 30 14, 32 36 C 33 50, 22 56, 26 44 C 30 30, 46 22, 54 38 C 60 50, 50 56, 52 44 C 56 30, 70 30, 74 44 C 76 52, 86 36, 96 28 C 100 24, 96 50, 104 44 C 116 36, 122 22, 132 36 C 138 46, 128 56, 134 44 C 142 28, 158 28, 168 38 L 188 38";

  // On web, Animated.createAnimatedComponent(Path) leaks RN-only props
  // (like `collapsable`) onto the DOM, causing React warnings. Render a
  // static stroke there — the animation is a small cosmetic flourish.
  if (Platform.OS === "web") {
    return (
      <View style={{ width, height }}>
        <Svg width={width} height={height} viewBox="0 0 200 70">
          <Path
            d={d}
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
    );
  }

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox="0 0 200 70">
        <AnimatedPath
          d={d}
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={LENGTH}
          strokeDashoffset={dash}
        />
      </Svg>
    </View>
  );
}
