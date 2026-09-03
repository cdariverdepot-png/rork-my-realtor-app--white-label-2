import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { ArrowRight, Compass, FilePlus2, Sparkles } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useListings } from "@/contexts/ListingsContext";
import { useOnboarding } from "@/contexts/OnboardingContext";

/**
 * /admin/build — the "Ready to build your app?" fork shown right after a realtor
 * creates their account. Two paths, both fully editable afterwards:
 *  1. Start from scratch — a clean, empty template branded to them.
 *  2. Guided walkthrough — prefilled placeholder content + the quick tour.
 */
export default function BuildYourApp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, hydrated: authHydrated, session } = useAuth();
  const { seedPlaceholders } = useBrand();
  const { seedDemo } = useListings();
  const { reopen } = useOnboarding();

  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(22)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAdmin) router.replace("/portal");
  }, [authHydrated, isAdmin, router]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [fade, lift, glow]);

  const firstName = useMemo(
    () => (session?.name ?? "there").split(" ")[0] ?? "there",
    [session]
  );

  const startScratch = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    // Brand/listings already start neutral & empty for real realtors. Just go.
    router.replace("/admin/ready");
  };

  const startGuided = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Prefill editable placeholder content and queue the quick tour on the dashboard.
    seedPlaceholders();
    seedDemo();
    reopen();
    router.replace("/admin/ready");
  };

  if (!authHydrated) {
    return <View style={[styles.root, { backgroundColor: brand.nightDeep }]} />;
  }

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[brand.nightDeep, brand.night, brand.nightDeep]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
      >
        <LinearGradient
          colors={["rgba(210,163,67,0.5)", "rgba(210,163,67,0)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.content,
          { opacity: fade, transform: [{ translateY: lift }], paddingTop: insets.top + 72, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Text style={styles.eyebrow}>WELCOME, {firstName.toUpperCase()}</Text>
        <Text style={styles.title}>Ready to build your app?</Text>
        <Text style={styles.sub}>
          Pick a starting point — you can change everything later, right inside your app.
        </Text>

        <View style={styles.cards}>
          <Pressable
            onPress={startScratch}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
          >
            <View style={styles.cardIcon}>
              <FilePlus2 size={20} color={brand.goldLight} strokeWidth={1.6} />
            </View>
            <Text style={styles.cardTitle}>Start from scratch</Text>
            <Text style={styles.cardBody}>
              A clean, empty template branded to you. Add your listings, note, and details as you go.
            </Text>
            <View style={styles.cardCta}>
              <Text style={styles.cardCtaText}>BLANK TEMPLATE</Text>
              <ArrowRight size={14} color={brand.goldLight} strokeWidth={1.8} />
            </View>
          </Pressable>

          <Pressable
            onPress={startGuided}
            style={({ pressed }) => [styles.card, styles.cardFeatured, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
          >
            <View style={styles.featuredTag}>
              <Sparkles size={11} color={brand.nightDeep} strokeWidth={1.8} />
              <Text style={styles.featuredTagText}>RECOMMENDED</Text>
            </View>
            <View style={[styles.cardIcon, styles.cardIconFeatured]}>
              <Compass size={20} color={brand.gold} strokeWidth={1.6} />
            </View>
            <Text style={styles.cardTitle}>Guided walkthrough</Text>
            <Text style={styles.cardBody}>
              We prefill example listings and copy so you can see the shape of your app, then edit each piece to make it yours.
            </Text>
            <View style={styles.cardCta}>
              <Text style={[styles.cardCtaText, { color: brand.gold }]}>PREFILLED + QUICK TOUR</Text>
              <ArrowRight size={14} color={brand.gold} strokeWidth={1.8} />
            </View>
          </Pressable>
        </View>

        <Text style={styles.foot}>Both paths are fully customizable — nothing here is permanent.</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.nightDeep },
  glow: {
    position: "absolute",
    top: "8%",
    left: "-20%",
    right: "-20%",
    height: 480,
    borderRadius: 240,
    overflow: "hidden",
  },
  content: { flex: 1, paddingHorizontal: 24 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 4,
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  sub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.62)",
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 34,
  },
  cards: { gap: 16 },
  card: {
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 20,
    borderRadius: 14,
  },
  cardFeatured: {
    borderColor: "rgba(210,163,67,0.55)",
    backgroundColor: "rgba(210,163,67,0.08)",
  },
  featuredTag: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: brand.goldLight,
  },
  featuredTagText: {
    fontFamily: fonts.sansSemi,
    color: brand.nightDeep,
    fontSize: 8.5,
    letterSpacing: 1.4,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: brand.nightDeep,
    borderWidth: 1,
    borderColor: brand.nightLine,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  cardIconFeatured: { borderColor: "rgba(210,163,67,0.5)" },
  cardTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 21,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  cardBody: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.6)",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  cardCta: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardCtaText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10.5,
    letterSpacing: 2,
  },
  foot: {
    fontFamily: fonts.serifItalic,
    color: "rgba(244,239,230,0.4)",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 28,
  },
});
