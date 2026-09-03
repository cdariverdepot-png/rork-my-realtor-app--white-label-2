import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ChevronRight } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { tint } from "@/constants/backdrops";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

/**
 * EmptyState — single, opinionated empty-state card for admin tools.
 * One headline, one supporting line, one primary CTA. Sits on the dark
 * photographic ground and takes the host screen's accent hue.
 */
export default function EmptyState({
  Icon,
  eyebrow,
  title,
  body,
  ctaLabel,
  onCtaPress,
  accent = brand.gold,
}: {
  Icon: React.ComponentType<IconProps>;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  onCtaPress: () => void;
  /** Host screen accent — defaults to house gold. */
  accent?: string;
}) {
  return (
    <View style={[styles.wrap, { borderColor: tint(accent, 0.24) }]}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: tint(accent, 0.14), borderColor: tint(accent, 0.4) },
        ]}
      >
        <Icon size={20} color={accent} strokeWidth={1.5} />
      </View>
      <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable
        onPress={() => {
          if (Platform.OS !== "web") Haptics.selectionAsync();
          onCtaPress();
        }}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: accent },
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
        <ChevronRight size={14} color="#0B0D0C" strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 32,
    paddingHorizontal: 22,
    alignItems: "center",
    backgroundColor: "rgba(14,16,15,0.72)",
    borderWidth: 1,
    borderRadius: 16,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 2.5,
    marginBottom: 10,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 280,
    marginBottom: 18,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  ctaText: {
    fontFamily: fonts.sansSemi,
    color: "#0B0D0C",
    fontSize: 11,
    letterSpacing: 1.5,
  },
});
