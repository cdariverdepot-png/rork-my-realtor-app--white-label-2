import React, { useState, useMemo } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { ArrowRight, CalendarDays, ShieldCheck, Sparkles } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { avatarPlaceholder } from "@/constants/assets";
import { useBrand } from "@/contexts/BrandContext";
import { useClients } from "@/contexts/ClientsContext";
import { appendClientToRoster } from "@/lib/clientRoster";
import { isRealtorRef } from "@/lib/leadBooking";
import { useRefRealtor } from "@/lib/useRefRealtor";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";

/**
 * /welcome — the landing flow for anyone who taps a realtor's public booking link.
 * The link is a deep-link into the app; if the user has it installed they land here,
 * the realtor's brand greets them, we capture the minimum to import them as a contact,
 * then we hand them straight into the in-app booking flow with their info pre-attached.
 *
 * Clients without the app installed see the App Store fallback inside the share message
 * itself (the realtor sets that URL in the content editor).
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ref?: string; from?: string; listingId?: string }>();
  const { brand: ownBrand } = useBrand();
  // Booking-link visitors see the linked realtor, not the app's demo brand.
  const { brand: b } = useRefRealtor(params.ref, ownBrand);
  const { importMany } = useClients();

  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const realtorFirst = useMemo(() => b.realtor.name.split(" ")[0] ?? b.realtor.name, [b.realtor.name]);
  const valid = name.trim().length >= 2 && (phone.trim().length >= 6 || email.includes("@"));

  const onContinue = () => {
    if (!valid || loading) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);
    // A link that names its realtor files the lead on that realtor's roster.
    if (isRealtorRef(params.ref)) {
      const leadId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      void appendClientToRoster(params.ref, {
        id: leadId, name: name.trim(), email: email.trim(), phone: phone.trim() || undefined,
        tag: `Booking · ${realtorFirst}`, source: "booking", createdAt: Date.now(),
      }).catch((e) => console.log("[welcome] roster", e));
      router.replace({
        pathname: "/book",
        params: { listingId: params.listingId ?? "", invite: "1", ref: params.ref, leadId,
          leadName: name.trim(), leadContact: phone.trim() || email.trim() },
      });
      return;
    }
    try {
      importMany(
        [
          {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || undefined,
            tag: `Booking · ${realtorFirst}`,
          },
        ],
        "manual",
      );
    } catch (e) {
      console.log("[welcome] import contact", e);
    }
    router.replace({
      pathname: "/book",
      params: {
        listingId: params.listingId ?? "",
        invite: "1",
      },
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { paddingTop: insets.top + 32 }]}> 
        {b.portraitUrl ? (
          <Image
            source={{ uri: b.portraitUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={400}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#07070A" }]}>
            <Image source={avatarPlaceholder} style={StyleSheet.absoluteFill} contentFit="contain" />
          </View>
        )}
        <View style={styles.heroScrim} pointerEvents="none" />
        <View style={styles.heroInner}>
          <Text style={styles.eyebrow}>{b.realtor.brandName} · PRIVATE INVITATION</Text>
          <Text style={styles.heroTitle}>You're invited to book{"\n"}with {realtorFirst}.</Text>
          <Text style={styles.heroSub}>
            A private viewing — no broker, no buyer's agent unless you bring one. Tell {realtorFirst} who you are and we'll hold your spot in seconds.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
          keyboardShouldPersistTaps="handled"
        >
          <Reveal delay={60}>
            <View style={styles.trustRow}>
              <Trust Icon={ShieldCheck} text="Direct line — no call centers" />
              <Trust Icon={Sparkles} text="Saved to your private feed" />
              <Trust Icon={CalendarDays} text="Confirmed within the hour" />
            </View>
          </Reveal>

          <Reveal delay={140}>
            <View style={styles.form}>
              <Text style={styles.formLabel}>YOUR NAME</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                placeholderTextColor="rgba(45,52,53,0.35)"
                style={styles.input}
                autoCapitalize="words"
                returnKeyType="next"
              />

              <Text style={styles.formLabel}>PHONE</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="So we can text the confirmation"
                placeholderTextColor="rgba(45,52,53,0.35)"
                style={styles.input}
                keyboardType="phone-pad"
                returnKeyType="next"
              />

              <Text style={styles.formLabel}>EMAIL <Text style={styles.optional}>· optional</Text></Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="For listing follow-ups"
                placeholderTextColor="rgba(45,52,53,0.35)"
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={onContinue}
              />

              <Text style={styles.privacy}>
                Your info goes only to {b.realtor.name}. No marketing lists. No third parties.
              </Text>
            </View>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + 14 }]}>
        <PressableScale
          onPress={onContinue}
          haptic="medium"
          scaleTo={0.97}
          style={[styles.cta, !valid && { opacity: 0.5 }]}
          disabled={!valid || loading}
        >
          <Text style={styles.ctaText}>Continue to booking</Text>
          <ArrowRight size={16} color={brand.ivory} strokeWidth={1.8} />
        </PressableScale>
        <Text style={styles.dockHint}>You'll pick a date and time on the next screen.</Text>
      </View>
    </View>
  );
}

function Trust({
  Icon,
  text,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  text: string;
}) {
  return (
    <View style={styles.trustItem}>
      <View style={styles.trustIcon}>
        <Icon size={13} color={brand.gold} strokeWidth={1.6} />
      </View>
      <Text style={styles.trustText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.paper },
  hero: {
    height: 340,
    backgroundColor: brand.forestDeep,
    overflow: "hidden",
  },
  heroScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(8,26,21,0.62)",
  },
  heroInner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "flex-end",
    paddingBottom: 28,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 14,
  },
  heroTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.6,
    marginBottom: 14,
  },
  heroSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.78)",
    fontSize: 13,
    lineHeight: 19,
  },
  trustRow: {
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairline,
  },
  trustItem: { flex: 1, alignItems: "center", gap: 8 },
  trustIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(210,163,67,0.12)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  trustText: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  form: { paddingHorizontal: 24, paddingTop: 24 },
  formLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 8,
    marginTop: 16,
  },
  optional: { color: brand.muted, letterSpacing: 1.2 },
  input: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: brand.ink,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairline,
    paddingVertical: 10,
  },
  privacy: {
    fontFamily: fonts.serifItalic,
    color: brand.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 24,
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: brand.paper,
    borderTopWidth: 1,
    borderTopColor: brand.hairline,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 17,
    backgroundColor: brand.forest,
  },
  ctaText: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 13,
    letterSpacing: 2,
  },
  dockHint: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 10,
    textAlign: "center",
  },
});
