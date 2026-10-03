import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Coffee, Utensils, Trees, GraduationCap, Music } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";
import { useBrand } from "@/contexts/BrandContext";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";

const PICK_ICONS = {
  Coffee,
  Dinner: Utensils,
  Walk: Trees,
  School: GraduationCap,
  Listen: Music,
} as const;

const PICK_ACCENTS: Record<keyof typeof PICK_ICONS, string> = {
  Coffee: "#E58B5A",
  Dinner: "#E5778F",
  Walk: "#62D29A",
  School: "#6FA8E5",
  Listen: "#C99BE5",
};

const ACCENT = SCREEN_ACCENT.insights;

export default function InsightsScreen() {
  const { brand: b } = useBrand();
  const neighborhoods = b.neighborhoods;
  const marketPulse = b.marketPulse;
  const realtor = b.realtor;
  const firstName = realtor.name.split(" ")[0] ?? realtor.name;
  const [active, setActive] = useState<string>(neighborhoods[0]?.id ?? "");
  const n = neighborhoods.find((x) => x.id === active) ?? neighborhoods[0];
  if (!n) {
    return (
      <View style={styles.root}>
        <ScreenBackdrop screen="insights" />
        <ModalChrome eyebrow="Neighborhoods" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="insights" />
      <ModalChrome eyebrow="Neighborhoods" />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Reveal delay={40}>
        <View style={styles.pulse}>
          <Text style={styles.pulseEyebrow}>{marketPulse.date.toUpperCase()} · MARKET PULSE</Text>
          <Text style={styles.pulseTitle}>{marketPulse.headline}</Text>
          {marketPulse.paragraphs.map((p, i) => (
            <Text key={i} style={styles.pulseBody}>
              {p}
            </Text>
          ))}
          <Text style={styles.pulseSign}>{marketPulse.signoff} {firstName}</Text>
        </View>
        </Reveal>

        <Reveal delay={140}>
        <Text style={styles.label}>WHERE I'M SPENDING TIME</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        >
          {neighborhoods.map((nh) => {
            const on = nh.id === active;
            return (
              <PressableScale
                key={nh.id}
                onPress={() => setActive(nh.id)}
                haptic="selection"
                scaleTo={0.94}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{nh.name}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
        </Reveal>

        <Reveal delay={220}>
        <View style={styles.hero}>
          <Image source={{ uri: n.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(8,10,9,0)", "rgba(8,10,9,0.92)"]}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroBody}>
            <Text style={styles.region}>{n.region.toUpperCase()}</Text>
            <Text style={styles.heroTitle}>{n.name}</Text>
            <View style={styles.tagsRow}>
              {n.vibe.map((v) => (
                <View key={v} style={styles.vibeTag}>
                  <Text style={styles.vibeText}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        </Reveal>

        <Reveal delay={300}>
        <View style={styles.metricRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.metricLabel}>PACE</Text>
            <Text style={styles.metricValue}>{n.pace}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={{ flex: 1 }}>
            <Text style={styles.metricLabel}>PRICE PULSE</Text>
            <Text style={styles.metricValue}>{n.pricePulse}</Text>
          </View>
        </View>
        </Reveal>

        <Reveal delay={360}>
        <View style={styles.takeCard}>
          <Text style={styles.takeKicker}>{firstName.toUpperCase()}'S READ</Text>
          <Text style={styles.takeBody}>{n.blurb}</Text>
        </View>
        </Reveal>

        <Reveal delay={420}>
        <Text style={[styles.label, { marginTop: 8 }]}>MY LOCAL FAVORITES</Text>
        <View style={styles.picksCol}>
          {n.picks.map((p, i) => {
            const Icon = PICK_ICONS[p.kind];
            const accent = PICK_ACCENTS[p.kind] ?? brand.gold;
            return (
              <Reveal key={p.name} delay={460 + i * 70}>
              <View style={styles.pickRow}>
                <View
                  style={[
                    styles.pickIcon,
                    { backgroundColor: tint(accent, 0.14), borderColor: tint(accent, 0.45) },
                  ]}
                >
                  <Icon size={16} color={accent} strokeWidth={1.7} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickKind, { color: accent }]}>{p.kind.toUpperCase()}</Text>
                  <Text style={styles.pickName}>{p.name}</Text>
                  <Text style={styles.pickNote}>“{p.note}”</Text>
                </View>
              </View>
              </Reveal>
            );
          })}
        </View>
        </Reveal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  pulse: {
    margin: 24,
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.22),
    backgroundColor: "rgba(14,16,15,0.72)",
  },
  pulseEyebrow: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 14,
  },
  pulseTitle: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  pulseBody: {
    fontFamily: fonts.serifItalic,
    color: "rgba(244,239,230,0.88)",
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 12,
  },
  pulseSign: {
    fontFamily: fonts.serifItalic,
    color: dark.goldLight,
    fontSize: 14,
    marginTop: 6,
  },
  label: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10,
    letterSpacing: 3,
    marginHorizontal: 24,
    marginBottom: 14,
  },
  chip: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.6)",
  },
  chipOn: { backgroundColor: tint(ACCENT, 0.16), borderColor: tint(ACCENT, 0.5) },
  chipText: { fontFamily: fonts.serif, fontSize: 14, color: dark.textMuted },
  chipTextOn: { color: ACCENT },
  hero: {
    height: 240,
    margin: 24,
    borderRadius: 16,
    backgroundColor: dark.bgSurface,
    overflow: "hidden",
  },
  heroBody: { position: "absolute", left: 22, right: 22, bottom: 22 },
  region: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 10,
  },
  heroTitle: { fontFamily: fonts.serif, color: dark.text, fontSize: 32, letterSpacing: -0.6 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  vibeTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
  },
  vibeText: {
    fontFamily: fonts.sansMedium,
    color: dark.text,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  metricRow: {
    flexDirection: "row",
    marginHorizontal: 24,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: dark.border,
    marginBottom: 22,
  },
  metricLabel: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 6,
  },
  metricValue: { fontFamily: fonts.serif, color: dark.text, fontSize: 14, lineHeight: 18 },
  metricDivider: { width: 1, backgroundColor: dark.border, marginHorizontal: 16 },
  takeCard: {
    marginHorizontal: 24,
    marginBottom: 30,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: tint(ACCENT, 0.4),
  },
  takeKicker: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 10,
  },
  takeBody: { fontFamily: fonts.serifItalic, color: dark.text, fontSize: 17, lineHeight: 26 },
  picksCol: { paddingHorizontal: 24, gap: 18, paddingTop: 4 },
  pickRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  pickIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pickKind: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 4,
  },
  pickName: { fontFamily: fonts.serif, color: dark.text, fontSize: 16 },
  pickNote: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
