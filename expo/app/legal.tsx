import React, { useMemo } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mail } from "lucide-react-native";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { brand, dark, fonts } from "@/constants/colors";
import { LEGAL_DOCS, LEGAL_UPDATED, SUPPORT_EMAIL, type LegalDoc } from "@/constants/legal";

/**
 * Legal reader — renders the privacy policy or terms from `constants/legal`.
 *
 * One screen for both documents, switched by the `doc` param, with a toggle so
 * a reader who arrived at one can reach the other without going back out.
 */
export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ doc?: string }>();

  const active: LegalDoc["id"] = params.doc === "terms" ? "terms" : "privacy";
  const doc = useMemo(() => LEGAL_DOCS[active], [active]);
  const other = active === "privacy" ? LEGAL_DOCS.terms : LEGAL_DOCS.privacy;

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="account" />
      <ModalChrome eyebrow="Legal" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]}
      >
        <View style={styles.rule} />
        <Text style={styles.title}>{doc.title}</Text>
        <Text style={styles.updated}>LAST UPDATED {LEGAL_UPDATED.toUpperCase()}</Text>
        <Text style={styles.intro}>{doc.intro}</Text>

        {doc.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            {s.body.map((p, i) => (
              <Text key={`${s.heading}-p${i}`} style={styles.para}>
                {p}
              </Text>
            ))}
            {s.bullets?.map((b, i) => (
              <View key={`${s.heading}-b${i}`} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        ))}

        <Pressable
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          style={({ pressed }) => [styles.mail, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
        >
          <Mail size={14} color={brand.goldLight} strokeWidth={1.6} />
          <Text style={styles.mailText}>{SUPPORT_EMAIL}</Text>
        </Pressable>

        <Pressable
          onPress={() => router.setParams({ doc: other.id })}
          style={({ pressed }) => [styles.swap, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel={`Read the ${other.title}`}
        >
          <Text style={styles.swapText}>READ THE {other.title.toUpperCase()}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 6 },
  rule: { width: 30, height: 1, backgroundColor: brand.gold, marginBottom: 18 },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  updated: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.4)",
    fontSize: 9.5,
    letterSpacing: 1.8,
    marginBottom: 16,
  },
  intro: {
    fontFamily: fonts.serifItalic,
    color: "rgba(244,239,230,0.72)",
    fontSize: 15.5,
    lineHeight: 24,
    marginBottom: 34,
  },
  section: { marginBottom: 28, gap: 10 },
  heading: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10.5,
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  para: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.74)",
    fontSize: 14,
    lineHeight: 23,
  },
  bulletRow: { flexDirection: "row", gap: 11, paddingRight: 4 },
  bulletDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: brand.gold,
    marginTop: 10,
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.66)",
    fontSize: 13.5,
    lineHeight: 22,
  },
  mail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    alignSelf: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    backgroundColor: "rgba(210,163,67,0.1)",
    marginBottom: 20,
  },
  mailText: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 12.5,
    letterSpacing: 0.2,
  },
  swap: {
    borderTopWidth: 1,
    borderTopColor: "rgba(244,239,230,0.12)",
    paddingTop: 22,
  },
  swapText: {
    fontFamily: fonts.sansSemi,
    color: "rgba(244,239,230,0.55)",
    fontSize: 10,
    letterSpacing: 2.2,
  },
});
