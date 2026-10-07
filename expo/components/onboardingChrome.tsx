import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import { brand, dark, fonts } from "@/constants/colors";
import { useReducedTransparency } from "@/hooks/useReducedTransparency";

const GLASS = "rgba(255,255,255,0.10)";
const GLASS_EDGE = "rgba(255,255,255,0.28)";
const IVORY = "rgba(244,239,230,0.92)";

/** One mark for every slide: an archway, not a house icon. */
export function OnboardingEmblem() {
  return (
    <View style={styles.emblem} accessibilityLabel="App emblem">
      <View style={styles.emblemGlow} />
      <Svg width={68} height={68} viewBox="0 0 68 68">
        <Circle cx="34" cy="34" r="28" stroke={brand.goldLight} strokeWidth="1.1" fill="none" />
        <Path
          d="M22 46 V30.5 C22 22.5 27.2 17.5 34 17.5 C40.8 17.5 46 22.5 46 30.5 V46"
          stroke={brand.gold}
          strokeWidth="1.35"
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M27.5 46 V32.2 C27.5 27.4 30.4 24.2 34 24.2 C37.6 24.2 40.5 27.4 40.5 32.2 V46"
          stroke={brand.goldLight}
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
          opacity={0.85}
        />
        <Path d="M24 46 H44" stroke={brand.goldLight} strokeWidth="1.15" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

export function GlassNavButton({
  label,
  icon,
  iconAfter,
  onPress,
  accessibilityLabel,
  hidden,
}: {
  label: string;
  icon: React.ReactNode;
  iconAfter?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  hidden?: boolean;
}) {
  const solid = useReducedTransparency();
  return (
    <Pressable
      onPress={onPress}
      disabled={hidden}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.pill, hidden && styles.pillHidden, Platform.OS === "web" ? ({ cursor: hidden ? "default" : "pointer" } as object) : null]}
    >
      {!solid && <BlurView pointerEvents="none" intensity={28} tint="dark" style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pillWash, solid && styles.pillSolid]} />
      <View pointerEvents="none" style={styles.pillRim} />
      <View style={styles.pillInner}>
        {!iconAfter && icon}
        <Text style={styles.pillText}>{label}</Text>
        {iconAfter && icon}
      </View>
    </Pressable>
  );
}

export function OnboardingDots({ count, index }: { count: number; index: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
      ))}
    </View>
  );
}

export function OnboardingNextButton({
  label,
  icon,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.nextOuter,
        pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
        Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null,
      ]}
    >
      <View style={styles.nextClip}>
        <LinearGradient
          colors={["#FBF6EC", "#F3E6CC", "#E7D3A4"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.nextSheen} />
        <NextShimmer />
        <View style={styles.nextInner}>
          <Text style={styles.nextText}>{label}</Text>
          {icon}
        </View>
      </View>
    </Pressable>
  );
}

function NextShimmer() {
  const travel = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(travel, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(travel, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(2400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [travel]);
  const translateX = travel.interpolate({
    inputRange: [0, 1],
    outputRange: [-width * 0.55, width * 1.05],
  });
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const next = e.nativeEvent.layout.width;
        if (next > 0 && Math.abs(next - width) > 1) setWidth(next);
      }}
    >
      <Animated.View style={[styles.shimmer, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,252,246,0.55)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  emblem: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
  },
  emblemGlow: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(210,163,67,0.10)",
  },
  pill: {
    width: 108,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS_EDGE,
    backgroundColor: GLASS,
  },
  pillHidden: {
    opacity: 0,
  },
  pillWash: {
    backgroundColor: "rgba(12,14,18,0.28)",
  },
  pillSolid: {
    backgroundColor: "rgba(14,16,20,0.72)",
  },
  pillRim: {
    position: "absolute",
    top: 0,
    left: 10,
    right: 10,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  pillInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pillText: {
    fontFamily: fonts.sansMedium,
    color: IVORY,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  dot: {
    width: 16,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(244,239,230,0.28)",
  },
  dotActive: {
    width: 28,
    backgroundColor: brand.goldLight,
  },
  nextOuter: {
    borderRadius: 32,
    shadowColor: "#E8C98A",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  nextClip: {
    height: 62,
    borderRadius: 31,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  nextSheen: {
    position: "absolute",
    top: 0,
    left: 18,
    right: 18,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  nextInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  nextText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 13,
    letterSpacing: 2.6,
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 110,
  },
});
