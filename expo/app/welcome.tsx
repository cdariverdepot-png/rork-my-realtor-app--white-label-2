import React, { useState, useMemo, useRef } from "react";
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
import { appendClientToRoster } from "@/lib/clientRoster";
import { isRealtorRef } from "@/lib/leadBooking";
import { useRefRealtor } from "@/lib/useRefRealtor";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";
import BookingStatus from "@/components/BookingStatus";
import { randomUUID } from "expo-crypto";

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
  const { brand: b, listings, loading: resolving, error: linkError, retry } = useRefRealtor(params.ref, ownBrand);

  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const leadIdRef = useRef(randomUUID());

  const realtorFirst = useMemo(() => b.realtor.name.split(" ")[0] ?? b.realtor.name, [b.realtor.name]);
  const valid = name.trim().length >= 2 && (phone.trim().length >= 6 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

  const onContinue = async () => {
    if (!valid || submitting.current || !isRealtorRef(params.ref) || resolving || linkError) return;
    submitting.current = true;
    setLoading(true); setError("");
    try {
      const leadId = await appendClientToRoster(params.ref, {
        id: leadIdRef.current, name: name.trim(), email: email.trim(), phone: phone.trim() || undefined,
        tag: "Booking", source: "booking", createdAt: Date.now(),
      }, true);
      router.replace({ pathname: "/book", params: {
        listingId: params.listingId ?? "", invite: "1", ref: params.ref, leadId,
        leadName: name.trim(), leadContact: phone.trim() || email.trim(),
      } });
    } catch {
      setError("We couldn't save your details. Check your connection and try again.");
    } finally { submitting.current = false; setLoading(false); }
  };

  if (!isRealtorRef(params.ref) || resolving || linkError || listings?.length === 0) {
    return <BookingStatus loading={resolving} retry={retry} message={linkError ||
      (!isRealtorRef(params.ref) ? "This booking link is invalid. Ask your realtor for a new link."
      : "No homes are available to book yet. Please contact your realtor.")} />;
  }

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
            A private viewing — no broker, no buyer's agent unless you bring one. Tell {realtorFirst} who you are, then request a preferred viewing time.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 160 }}
          keyboardShouldPersistTaps="handled"
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          style={Platform.OS === "web" ? ({ overscrollBehaviorY: "contain" } as object) : undefined}
        >
          <Reveal delay={60}>
            <View style={styles.trustRow}>
              <Trust Icon={ShieldCheck} text="Direct line — no call centers" />
              <Trust Icon={Sparkles} text="Sent to your realtor" />
              <Trust Icon={CalendarDays} text="Request a preferred time" />
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

              <Text style={styles.formLabel}>PHONE <Text style={styles.optional}>· phone or email required</Text></Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor="rgba(45,52,53,0.35)"
                style={styles.input}
                keyboardType="phone-pad"
                returnKeyType="next"
              />

              <Text style={styles.formLabel}>EMAIL <Text style={styles.optional}>· phone or email required</Text></Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
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

      {error ? <Text accessibilityRole="alert" style={{ color: "#A12A20", padding: 16, marginBottom: 110 }}>{error}</Text> : null}
      <View style={[styles.dock, { paddingBottom: insets.bottom + 14 }]}>
        <PressableScale
          onPress={onContinue}
          haptic="medium"
          scaleTo={0.97}
          hitSlop={12}
          style={[styles.cta, { minHeight: 52 }, !valid && { opacity: 0.5 }]}
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
