import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Check, Sparkles } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { tint } from "@/constants/backdrops";
import { CUSTOM_INQUIRY_URL, PLAN_TIERS, type PlanTier } from "@/constants/plans";
import { ANNUAL_EQUIVALENT } from "@/constants/subscriptionPricing";
import { APPLE_SUBSCRIPTION_IDS as APPLE_IDS } from "@/lib/appleSubscriptions";
import { exportRealtorData } from "@/lib/accountExport";
import { useAuth } from "@/contexts/AuthContext";
import { useSeats } from "@/contexts/SeatsContext";
import { useAppleSubscription } from "@/lib/useAppleSubscription";
import { serviceNoticeCopy } from "@/lib/serviceNotice";

const GOLD = brand.gold;
const LINE = "rgba(244,239,230,0.12)";
const SURFACE = "rgba(14,16,15,0.74)";

/** Existing plan page doubles as account management, including during inactivity. */
export default function Plans() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, hydrated, realtorId, session, logout } = useAuth();
  const seats = useSeats();
  const { plan, used, limit, unlimited, atLimit, tracked } = seats;
  useLocalSearchParams<{ checkout?: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Apple handles purchase, renewal, billing and management; the server verifies the result.
  const apple = useAppleSubscription(realtorId, tracked && session?.guestAccess !== true && session?.preview !== true, () => void seats.refresh());
  const notice = serviceNoticeCopy(seats.inactiveReason);

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
    if (tier.contactOnly) {
      if (Platform.OS !== "web") void Haptics.selectionAsync();
      void Linking.openURL(CUSTOM_INQUIRY_URL).catch(() => setMessage("Please email hello@myrealtorapp.com about your custom app."));
    } else {
      void apple.subscribe("month");
    }
  }, [apple.subscribe]);
  const exportData = useCallback(async () => {
    if (!realtorId || busy || !tracked) return;
    setBusy(true); setMessage(null);
    try {
      const content = JSON.stringify(await exportRealtorData(realtorId), null, 2);
      const filename = `my-realtor-export-${new Date().toISOString().slice(0,10)}.json`;
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        const file = new File(Paths.cache, filename); file.write(content);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json" });
        else throw new Error("File sharing is unavailable on this device.");
      }
    } catch(e) { setMessage(e instanceof Error ? e.message : "Export unavailable."); } finally { setBusy(false); }
  }, [realtorId, busy, tracked]);

  const statusLine = useMemo(() => {
    if (!tracked) return "You're on the showcase account — no limits apply.";
    if (!seats.loaded) return "Checking subscription status…";
    // Every state below comes from the verified Apple entitlement.
    if (!seats.active) return notice?.title ?? "Subscription inactive.";
    const until = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "");
    if (seats.status === "trial") {
      const left = seats.trialEnd ? Math.max(0, Math.ceil((Date.parse(seats.trialEnd) - Date.now()) / 86400000)) : null;
      return `7-day free trial${left === null ? "" : ` · ${left} ${left === 1 ? "day" : "days"} remaining`} · ${used} of ${limit} clients connected`;
    }
    if (seats.status === "grace_period") return `Billing retry · grace period until ${until(seats.serviceEnd)}`;
    if (seats.cancelAtPeriodEnd && seats.serviceEnd) return `Canceled — active until ${until(seats.serviceEnd)}`;
    return unlimited ? `Subscription active · ${used} clients connected` : "Subscription active.";
  }, [tracked, unlimited, used, limit, seats.loaded, seats.active, seats.status, seats.trialEnd, seats.serviceEnd, seats.cancelAtPeriodEnd, notice]);
  const displayedTiers = PLAN_TIERS;
  const date = seats.cancelAtPeriodEnd ? seats.serviceEnd : seats.renewalAt;
  const dateText = date ? new Date(date).toLocaleDateString() : null;

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
              Start a 7-day free trial through the App Store with up to three connected clients.
              It then renews at $49/month or $490/year unless canceled in your Apple account.
            </Text>
            <View style={[styles.statusPill, atLimit && styles.statusPillFull]}>
              <View
                style={[styles.statusDot, atLimit && { backgroundColor: dark.amber }]}
              />
              <Text style={styles.statusText}>{statusLine}</Text>
            </View>
            {tracked ? <>
              <Text style={styles.footnote}>{session?.email}{seats.everPaid ? ` · ${seats.interval === "year" ? "Annual" : "Monthly"} subscription · ${seats.status}` : " · Evaluation"}{dateText ? ` · ${seats.cancelAtPeriodEnd ? "Service ends" : "Renewal"} ${dateText}` : ""}</Text>
              {notice ? <Text style={styles.footnote}>{notice.body}</Text> : null}
              <Text style={styles.footnote}>Subscriptions are purchased and managed through Apple.</Text>
              {apple.configured ? <>
                <Pressable disabled={!!apple.busy} style={styles.cta} onPress={() => void apple.subscribe("month")}><Text style={[styles.ctaText, { color: brand.goldLight }]}>{apple.busy === "buy" ? "OPENING APP STORE…" : `SUBSCRIBE MONTHLY${apple.products[APPLE_IDS.month]?.displayPrice ? ` · ${apple.products[APPLE_IDS.month].displayPrice}` : ""}`}</Text></Pressable>
                {APPLE_IDS.year ? <Pressable disabled={!!apple.busy} style={styles.cta} onPress={() => void apple.subscribe("year")}><Text style={[styles.ctaText, { color: brand.goldLight }]}>{`SUBSCRIBE ANNUALLY${apple.products[APPLE_IDS.year]?.displayPrice ? ` · ${apple.products[APPLE_IDS.year].displayPrice}` : ""}`}</Text></Pressable> : null}
                <Pressable disabled={!!apple.busy} style={styles.cta} onPress={() => void apple.restore()}><Text style={[styles.ctaText, { color: brand.goldLight }]}>{apple.busy === "restore" ? "RESTORING…" : "RESTORE PURCHASES"}</Text></Pressable>
              </> : <Text style={styles.footnote}>{apple.storeKitAvailable ? "App Store subscription products are not configured in this build yet." : "Subscribe or restore your subscription in the My Realtor App for iPhone."}</Text>}
              <Pressable style={styles.cta} onPress={() => void apple.manage()}><Text style={[styles.ctaText, { color: brand.goldLight }]}>MANAGE SUBSCRIPTION</Text></Pressable>
              {apple.message ? <Text accessibilityRole="alert" style={styles.footnote}>{apple.message}</Text> : null}
              <Text style={styles.footnote}>Subscriptions renew automatically at the chosen interval until canceled. Annual billing charges $490 upfront. Cancellation keeps access through the paid service-end date.</Text>
              <Pressable disabled={busy} style={styles.cta} onPress={() => void seats.refresh()}><Text style={[styles.ctaText, { color: brand.goldLight }]}>REFRESH ACCOUNT STATUS</Text></Pressable>
              <Pressable disabled={busy} style={styles.cta} onPress={() => void exportData()}><Text style={[styles.ctaText, { color: brand.goldLight }]}>EXPORT MY DATA</Text></Pressable>
              <Text style={styles.footnote}>The JSON export includes your saved draft and published designs, listings, listing sources, contacts, client relationships, messages, document references, appointments and saved properties. It excludes passwords and billing credentials; document file contents are not included.</Text>
              <Pressable style={styles.cta} onPress={() => router.push("/reset-password")}><Text style={[styles.ctaText, { color: brand.goldLight }]}>PASSWORD & ACCOUNT ACCESS</Text></Pressable>
              <Pressable style={styles.cta} onPress={() => void logout().then(() => router.replace("/welcome"))}><Text style={[styles.ctaText, { color: brand.goldLight }]}>SIGN OUT</Text></Pressable>
              {message ? <Text accessibilityRole="alert" style={styles.footnote}>{message}</Text> : null}
            </> : null}
          </View>

          <View style={styles.tiers}>
            {displayedTiers.map((tier) => (
              <TierCard
                key={tier.id}
                tier={tier}
                current={tier.id === plan && seats.active}
                disabled={!tier.contactOnly && (busy || !tracked || session?.guestAccess === true || session?.preview === true || (seats.everPaid && seats.active))}
                onPress={() => onUpgrade(tier)}
              />
            ))}
          </View>

          <Text style={styles.footnote}>
            Contacts and pending invitations do not consume connected-client
            seats. Only authenticated clients who join your app count toward the limit,
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
  disabled,
  onPress,
}: {
  tier: PlanTier;
  current: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const featured = tier.featured;
  const isFree = tier.id === "evaluation";
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
            {current ? "YOUR CURRENT PLAN" : "FOR NEW ACCOUNTS"}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityState={{ disabled }}
          style={({ pressed }) => [
            styles.cta,
            disabled && { opacity: 0.45 },
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
            {tier.contactOnly ? tier.ctaLabel : current ? "CURRENT SUBSCRIPTION" : disabled ? "SUBSCRIPTION UNAVAILABLE" : "APP STORE SUBSCRIPTION"}
          </Text>
        </Pressable>
      )}

      {!isFree && !tier.contactOnly ? (
        <Text style={styles.soonNote}>Monthly and annual include the same standard features.</Text>
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
    flexWrap: "wrap",
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
