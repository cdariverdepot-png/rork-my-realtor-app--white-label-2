import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Send, Check } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, dark, fonts } from "@/constants/colors";
import { avatarPlaceholder } from "@/constants/assets";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";
import { useBrand } from "@/contexts/BrandContext";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";

const ACCENT = SCREEN_ACCENT.message;

const PROMPTS = [
  "I'm a buyer — show me what's right for me",
  "I'm thinking of selling",
  "Off-market only, please",
  "I have a question about a listing",
];

/** Modal letter composer — direct line to the realtor. */
export default function Message() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand: b } = useBrand();
  const realtor = b.realtor;
  const firstName = realtor.name.split(" ")[0] ?? realtor.name;
  const [text, setText] = useState<string>("");
  const [intent, setIntent] = useState<string | null>(null);
  const [sent, setSent] = useState<boolean>(false);

  const send = () => {
    if (!text.trim() && !intent) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSent(true);
    setTimeout(() => router.back(), 1400);
  };

  if (sent) {
    return (
      <View style={styles.sentRoot}>
        <ScreenBackdrop screen="message" intensity="deep" />
        <View style={styles.sentInner}>
          <View style={styles.checkBubble}>
            <Check size={28} color={brand.nightDeep} strokeWidth={2} />
          </View>
          <Text style={styles.sentTitle}>Sent.</Text>
          <Text style={styles.sentSub}>
            {firstName} will read this and write back today.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScreenBackdrop screen="message" />
      <ModalChrome eyebrow={`Write to ${firstName}`} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 200 }}
        keyboardShouldPersistTaps="handled"
      >
        <Reveal delay={40}>
        <View style={styles.intro}>
          {b.portraitUrl ? (
            <Image source={{ uri: b.portraitUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Image source={avatarPlaceholder} style={StyleSheet.absoluteFill} contentFit="cover" />
            </View>
          )}
          <Text style={styles.helloLine}>
            Hi — it's {firstName}.
          </Text>
          <Text style={styles.introBody}>
            Tell me what you're looking for. The more specific, the better.
            I read every note myself, usually within the hour.
          </Text>
        </View>
        </Reveal>

        <Reveal delay={140}>
        <Text style={styles.label}>I'M REACHING OUT BECAUSE…</Text>
        <View style={styles.chipsCol}>
          {PROMPTS.map((p) => {
            const selected = intent === p;
            return (
              <Pressable
                key={p}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  setIntent(selected ? null : p);
                }}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>
        </Reveal>

        <Reveal delay={220}>
        <Text style={[styles.label, { marginTop: 24 }]}>YOUR NOTE</Text>
        <View style={styles.textareaWrap}>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={`Hi ${firstName} — I'd love to hear what you're seeing right now…`}
            placeholderTextColor={dark.textDim}
            style={styles.textarea}
          />
        </View>
        </Reveal>
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + 14 }]}>
        <PressableScale
          onPress={send}
          haptic={!text.trim() && !intent ? "none" : "medium"}
          scaleTo={0.97}
          style={[styles.send, !text.trim() && !intent && { opacity: 0.45 }]}
          disabled={!text.trim() && !intent}
        >
          <Send size={16} color={brand.nightDeep} strokeWidth={2} />
          <Text style={styles.sendText}>Send to {firstName}</Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  intro: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.55),
    marginBottom: 14,
  },
  avatarFallback: {
    backgroundColor: "#07070A",
    overflow: "hidden",
  },
  helloLine: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 24,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  introBody: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  label: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10,
    letterSpacing: 3,
    marginHorizontal: 24,
    marginBottom: 14,
  },
  chipsCol: { paddingHorizontal: 24, gap: 8 },
  chip: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.7)",
  },
  chipOn: { borderColor: tint(ACCENT, 0.5), backgroundColor: tint(ACCENT, 0.13) },
  chipText: { fontFamily: fonts.serif, color: dark.textMuted, fontSize: 15 },
  chipTextOn: { color: ACCENT },
  textareaWrap: {
    marginHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.7)",
    minHeight: 160,
    padding: 16,
  },
  textarea: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 16,
    lineHeight: 23,
    minHeight: 130,
    textAlignVertical: "top",
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(8,10,9,0.94)",
    borderTopWidth: 1,
    borderTopColor: dark.border,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  send: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 17,
    borderRadius: 14,
    backgroundColor: ACCENT,
  },
  sendText: {
    fontFamily: fonts.sansSemi,
    color: brand.nightDeep,
    fontSize: 13,
    letterSpacing: 2,
  },
  sentRoot: {
    flex: 1,
    backgroundColor: dark.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  sentInner: { alignItems: "center", paddingHorizontal: 40 },
  checkBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  sentTitle: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 36,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  sentSub: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
});
