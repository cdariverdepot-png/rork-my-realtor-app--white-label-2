import React, { useCallback, useMemo } from "react";
import {
  ActionSheetIOS,
  Alert,
  Animated,
  useWindowDimensions,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ArrowRight, LogOut, MessageCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { imagePosition } from "@/lib/themeImages";
import { useEditMode } from "@/contexts/EditModeContext";
import EditableText from "./EditableText";
import SignatureStroke from "./SignatureStroke";
import { useThemeMotion } from "@/hooks/useThemeMotion";

const filled = (s: string | undefined): boolean => (s ?? "").trim().length > 0;

interface Props {
  onPrimary?: () => void;
  scrollY?: Animated.Value;
}

export default function Hero({ scrollY }: Props) {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const HERO_H = Math.max(windowHeight * 0.92, 720);
  const HERO_H_TYPE = Math.max(windowHeight * 0.62, 480);
  const insets = useSafeAreaInsets();
  const { brand: b, theme } = useBrand();
  const { editing, setRealtor, previewBrand } = useEditMode();
  const { isClient, demoViewMode, viewAsClient, logout } = useAuth();
  const realtor = previewBrand.realtor;

  /**
   * Clients had no way out: the tab bar that owns the Account screen (the only
   * place holding a sign-out) is never mounted, so a signed-in client was
   * trapped in the app. Sign-out belongs on the front door itself.
   *
   * Shown only for a genuine client session — the demo showcase and the
   * realtor's own "view as client" preview already have their own exit pills.
   */
  const showSignOut = isClient && !demoViewMode && !viewAsClient && !editing;

  /**
   * The hero cannot hide — it is the app's front door. So instead of rendering
   * empty slots for whatever the realtor skipped, it steps down through
   * compositions: photographic when there is a portrait, typographic when there
   * isn't. Editing always shows the full arrangement so every field stays
   * reachable even while blank.
   */
  const hasPortrait = filled(b.portraitUrl);
  const typographic = !hasPortrait && !editing;
  const heroHeight = typographic ? HERO_H_TYPE : HERO_H;

  // Fall back to the tagline so a realtor who wrote one but skipped the hero
  // line still opens on a sentence rather than a gap.
  const headline = filled(realtor.heroMessage) ? realtor.heroMessage : realtor.tagline;
  const showEyebrow = filled(realtor.heroEyebrow) || editing;
  const hasContact = filled(realtor.phone) || filled(realtor.email);
  // Title and city are independent fields, so the separator only exists when
  // both do — otherwise an empty title leaves a bare middot in the byline.
  const bylineMeta = [realtor.title, realtor.city]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
  const primaryLabel = filled(realtor.primaryCta) ? realtor.primaryCta : "View the collection";

  const { imgTranslate, imgScale, topBarOpacity, contentTranslate, contentOpacity } =
    useThemeMotion(scrollY, heroHeight, editing);

  const handleFindHome = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.push("/listings");
  };

  /** Top-right icon — in-app letter composer. */
  const handleWriteLetter = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.push("/message");
  };

  const handleSignOut = useCallback(() => {
    const doSignOut = async (): Promise<void> => {
      try {
        await logout();
        router.replace("/");
      } catch (e) {
        console.log("[hero] sign out", e);
      }
    };
    if (Platform.OS === "web") {
      void doSignOut();
      return;
    }
    Haptics.selectionAsync();
    Alert.alert(
      "Sign out",
      "You'll need your access code to sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void doSignOut() },
      ],
      { cancelable: true }
    );
  }, [logout, router]);

  /** Native iPhone contact sheet — Call / Text / Email / Write a note. */
  const handleContact = useCallback(() => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const phone = realtor.phone.replace(/[^+\d]/g, "");
    const email = realtor.email;

    const openCall = () => Linking.openURL(`tel:${phone}`).catch(() => {});
    const openText = () => {
      const url = Platform.OS === "ios" ? `sms:${phone}` : `sms:${phone}?body=`;
      Linking.openURL(url).catch(() => {});
    };
    const openEmail = () =>
      Linking.openURL(
        `mailto:${email}?subject=${encodeURIComponent("A note from your app")}`
      ).catch(() => {});
    const openLetter = () => router.push("/message");

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Contact ${realtor.name}`,
          message: realtor.phone,
          options: ["Call", "Text message", "Email", "Write a note in the app", "Cancel"],
          cancelButtonIndex: 4,
          userInterfaceStyle: "dark",
        },
        (idx) => {
          if (idx === 0) openCall();
          else if (idx === 1) openText();
          else if (idx === 2) openEmail();
          else if (idx === 3) openLetter();
        }
      );
      return;
    }

    if (Platform.OS === "web") {
      openLetter();
      return;
    }

    Alert.alert(
      `Contact ${realtor.name}`,
      realtor.phone,
      [
        { text: "Call", onPress: openCall },
        { text: "Text", onPress: openText },
        { text: "Email", onPress: openEmail },
        { text: "Write a note", onPress: openLetter },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  }, [realtor.phone, realtor.email, realtor.name, router]);

  return (
    <View style={[styles.wrap, { minHeight: heroHeight, backgroundColor: theme.band.deep }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateY: imgTranslate }, { scale: imgScale }] },
        ]}
      >
        {hasPortrait ? (
          <Image
            source={{ uri: b.portraitUrl }}
            contentPosition={imagePosition(b.theme, b.layoutId)}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={b.portraitUrl}
            transition={0}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.band.base }]} />
        )}
        {/* Bottom fade — depth + text readability only. Derived from the band so
            the fade never stays green under a non-gold palette. */}
        <></>
      </Animated.View>

      {/* Top brand bar */}
      <Animated.View style={[styles.topBar, { paddingTop: insets.top + 14, opacity: topBarOpacity }]}>
        <View style={styles.brandLeft}>
          {filled(realtor.monogram) ? (
            <Text
              style={[
                styles.monogram,
                { color: theme.accent.base, fontFamily: theme.displayBold },
              ]}
            >
              {realtor.monogram}
            </Text>
          ) : null}
          {filled(realtor.brandName) || filled(realtor.brandSub) ? (
            <View style={styles.brandLines}>
              {filled(realtor.brandName) ? (
                <Text style={[styles.brandName, { color: theme.onBand.text }]}>
                  {realtor.brandName}
                </Text>
              ) : null}
              {filled(realtor.brandSub) ? (
                <Text style={[styles.brandSub, { color: theme.onBand.dim }]}>
                  {realtor.brandSub}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.topActions}>
          <Pressable
            onPress={handleWriteLetter}
            style={[
              styles.iconBtn,
              { borderColor: theme.onBand.veilLine, backgroundColor: theme.onBand.veil },
            ]}
            hitSlop={12}
          >
            <MessageCircle size={18} color={theme.onBand.text} strokeWidth={1.5} />
          </Pressable>
          {showSignOut ? (
            <Pressable
              onPress={handleSignOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={({ pressed }) => [
                styles.iconBtn,
                { borderColor: theme.onBand.veilLine, backgroundColor: theme.onBand.veil },
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={12}
            >
              <LogOut size={17} color={theme.onBand.muted} strokeWidth={1.5} />
            </Pressable>
          ) : null}
        </View>
      </Animated.View>

      {/* Bottom content */}
      <Animated.View
        style={[
          styles.bottom,
          {
            paddingBottom: insets.bottom + 28,
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslate }],
          },
        ]}
      >
        {showEyebrow ? (
          <EditableText
            editing={editing}
            value={realtor.heroEyebrow}
            onSave={(v) => setRealtor({ heroEyebrow: v })}
            label="Hero eyebrow"
            accent={theme.accent.light}
            style={[styles.eyebrow, { color: theme.accent.light }]}
          />
        ) : null}
        {filled(headline) || editing ? (
          <EditableText
            editing={editing}
            value={realtor.heroMessage}
            onSave={(v) => setRealtor({ heroMessage: v })}
            label="Headline"
            multiline
            accent={theme.accent.base}
          >
            <Text
              style={[
                styles.headline,
                typographic && styles.headlineType,
                { fontFamily: theme.display, color: theme.onBand.text },
              ]}
            >
              {headline.split("\n").map((line, i) => (
                <Text key={i}>
                  {line}
                  {i === 0 ? "\n" : ""}
                </Text>
              ))}
            </Text>
          </EditableText>
        ) : null}

        <View style={styles.byline}>
          <View style={[styles.bylineRule, { backgroundColor: theme.accent.base }]} />
          <View style={{ flex: 1 }}>
            <EditableText
              editing={editing}
              value={realtor.name}
              onSave={(v) => setRealtor({ name: v })}
              label="Your name"
              style={[styles.bylineName, { color: theme.onBand.text }]}
            />
            {bylineMeta || editing ? (
              <EditableText
                editing={editing}
                value={realtor.title}
                onSave={(v) => setRealtor({ title: v })}
                label="Title"
                style={[styles.bylineTitle, { color: theme.onBand.muted }]}
              >
                <Text style={[styles.bylineTitle, { color: theme.onBand.muted }]}>
                  {bylineMeta}
                </Text>
              </EditableText>
            ) : null}
          </View>
          <SignatureStroke color={theme.accent.light} width={110} height={36} />
        </View>

        <View style={styles.ctaRow}>
          <Pressable
            onPress={handleFindHome}
            style={({ pressed }) => [
              styles.primaryCta,
              { backgroundColor: theme.onBand.text },
              pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
            ]}
          >
            <EditableText
              editing={editing}
              value={primaryLabel}
              onSave={(v) => setRealtor({ primaryCta: v })}
              label="Button label"
              style={[styles.primaryCtaText, { fontFamily: theme.display }]}
            />
            <ArrowRight size={16} color={brand.ink} strokeWidth={2} />
          </Pressable>
          {/* Nowhere to send them without a phone or email, so the contact
              action only exists once one of the two does. */}
          {hasContact ? (
            <Pressable
              onPress={handleContact}
              style={({ pressed }) => [styles.secondaryCta, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.secondaryCtaText,
                  { color: theme.onBand.text, textDecorationColor: theme.accent.base },
                ]}
              >
                {filled(realtor.secondaryCta) ? realtor.secondaryCta : "Get in touch"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", backgroundColor: brand.forestDeep, overflow: "hidden", justifyContent: "space-between" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 14,
  },
  brandLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  monogram: {
    fontFamily: fonts.serifBold,
    color: brand.gold,
    fontSize: 24,
    letterSpacing: 1,
  },
  brandLines: {},
  brandName: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 12,
    letterSpacing: 4,
  },
  brandSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 2,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,26,21,0.3)",
  },
  bottom: {
    paddingTop: 100,
    paddingHorizontal: 24,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 18,
  },
  headline: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: -1,
    marginBottom: 28,
  },
  // With no photograph behind it the type carries the whole screen, so it sits
  // smaller and tighter rather than shouting into empty space.
  headlineType: { fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  byline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 28,
  },
  bylineRule: { width: 32, height: 1, backgroundColor: brand.gold },
  bylineName: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 13,
    letterSpacing: 1.5,
  },
  bylineTitle: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.65)",
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    backgroundColor: brand.ivory,
    paddingVertical: 16,
    paddingHorizontal: 22,
    flex: 1,
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  primaryCtaText: {
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  secondaryCta: {
    paddingVertical: 17,
    paddingHorizontal: 4,
  },
  secondaryCtaText: {
    fontFamily: fonts.sansMedium,
    color: brand.ivory,
    fontSize: 13,
    letterSpacing: 2,
    textDecorationLine: "underline",
    textDecorationColor: brand.gold,
  },
});
