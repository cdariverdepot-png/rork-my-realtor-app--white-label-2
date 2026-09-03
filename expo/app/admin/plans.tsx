import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Check, Sparkles } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { tint } from "@/constants/backdrops";
import { PLAN_TIERS, type PlanTier } from "@/constants/plans";
import { useAuth } from "@/contexts/AuthContext";
import { useSeats } from "@/contexts/SeatsContext";

const GOLD = brand.gold;
const LINE = "rgba(244,239,230,0.12)";
const SURFACE = "rgba(14,16,15,0.74)";

/** Where bespoke enquiries go. Sold outside the app, so a real mailto is fine. */
const BESPOKE_EMAIL = "hello@myrealtorapp.com";

/**
 * /admin/plans — the pricing page.
 *
 * Purchasing is not switched on yet: an in-app subscription has to go through
 * Apple's own purchase system, which is its own piece of work. The upgrade
 * buttons are therefore present and styled but deliberately inert. Bespoke is
 * a service delivered outside the app, so its button really does something.
 */
export default function Plans() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, hydrated } = useAuth();
  const { plan, used, limit, unlimited, atLimit, tracked } = useSeats();

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: 720,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [rise]);

  const onUpgrade = useCallback((tier: PlanTier) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    if (tier.contactOnly) {
      const subject = encodeURIComponent("Bespoke app enquiry");
      Linking.openURL(`mailto:${BESPOKE_EMAIL}?subject=${subject}`).catch((e) =>
        console.log("[plans] mailto", e)
      );
      return;
    }
    Alert.alert(
      "Not open yet",
      "Subscriptions go live shortly — we're finishing the payment side. Nothing changes on your account today, and your app keeps working exactly as it does now."
    );
  }, []);

  const statusLine = useMemo(() => {
    if (!tracked) return "You're on the showcase account — no limits apply.";
    if (unlimited) return "Unlimited client invitations.";
    return `${used} of ${limit} client invitations used.`;
  }, [tracked, unlimited, used, limit]);

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="adminBuild" intensity="deep" />
      <ModalChrome eyebrow="Plans" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 72 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: rise,
            transform: [
              {
                translateY: rise.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          }}
        >
          <View style={styles.header}>
            <Text style={styles.lede}>
              Build the whole thing for nothing. Pay only when your clients are
              actually in it.
            </Text>
            <View style={[styles.statusPill, atLimit && styles.statusPillFull]}>
              <View
                style={[styles.statusDot, atLimit && { backgroundColor: dark.amber }]}
              />
              <Text style={styles.statusText}>{statusLine}</Text>
            </View>
          </View>

          <View style={styles.tiers}>
            {PLAN_TIERS.map((tier) => (
              <TierCard
                key={tier.id}
                tier={tier}
                current={tier.id === plan}
                onPress={() => onUpgrade(tier)}
              />
            ))}
          </View>

          <Text style={styles.footnote}>
            Your contacts are always unlimited and always free — that's your own
            address book. Only clients who join your app count toward the limit,
            and someone who reinstalls or switches phones keeps the seat they
            already have.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function TierCard({
  tier,
  current,
  onPress,
}: {
  tier: PlanTier;
  current: boolean;
  onPress: () => void;
}) {
  const featured = tier.featured;
  const isFree = tier.id === "free";
  return (
    <View
      style={[
        styles.card,
        featured && styles.cardFeatured,
        current && !featured && styles.cardCurrent,
      ]}
    >
      {featured ? (
        <View style={styles.ribbon}>
          <Sparkles size={10} color={dark.bg} strokeWidth={2} />
          <Text style={styles.ribbonText}>RECOMMENDED</Text>
        </View>
      ) : null}

      <Text style={[styles.tierName, featured && { color: brand.goldLight }]}>
        {tier.name.toUpperCase()}
      </Text>
      <Text style={styles.tagline}>{tier.tagline}</Text>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{tier.price}</Text>
        <Text style={styles.priceNote}>{tier.priceNote}</Text>
      </View>
      {tier.altPrice ? <Text style={styles.altPrice}>{tier.altPrice}</Text> : null}

      <View style={styles.rule} />

      <View style={{ gap: 11 }}>
        {tier.features.map((f) => (
          <View key={f} style={styles.featureRow}>
            <View style={[styles.featureTick, featured && styles.featureTickGold]}>
              <Check
                size={9}
                color={featured ? dark.bg : brand.goldLight}
                strokeWidth={2.6}
              />
            </View>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      {isFree ? (
        <View style={styles.currentBadge}>
          <Text style={styles.currentBadgeText}>
            {current ? "YOUR CURRENT PLAN" : "INCLUDED"}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.cta,
            featured ? styles.ctaFeatured : styles.ctaQuiet,
            pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              featured ? { color: dark.bg } : { color: brand.goldLight },
            ]}
          >
            {tier.ctaLabel}
          </Text>
        </Pressable>
      )}

      {!isFree && !tier.contactOnly ? (
        <Text style={styles.soonNote}>Opens shortly</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  header: { paddingHorizontal: 24, marginBottom: 22 },
  lede: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 21,
    lineHeight: 29,
    letterSpacing: -0.3,
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  statusPillFull: { borderColor: "rgba(245,181,68,0.35)" },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: dark.green,
  },
  statusText: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  tiers: { paddingHorizontal: 16, gap: 14 },
  card: {
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  cardCurrent: { borderColor: "rgba(244,239,230,0.2)" },
  cardFeatured: {
    borderColor: "rgba(210,163,67,0.55)",
    backgroundColor: "rgba(24,20,12,0.82)",
    // The recommended tier sits a touch proud of the other two.
    marginHorizontal: -4,
    paddingVertical: 28,
    shadowColor: GOLD,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  ribbon: {
    position: "absolute",
    top: -1,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: GOLD,
  },
  ribbonText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 8.5,
    letterSpacing: 1.6,
  },
  tierName: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 10,
    letterSpacing: 3.4,
  },
  tagline: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.2,
    marginTop: 10,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginTop: 18,
  },
  price: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 32,
    letterSpacing: -0.8,
  },
  priceNote: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 12,
  },
  altPrice: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 11.5,
    marginTop: 5,
  },
  rule: {
    height: 1,
    backgroundColor: LINE,
    marginVertical: 18,
  },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  featureTick: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    marginTop: 1,
  },
  featureTickGold: { backgroundColor: GOLD, borderColor: GOLD },
  featureText: {
    flex: 1,
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.82)",
    fontSize: 13,
    lineHeight: 19,
  },
  cta: {
    marginTop: 22,
    paddingVertical: 15,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaFeatured: { backgroundColor: GOLD },
  ctaQuiet: {
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    backgroundColor: tint(GOLD, 0.07),
  },
  ctaText: { fontFamily: fonts.sansSemi, fontSize: 11.5, letterSpacing: 2.4 },
  soonNote: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 10.5,
    letterSpacing: 0.8,
    textAlign: "center",
    marginTop: 10,
  },
  currentBadge: {
    marginTop: 22,
    paddingVertical: 13,
    borderRadius: 999,
    alignItems: "center",
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  currentBadgeText: {
    fontFamily: fonts.sansSemi,
    color: brand.textOnDarkMuted,
    fontSize: 10.5,
    letterSpacing: 2.2,
  },
  footnote: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 11.5,
    lineHeight: 18,
    marginHorizontal: 24,
    marginTop: 26,
  },
});
