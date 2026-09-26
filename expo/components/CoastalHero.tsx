import React, { useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageCircle, ArrowRight } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import { useThemeMotion } from "@/hooks/useThemeMotion";
import { imagePosition } from "@/lib/themeImages";

/** Coastal presentation only: all identity and photography come from canonical content. */
export default function CoastalHero({ brand, scrollY }: { brand: Brand; scrollY?: Animated.Value }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const [height, setHeight] = useState(700);
  const motion = useThemeMotion(scrollY, height, false, 24);
  const r = brand.realtor;
  const portrait = brand.portraitUrl?.trim();
  // Large text and narrow phones use a stacked composition, not clipped overlay copy.
  const stacked = width < 370 || fontScale > 1.25;
  const name = r.name.trim();
  const headline = r.heroMessage?.trim() || r.tagline?.trim() || name;
  const firstName = name.split(/\s+/)[0];
  const message = () => router.push("/message");
  const photo = portrait ? <View style={stacked ? styles.stackedPhoto : styles.photoFrame}>
    <Animated.View style={[StyleSheet.absoluteFill, { top: -32, bottom: -32,
      transform: [{ translateY: motion.imgTranslate }, { scale: motion.imgScale }] }]}>
      <Image source={{ uri: portrait }} contentFit="cover"
        contentPosition={imagePosition(brand.theme, brand.layoutId)} style={StyleSheet.absoluteFill}
        accessibilityLabel={name ? `Portrait of ${name}` : "Realtor portrait"} />
    </Animated.View>
  </View> : null;
  return <View onLayout={e => setHeight(e.nativeEvent.layout.height)}
    style={[styles.root, { paddingTop: insets.top + 24, minHeight: portrait && !stacked ? 720 : undefined }]}>
    {!stacked && photo}
    {!stacked && portrait && <></>}
    <View style={styles.masthead}>
      <View style={styles.identity}>
        {!!r.monogram?.trim() && <Text style={styles.monogram}>{r.monogram}</Text>}
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>{r.brandName?.trim() || name}</Text>
          {!!r.brandSub?.trim() && <Text style={styles.sub}>{r.brandSub}</Text>}
        </View>
      </View>
      <Pressable onPress={message} accessibilityRole="button" accessibilityLabel="Message your realtor"
        style={({ pressed }) => [styles.contact, pressed && { opacity: 0.7 }]}>
        <MessageCircle color="#806039" size={20} />
      </Pressable>
    </View>
    {stacked && photo}
    <Animated.View style={[styles.copy, { width: stacked || !portrait ? "100%" : "65%",
      opacity: motion.contentOpacity, transform: [{ translateY: motion.contentTranslate }] }]}>
      {!!r.heroEyebrow?.trim() && <Text style={styles.eyebrow}>{r.heroEyebrow}</Text>}
      {!!headline && <Text style={styles.headline}>{headline}</Text>}
      <View style={styles.rule} />
      {!!r.welcomeNote?.trim() && <Text style={styles.body}>{r.welcomeNote}</Text>}
      {!!name && <Text style={styles.signature}>{name}</Text>}
      {!!r.title?.trim() && <Text style={styles.sub}>{r.title}</Text>}
      <Pressable onPress={message} accessibilityRole="button"
        style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}>
        <Text style={styles.primaryText}>{firstName ? `Message ${firstName}` : "Message your realtor"}</Text>
        <MessageCircle size={17} color="#FFFFFF" />
      </Pressable>
      <Pressable onPress={() => router.push("/listings")} accessibilityRole="button" style={styles.secondary}>
        <Text style={styles.secondaryText}>{r.primaryCta?.trim() || "Explore homes"}</Text>
        <ArrowRight size={18} color="#614829" />
      </Pressable>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#F8F4EF", overflow: "hidden", paddingBottom: 50 },
  photoFrame: { position: "absolute", top: 84, bottom: 0, right: 0, width: "68%", overflow: "hidden" },
  stackedPhoto: { height: 300, marginHorizontal: 24, marginTop: 24, borderRadius: 24, overflow: "hidden" },
  masthead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24 },
  identity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  monogram: { fontFamily: "CormorantGaramond_500Medium", fontSize: 38, color: "#927043" },
  brand: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 2, color: "#18242A" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 10, letterSpacing: 1.5, lineHeight: 17, color: "#685337", marginTop: 5 },
  contact: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: "#D8C9B6", backgroundColor: "#FBF8F2", alignItems: "center", justifyContent: "center" },
  copy: { paddingHorizontal: 24, paddingTop: 60 },
  eyebrow: { fontFamily: "Inter_500Medium", fontSize: 10, lineHeight: 17, letterSpacing: 1.8, color: "#685337", marginBottom: 16 },
  headline: { fontFamily: "CormorantGaramond_500Medium", fontSize: 43, lineHeight: 45, color: "#17262D", letterSpacing: -1 },
  rule: { height: 1, width: 48, backgroundColor: "#AC8753", marginVertical: 20 },
  body: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 21, color: "#293A40" },
  signature: { fontFamily: "CormorantGaramond_500Medium_Italic", fontSize: 28, color: "#806039", marginTop: 22 },
  primary: { marginTop: 26, backgroundColor: "#806039", borderRadius: 9, padding: 15, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9 },
  primaryText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19, color: "#FFFFFF" },
  secondary: { minHeight: 48, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  secondaryText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 18, color: "#614829" },
});
