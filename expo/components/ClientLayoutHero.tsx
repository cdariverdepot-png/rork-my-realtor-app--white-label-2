import React, { useState } from "react";
import { Animated, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import PortraitImage from "./PortraitImage";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Brand } from "@/contexts/BrandContext";
import { DEFAULT_CLIENT_LAYOUT, type ClientLayoutId } from "@/constants/clientLayouts";

import { useThemeMotion } from "@/hooks/useThemeMotion";
import { imagePosition } from "@/lib/themeImages";

const designs: Partial<Record<ClientLayoutId, {
  background: string; foreground: string; accent: string; align: "left" | "center";
  image: "full" | "right" | "top" | "circle"; eyebrow: string;
}>> = {
  "private-collection": { background: "#151312", foreground: "#F7F1EA", accent: "#C7A680", align: "left", image: "right", eyebrow: "PRIVATE REAL ESTATE" },
  "coastal-personal": { background: "#F8F4EF", foreground: "#1D2526", accent: "#A67F52", align: "left", image: "right", eyebrow: "A PERSONAL WELCOME" },
  "modern-editorial": { background: "#191818", foreground: "#FCF6F0", accent: "#D4856B", align: "left", image: "full", eyebrow: "FIND MORE THAN A HOME" },
  "advisor-journal": { background: "#111211", foreground: "#F4F0E9", accent: "#B99B71", align: "left", image: "top", eyebrow: "A PERSONAL INTRODUCTION" },
  "portrait-statement": { background: "#231B17", foreground: "#FFFFFF", accent: "#E7BE93", align: "center", image: "full", eyebrow: "AN INTRODUCTION" },
  "warm-concierge": { background: "#302A23", foreground: "#FCF4EA", accent: "#D7A977", align: "left", image: "circle", eyebrow: "WELCOME HOME" },
};

