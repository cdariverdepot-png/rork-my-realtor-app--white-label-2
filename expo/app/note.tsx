import React from "react";
import { ScrollView, StyleSheet, Text, View, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { SCREEN_ACCENT } from "@/constants/backdrops";
import { useBrand } from "@/contexts/BrandContext";
import { themeDesign } from "@/constants/themeDesigns";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";

const ACCENT = SCREEN_ACCENT.note;

/** Full-letter view of Eliza's weekly market note. */
export default function Note() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand: b } = useBrand();
  const personalNote = b.note;
  const realtor = b.realtor;

  const reply = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.replace("/message");
  };

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="note" intensity="deep" />
      <ModalChrome eyebrow={personalNote.title} onDark />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 140, paddingHorizontal: 28 }}>
        <Reveal delay={40}>
          <Text style={styles.date}>{personalNote.date.toUpperCase()} · A LETTER</Text>
          <Text style={styles.opener}>{personalNote.opener}</Text>
        </Reveal>
        {personalNote.body.map((p, i) => (
          <Reveal key={i} delay={120 + i * 80}>
            <Text style={styles.body}>{p}</Text>
          </Reveal>
        ))}
        <Text style={styles.signoff}>{personalNote.signoff}</Text>
        {b.signatureUrl ? (
          <Image source={{ uri: b.signatureUrl }} style={styles.sig} contentFit="contain" />
        ) : null}
        <Text style={styles.name}>{realtor.name}</Text>
        <Text style={styles.title}>{realtor.title}</Text>
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + 14 }]}>
        <PressableScale
          onPress={reply}
          haptic="medium"
          scaleTo={0.97}
          style={[styles.reply, { backgroundColor: themeDesign(b.layoutId, b.theme).accent }]}
        >
          <Text style={styles.replyText} numberOfLines={1}>Reply to {realtor.name.split(" ")[0]}</Text>
          <ArrowRight size={18} color={brand.nightDeep} strokeWidth={2} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  date: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 24,
  },
  opener: {
    fontFamily: fonts.serifItalic,
    color: dark.text,
    fontSize: 22,
    marginBottom: 18,
  },
  body: {
    fontFamily: fonts.serif,
    color: "rgba(244,239,230,0.92)",
    fontSize: 17,
    lineHeight: 28,
    marginBottom: 18,
    letterSpacing: 0.1,
  },
  signoff: {
    fontFamily: fonts.serifItalic,
    color: "rgba(244,239,230,0.7)",
    fontSize: 16,
    marginTop: 16,
  },
  sig: { width: 200, height: 64, marginTop: 0, marginLeft: -8 },
  name: {
    fontFamily: fonts.sansSemi,
    color: dark.text,
    fontSize: 12,
    letterSpacing: 2,
    marginTop: 6,
  },
  title: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.6)",
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "rgba(8,10,9,0.94)",
    borderTopWidth: 1,
    borderTopColor: dark.border,
  },
  reply: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: ACCENT,
  },
  replyText: {
    fontFamily: fonts.sansSemi,
    color: brand.nightDeep,
    fontSize: 16,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
});
