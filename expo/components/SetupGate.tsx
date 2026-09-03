import React, { useCallback } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ArrowRight, Check, LayoutDashboard, Lock } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import type { RequiredField } from "@/constants/sections";
import ScreenBackdrop from "./ScreenBackdrop";

/**
 * Shown in place of the client app while the required floor is unmet.
 *
 * The client experience used to render no matter how empty the profile was, so
 * a realtor mid-setup swiped across to a black hero, a nameless byline and
 * whatever placeholder copy happened to be lying around — and concluded the app
 * was broken. It also meant a half-built app could reach a real client.
 *
 * Withholding the page is the honest answer: there is no client experience yet,
 * because the facts it is made of do not exist. Rather than composing something
 * out of gaps, this names exactly what is missing and links straight to it.
 */
export default function SetupGate({
  missing,
  met,
  audience,
  onBack,
}: {
  missing: RequiredField[];
  met: RequiredField[];
  /**
   * "realtor" gets the checklist — it is their setup work. "client" gets a calm
   * holding message: the realtor's to-do list is not a client's business, and a
   * client can do nothing about it anyway.
   */
  audience: "realtor" | "client";
  /** Realtor-only escape back to the dashboard. */
  onBack?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const total = missing.length + met.length;

  const openField = useCallback(
    (href: string) => {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      router.push(href as never);
    },
    [router]
  );

  if (audience === "client") {
    return (
      <View style={styles.root}>
        <ScreenBackdrop screen="portal" intensity="deep" />
        <View style={[styles.clientWrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.lockWell}>
            <Lock size={20} color={brand.gold} strokeWidth={1.6} />
          </View>
          <Text style={styles.clientTitle}>Almost ready</Text>
          <Text style={styles.clientBody}>
            Your agent is putting the finishing touches on this space. It will open here as
            soon as they publish.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="adminBuild" intensity="deep" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>CLIENT APP · NOT YET LIVE</Text>
        <Text style={styles.title}>
          {missing.length === 1
            ? "One more thing before\nyour clients see this."
            : "A few more facts before\nyour clients see this."}
        </Text>
        <Text style={styles.sub}>
          Your client app is built from your own details. Until these are saved there is
          nothing to show — so we hold it back rather than publish a half-finished space.
        </Text>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(met.length / Math.max(total, 1)) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {met.length} of {total}
          </Text>
        </View>

        <View style={styles.list}>
          {missing.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => openField(f.href)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${f.label}`}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.rowDot} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{f.label}</Text>
                <Text style={styles.rowWhy}>{f.why}</Text>
              </View>
              <ArrowRight size={16} color={brand.gold} strokeWidth={1.8} />
            </Pressable>
          ))}

          {met.map((f) => (
            <View key={f.id} style={[styles.row, styles.rowDone]}>
              <View style={styles.rowCheck}>
                <Check size={11} color={brand.gold} strokeWidth={2.6} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, styles.rowLabelDone]}>{f.label}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => openField(missing[0]?.href ?? "/admin/studio")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.ctaText}>FINISH SETUP</Text>
          <ArrowRight size={15} color={brand.ivory} strokeWidth={2} />
        </Pressable>

        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
            hitSlop={10}
          >
            <LayoutDashboard size={14} color="rgba(244,239,230,0.62)" strokeWidth={1.6} />
            <Text style={styles.backText}>Back to dashboard</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.nightDeep },
  scroll: { paddingHorizontal: 22 },

  eyebrow: {
    color: brand.gold,
    fontSize: 10.5,
    letterSpacing: 2.4,
    fontWeight: "700" as const,
    marginBottom: 16,
  },
  title: {
    color: brand.ivory,
    fontSize: 30,
    lineHeight: 37,
    fontFamily: fonts.serif,
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  sub: {
    color: "rgba(244,239,230,0.66)",
    fontSize: 14.5,
    lineHeight: 22,
    marginBottom: 26,
  },

  progressRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 26 },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  progressFill: { height: 3, borderRadius: 999, backgroundColor: brand.gold },
  progressText: {
    color: "rgba(244,239,230,0.55)",
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "600" as const,
  },

  list: { gap: 10, marginBottom: 26 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.075)",
  },
  rowDone: { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.045)" },
  rowDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.4,
    borderColor: "rgba(210,163,67,0.55)",
  },
  rowCheck: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(210,163,67,0.14)",
  },
  rowText: { flex: 1, gap: 3 },
  rowLabel: { color: brand.ivory, fontSize: 15, fontWeight: "600" as const },
  rowLabelDone: { color: "rgba(244,239,230,0.45)" },
  rowWhy: { color: "rgba(244,239,230,0.52)", fontSize: 12.5, lineHeight: 18 },

  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: "rgba(210,163,67,0.16)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.5)",
  },
  ctaText: {
    color: brand.ivory,
    fontSize: 12.5,
    letterSpacing: 2,
    fontWeight: "700" as const,
  },

  back: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
    paddingVertical: 10,
  },
  backText: { color: "rgba(244,239,230,0.62)", fontSize: 13.5 },

  clientWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  lockWell: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(210,163,67,0.12)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.32)",
    marginBottom: 22,
  },
  clientTitle: {
    color: brand.ivory,
    fontSize: 26,
    fontFamily: fonts.serif,
    marginBottom: 12,
    textAlign: "center" as const,
  },
  clientBody: {
    color: "rgba(244,239,230,0.62)",
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: "center" as const,
  },
});
