import React, { useCallback } from "react";
import { Alert, Linking, Platform, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { CalendarCheck, Mail, MessageSquare, Phone } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";
import PressableScale from "./PressableScale";

type Variant = "light" | "dark";

interface SupportSectionProps {
  variant?: Variant;
}

/** Cross-surface "book a consultation" block for clients and the realtor. */
export default function SupportSection({ variant = "light" }: SupportSectionProps) {
  const dark = variant === "dark";
  const { brand: b } = useBrand();
  const realtor = b.realtor;
  const firstName = realtor.name.split(" ")[0] ?? realtor.name;
  const phoneDisplay = realtor.phone;
  const phoneTel = realtor.phone.replace(/[^+\d]/g, "");
  const supportEmail = realtor.email;

  const openCall = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const url = `tel:${phoneTel}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Call to book", `Reach out at ${phoneDisplay} to schedule your consultation.`);
      }
    } catch (e) {
      console.log("[support] call open failed", e);
      Alert.alert("Call to book", `Reach out at ${phoneDisplay} to schedule your consultation.`);
    }
  }, [phoneTel, phoneDisplay]);

  const openText = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const body = encodeURIComponent(
      `Hi ${firstName}, I'd love to book a consultation. When works for you?`
    );
    const sep = Platform.OS === "ios" ? "&" : "?";
    const url = `sms:${phoneTel}${sep}body=${body}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Text to book", `Send a text to ${phoneDisplay} to schedule your consultation.`);
      }
    } catch (e) {
      console.log("[support] text open failed", e);
      Alert.alert("Text to book", `Send a text to ${phoneDisplay} to schedule your consultation.`);
    }
  }, [firstName, phoneTel, phoneDisplay]);

  const openConsultMail = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const subject = encodeURIComponent("Consultation request");
    const body = encodeURIComponent(
      [
        `Hi ${firstName},`,
        "",
        "I'd love to book a consultation. Here's what I'm looking for:",
        "",
        "Preferred days / times:",
        "",
        "—",
      ].join("\n")
    );
    const url = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Email not available", `Please write to ${supportEmail}.`);
      }
    } catch (e) {
      console.log("[support] consult mail failed", e);
      Alert.alert("Email not available", `Please write to ${supportEmail}.`);
    }
  }, [firstName, supportEmail]);

  const s = dark ? darkStyles : lightStyles;

  return (
    <View style={s.wrap} testID="support-section">
      <View style={s.head}>
        <View style={s.headIcon}>
          <CalendarCheck size={16} color={dark ? brand.goldLight : brand.goldDeep} strokeWidth={1.6} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>BOOK A CONSULTATION</Text>
          <Text style={s.title}>Let's talk about your move.</Text>
          <Text style={s.sub}>
            Ready to buy, sell, or just explore? Reach out directly and we'll find a time that works for you.
          </Text>
        </View>
      </View>

      <PressableScale onPress={openCall} scaleTo={0.97} haptic="light" style={s.row} testID="support-call">
        <View style={s.rowIcon}>
          <Phone size={15} color={dark ? brand.goldLight : brand.goldDeep} strokeWidth={1.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Call to book</Text>
          <Text style={s.rowSub}>{phoneDisplay}</Text>
        </View>
        <Phone size={13} color={dark ? "rgba(244,239,230,0.55)" : brand.muted} strokeWidth={1.5} />
      </PressableScale>

      <View style={s.divider} />

      <PressableScale onPress={openText} scaleTo={0.97} haptic="light" style={s.row} testID="support-text">
        <View style={s.rowIcon}>
          <MessageSquare size={15} color={dark ? brand.goldLight : brand.goldDeep} strokeWidth={1.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Text to book</Text>
          <Text style={s.rowSub}>{phoneDisplay}</Text>
        </View>
        <MessageSquare size={13} color={dark ? "rgba(244,239,230,0.55)" : brand.muted} strokeWidth={1.5} />
      </PressableScale>

      <View style={s.divider} />

      <PressableScale onPress={openConsultMail} scaleTo={0.97} haptic="light" style={s.row} testID="support-consult-mail">
        <View style={s.rowIcon}>
          <Mail size={15} color={dark ? brand.ivory : brand.ink} strokeWidth={1.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Email to schedule</Text>
          <Text style={s.rowSub}>{supportEmail}</Text>
        </View>
        <Mail size={13} color={dark ? "rgba(244,239,230,0.55)" : brand.muted} strokeWidth={1.5} />
      </PressableScale>
    </View>
  );
}

const baseHead = {
  flexDirection: "row" as const,
  alignItems: "flex-start" as const,
  gap: 14,
  marginBottom: 18,
};

const lightStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginVertical: 28,
    padding: 20,
    backgroundColor: brand.ivoryWarm,
    borderWidth: 1,
    borderColor: brand.hairline,
  },
  head: baseHead,
  headIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(210,163,67,0.14)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: brand.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  rowSub: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
    backgroundColor: brand.hairline,
  },
});

const darkStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 18,
    backgroundColor: brand.forestDeep,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.35)",
  },
  head: baseHead,
  headIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(210,163,67,0.18)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  sub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.65)",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(8,26,21,0.45)",
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 14.5,
    letterSpacing: -0.2,
  },
  rowSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.6)",
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(244,239,230,0.1)",
  },
});
