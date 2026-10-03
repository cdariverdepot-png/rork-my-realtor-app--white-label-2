import React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { brand, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { leavePreviewToDashboard } from "@/lib/navIntent";
import { useAmbient } from "@/lib/timeOfDay";
import { CalendarCheck, Globe, LayoutDashboard } from "lucide-react-native";
import PressableScale from "./PressableScale";
import { bookConsultation } from "@/lib/contact";

export default React.memo(function Footer() {
  const router = useRouter();
  const { isClient, isAdmin, demoViewMode, viewAsClient, exitViewAsClient } = useAuth();
  const { brand: b, theme } = useBrand();
  const ambient = useAmbient();
  const realtor = b.realtor;
  const license = b.credentials.license;

  // Most states require the brokerage and licence number on advertising, so the
  // compliance line is always on and never a placement choice.
  const licenseLine = [
    license.brokerage,
    license.number ? `Lic. ${license.number}${license.state ? ` (${license.state})` : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const marks = b.credentials.designations.map((d) => d.mark).join(" · ");
  const filled = (s: string | undefined): boolean => (s ?? "").trim().length > 0;
  // "PRIVATE" is a suffix, not a name — on its own it reads as an orphan word,
  // so the lockup falls back to the realtor's own name.
  const lockup = filled(realtor.brandName)
    ? `${realtor.brandName} PRIVATE`
    : realtor.name.trim().toUpperCase();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.band.deep }]}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0)", ambient.glow] as unknown as readonly [string, string]}
        style={StyleSheet.absoluteFill}
      />
      {filled(realtor.monogram) ? (
        <Text
          style={[styles.monogram, { color: theme.accent.base, fontFamily: theme.displayBold }]}
        >
          {realtor.monogram}
        </Text>
      ) : null}
      {lockup ? (
        <Text style={[styles.name, { color: theme.onBand.text }]}>{lockup}</Text>
      ) : null}
      <View style={[styles.rule, { backgroundColor: theme.accent.base }]} />
      {b.signatureUrl ? (
        <Image source={{ uri: b.signatureUrl }} style={styles.sig} contentFit="contain" />
      ) : null}
      {filled(realtor.title) ? (
        <Text style={[styles.line, { color: theme.onBand.muted }]}>{realtor.title}</Text>
      ) : null}
      {marks ? <Text style={[styles.marks, { color: theme.accent.light }]}>{marks}</Text> : null}
      {filled(realtor.city) ? (
        <Text style={[styles.lineSmall, { color: theme.onBand.dim }]}>{realtor.city}</Text>
      ) : null}
      {filled(realtor.email) ? (
        <Text style={[styles.lineSmall, { color: theme.onBand.dim }]}>{realtor.email}</Text>
      ) : null}
      {licenseLine ? (
        <Text style={[styles.compliance, { color: theme.onBand.dim }]}>{licenseLine}</Text>
      ) : null}
      <Text style={[styles.compliance, { color: theme.onBand.dim }]}>
        Equal Housing Opportunity
      </Text>

      {/* A bare "© 2026" belongs to nobody — fall back to the lockup. */}
      {filled(b.copyright) || lockup ? (
        <Text style={[styles.copy, { color: theme.onBand.dim }]}>
          © {new Date().getFullYear()} {filled(b.copyright) ? b.copyright : lockup}
        </Text>
      ) : null}

      {/* Both CTAs share one base style (styles.btn) so their size and shape
          match exactly — same width, padding, radius, and border box. Only the
          fill/outline treatment differs. */}
      <View style={styles.actions}>
        <PressableScale
          onPress={bookConsultation}
          hitSlop={8}
          haptic="selection"
          scaleTo={0.97}
          style={[styles.btn, styles.btnPrimary, { backgroundColor: theme.accent.base }]}
        >
          <View style={styles.btnInner}>
            <CalendarCheck size={14} color={theme.band.deep} strokeWidth={1.8} />
            <Text style={[styles.btnTextDark, { color: theme.band.deep }]}>
              BOOK A CONSULTATION
            </Text>
          </View>
        </PressableScale>

        {!demoViewMode && !isClient && !(isAdmin && viewAsClient) && <PressableScale
          onPress={() => isAdmin && viewAsClient
            // Leaving the client preview: same clean exit as its Back button.
            ? leavePreviewToDashboard(path => router.replace(path), exitViewAsClient)
            : router.push(isClient ? "/account" : isAdmin ? "/admin" : "/portal?entry=realtor")}
          hitSlop={8}
          haptic="selection"
          scaleTo={0.97}
          style={[
            styles.btn,
            styles.btnSecondary,
            { borderColor: theme.accent.base, backgroundColor: theme.onBand.veil },
          ]}
        >
          <View style={styles.btnInner}>
            <LayoutDashboard size={14} color={theme.accent.light} strokeWidth={1.6} />
            <Text style={[styles.btnTextGold, { color: theme.accent.light }]}>{isClient ? "MY CLIENT DASHBOARD" : isAdmin ? "DASHBOARD" : "REALTOR LOGIN"}</Text>
          </View>
        </PressableScale>}
      </View>

      {/* Website link — anchored at the very bottom, centered. */}
      <View style={styles.websiteRow}>
        <PressableScale
          onPress={() => Linking.openURL("https://myrealtorapp.com")}
          hitSlop={10}
          haptic="selection"
          scaleTo={0.97}
          style={styles.websiteBtn}
        >
          <View style={styles.websiteInner}>
            <Globe size={12} color={theme.accent.light} strokeWidth={1.6} />
            <Text style={[styles.websiteText, { color: theme.accent.light }]}>
              myrealtorapp.com
            </Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 56,
    paddingBottom: 60,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
  },
  // --- Type system: kept to 3 styles for consistency ---
  // serifBold (monogram) · sansSemi (labels) · sans (body)
  monogram: {
    fontFamily: fonts.serifBold,
    color: brand.gold,
    fontSize: 32,
    letterSpacing: 2,
    textAlign: "center",
  },
  name: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 12,
    letterSpacing: 4,
    marginTop: 8,
    textAlign: "center",
  },
  rule: {
    width: 40,
    height: 1,
    backgroundColor: brand.gold,
    marginVertical: 18,
  },
  sig: { width: 150, height: 50, marginBottom: 4 },
  line: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.82)",
    fontSize: 13,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  lineSmall: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 11,
    marginTop: 6,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  marks: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 8,
    textAlign: "center",
  },
  compliance: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.42)",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 6,
    letterSpacing: 0.4,
    textAlign: "center",
  },
  copy: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.4)",
    fontSize: 10,
    marginTop: 24,
    letterSpacing: 1,
    textAlign: "center",
  },
  // --- Actions: identical box for both buttons ---
  actions: {
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: 28,
  },
  btn: {
    width: "100%",
    maxWidth: 300,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  btnPrimary: {},
  btnSecondary: {
    marginTop: 12,
  },
  btnTextDark: {
    fontFamily: fonts.sansSemi,
    color: brand.forestDeep,
    fontSize: 11,
    letterSpacing: 2.2,
  },
  btnTextGold: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 11,
    letterSpacing: 2.2,
  },
  caption: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.4)",
    fontSize: 10,
    letterSpacing: 1.4,
    marginTop: 10,
    textAlign: "center",
  },
  websiteRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 28,
  },
  websiteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  websiteInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  websiteText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: "center",
  },
});
