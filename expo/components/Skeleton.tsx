import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { brand } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";

const AnimatedGrad = Animated.createAnimatedComponent(LinearGradient);

/**
 * Branded shimmer skeleton — ivory base with a soft gold sheen
 * sweeping across. Use as a placeholder while content loads.
 */
export default function Skeleton({
  width,
  height,
  radius = 0,
  style,
  tone = "ivory",
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** "band" placeholders sit on the theme's dark band, "ivory" on the paper. */
  tone?: "ivory" | "band";
}) {
  const { theme } = useBrand();
  const x = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      })
    ).start();
  }, [x]);

  const translateX = x.interpolate({
    inputRange: [-1, 1],
    outputRange: [-220, 220],
  });

  const base = tone === "ivory" ? theme.surface.panel : theme.band.base;
  const sheen =
    tone === "ivory"
      ? ["rgba(244,239,230,0)", "rgba(212,185,137,0.35)", "rgba(244,239,230,0)"]
      : ["rgba(244,239,230,0)", "rgba(212,185,137,0.18)", "rgba(244,239,230,0)"];

  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: base, overflow: "hidden" },
        style,
      ]}
    >
      <AnimatedGrad
        colors={sheen as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
      />
    </View>
  );
}

export function ListingCardSkeleton() {
  const { theme } = useBrand();
  return (
    <View style={[s.card, { backgroundColor: theme.surface.panel }]}>
      <Skeleton width="100%" height={260} tone="band" />
      <View style={{ padding: 18, gap: 10 }}>
        <Skeleton width={80} height={10} />
        <Skeleton width="80%" height={22} />
        <Skeleton width="50%" height={14} />
      </View>
    </View>
  );
}

export function ListingDetailSkeleton() {
  const { theme } = useBrand();
  return (
    <View style={[d.root, { backgroundColor: theme.surface.paper }]}>
      <View style={d.hero}>
        <Skeleton width="100%" height={520} tone="band" />
        <View style={d.heroOverlay}>
          <Skeleton width={120} height={10} tone="band" />
          <View style={{ height: 14 }} />
          <Skeleton width="70%" height={36} tone="band" />
          <View style={{ height: 14 }} />
          <Skeleton width={140} height={20} tone="band" />
        </View>
      </View>
      <View style={[d.specs, { borderBottomColor: theme.surface.hairline }]}>
        <Skeleton width={70} height={14} />
        <Skeleton width={70} height={14} />
        <Skeleton width={70} height={14} />
      </View>
      <View style={[d.take, { backgroundColor: theme.band.base }]}>
        <Skeleton width={44} height={44} radius={22} tone="band" />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width={100} height={10} tone="band" />
          <Skeleton width="80%" height={14} tone="band" />
          <Skeleton width="95%" height={14} tone="band" />
          <Skeleton width="60%" height={14} tone="band" />
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, gap: 14, marginTop: 8 }}>
        <Skeleton width={80} height={10} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="100%" height={14} />
      </View>
    </View>
  );
}

const d = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.paper },
  hero: { width: "100%", height: 520 },
  heroOverlay: { position: "absolute", left: 24, right: 24, bottom: 28 },
  specs: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairline,
  },
  take: {
    flexDirection: "row",
    gap: 14,
    margin: 24,
    padding: 22,
    backgroundColor: brand.forest,
  },
});

const s = StyleSheet.create({
  card: { backgroundColor: brand.ivoryWarm, overflow: "hidden", marginLeft: 24, width: 280 },
});