export default function ClientLayoutHero({ brand, scrollY }: { brand: Brand; scrollY?: Animated.Value }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const layout = brand.layoutId ?? DEFAULT_CLIENT_LAYOUT;
  const design = designs[layout] ?? designs[DEFAULT_CLIENT_LAYOUT]!;
  const [heroHeight, setHeroHeight] = useState(740);
  const measured = React.useRef(false);
  const motion = useThemeMotion(scrollY, heroHeight, false, 24);
  // Overscan covers upward travel + mild push scale inside the clip frame.
  const imageStyle = { top: -40, bottom: -40, transform: [{ translateY: motion.imgTranslate }, { scale: motion.imgScale }] };
  const measure = (e: import("react-native").LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    // Freeze after first real measure so layout thrash cannot remint parallax nodes.
    if (!measured.current && next > 0) { measured.current = true; setHeroHeight(next); }
  };
  const realtor = brand.realtor;
  const firstName = realtor.name.split(/\s+/)[0] || "your realtor";
  const headline = realtor.heroMessage || realtor.tagline || `Welcome to ${realtor.name}`;
  const portrait = brand.portraitUrl;
  const contact = () => {
    if (realtor.phone) void Linking.openURL(`tel:${realtor.phone.replace(/[^+\d]/g, "")}`);
    else if (realtor.email) void Linking.openURL(`mailto:${realtor.email}`);
    else router.push("/message");
  };
  const action = (label: string, onPress: () => void, outline = false) =>
    <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingVertical: 15, paddingHorizontal: 20,
      backgroundColor: outline ? "transparent" : design.accent, borderWidth: 1, borderColor: design.accent,
      borderRadius: layout === "coastal-personal" || layout === "warm-concierge" ? 24 : 6,
      alignSelf: design.align === "center" ? "center" : "flex-start", marginTop: 12 }}>
      <Text style={{ color: outline ? design.foreground : "#151515", fontWeight: "700", letterSpacing: 0.8 }}>{label}</Text>
    </Pressable>;

  const masthead = <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
    <View><Text style={{ color: design.accent, fontSize: 27, fontFamily: "PlayfairDisplay_500Medium" }}>
      {realtor.monogram || realtor.name.split(" ").map(word => word[0]).join("").slice(0, 2)}
    </Text><Text style={{ color: design.foreground, letterSpacing: 2, fontSize: 11, marginTop: 4 }}>
      {(realtor.brandName || realtor.name).toUpperCase()}</Text></View>
    <Pressable onPress={contact} accessibilityRole="button" style={{ borderWidth: 1, borderColor: design.accent,
      padding: 11, borderRadius: 30 }}><Text style={{ color: design.foreground }}>Contact</Text></Pressable>
  </View>;
  const message = <Animated.View style={{ opacity: motion.contentOpacity, transform: [{ translateY: motion.contentTranslate }], alignItems: design.align === "center" ? "center" : "flex-start" }}>
    <Text style={{ color: design.accent, letterSpacing: 2.5, fontSize: 11, marginBottom: 13 }}>{design.eyebrow}</Text>
    <Text style={{ color: design.foreground, fontSize: layout === "portrait-statement" ? 47 : 42,
      lineHeight: layout === "portrait-statement" ? 51 : 47, fontFamily: "PlayfairDisplay_500Medium",
      textAlign: design.align, maxWidth: 560 }}>{headline}</Text>
    <Text style={{ color: design.foreground, opacity: 0.85, lineHeight: 23,
      textAlign: design.align, maxWidth: 440, marginTop: 18 }}>
      {realtor.welcomeNote || `${firstName} is here to help you find your next home in ${realtor.city}.`}
    </Text>
    {action(layout === "advisor-journal" ? "Explore my approach" : "Find your home", () => router.push("/listings"))}
    {layout !== "coastal-personal" && action(`Message ${firstName}`, contact, true)}
  </Animated.View>;

  if (design.image === "right") return <View onLayout={measure} style={{ overflow: "hidden", minHeight: 690, backgroundColor: design.background,
    paddingTop: insets.top + 25 }}>
    {portrait ? <View style={[{ position: "absolute", width: "67%", height: "92%", right: 0, top: 58 }, { overflow: "hidden" }]}><Animated.View collapsable={false} style={[StyleSheet.absoluteFill, imageStyle]}><PortraitImage uri={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={imagePosition(brand.theme, brand.layoutId)} priority="high" /></Animated.View></View> : null}
    <></>
    <Animated.View style={{ paddingHorizontal: 26, opacity: motion.topBarOpacity }}>{masthead}</Animated.View>
    <View style={{ paddingHorizontal: 26, paddingTop: 75, paddingBottom: 95, width: "82%" }}>{message}</View>
  </View>;

  if (design.image === "top") return <View onLayout={measure} style={{ overflow: "hidden", backgroundColor: design.background, paddingTop: insets.top + 24 }}>
    <Animated.View style={{ paddingHorizontal: 26, opacity: motion.topBarOpacity }}>{masthead}</Animated.View>
    {portrait ? <View style={[{ marginTop: 28, height: 330, width: "100%" }, { overflow: "hidden" }]}><Animated.View collapsable={false} style={[StyleSheet.absoluteFill, imageStyle]}><PortraitImage uri={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={imagePosition(brand.theme, brand.layoutId)} priority="high" /></Animated.View></View> : null}
    <View style={{ padding: 28, paddingTop: 36 }}>{message}</View>
  </View>;

  if (design.image === "circle") return <View onLayout={measure} style={{ overflow: "hidden", backgroundColor: design.background,
    paddingTop: insets.top + 25, paddingHorizontal: 26, paddingBottom: 60, minHeight: 740 }}>
    {masthead}
    {portrait ? <View style={[{ width: 220, height: 220, borderRadius: 110,
      alignSelf: "center", marginTop: 34, borderWidth: 2, borderColor: design.accent }, { overflow: "hidden" }]}><Animated.View collapsable={false} style={[StyleSheet.absoluteFill, imageStyle]}><PortraitImage uri={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={imagePosition(brand.theme, brand.layoutId)} priority="high" /></Animated.View></View> : null}
    <View style={{ marginTop: 36 }}>{message}</View>
  </View>;

  return <View onLayout={measure} style={{ overflow: "hidden", minHeight: layout === "portrait-statement" ? 830 : 740,
    backgroundColor: design.background, justifyContent: "space-between", paddingTop: insets.top + 25 }}>
    {portrait ? <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}><Animated.View collapsable={false} style={[StyleSheet.absoluteFill, imageStyle]}><PortraitImage uri={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={imagePosition(brand.theme, brand.layoutId)} priority="high" /></Animated.View></View> : null}
    <></>
    <Animated.View style={{ paddingHorizontal: 26, opacity: motion.topBarOpacity }}>{masthead}</Animated.View>
    <View style={{ padding: layout === "portrait-statement" ? 34 : 26, paddingBottom: 70 }}>{message}</View>
  </View>;
}
