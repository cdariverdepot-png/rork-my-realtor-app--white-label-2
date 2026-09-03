import React, { useEffect, useMemo, useRef } from "react";
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import {
  ArrowRight,
  Check,
  Copy,
  Send,
  Sparkles,
} from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useAccess } from "@/contexts/AccessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";

const APP_STORE_URL = "https://apps.apple.com/us/app/eliza-vance/id6767771906";

/**
 * /admin/ready — the cinematic "you're set up" moment shown right after the
 * realtor finishes account creation. Displays their newly issued client
 * access code with one-tap Copy and Share so they can send the first
 * invitation in seconds.
 */
export default function ReadyToShare() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand: b } = useBrand();
  const {
    clientCode,
    clientCodeEnabled,
    hydrated: accessHydrated,
    publishClientCode,
  } = useAccess();
  const { isAdmin, hydrated: authHydrated, session } = useAuth();

  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(20)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const codeReveal = useRef(new Animated.Value(0)).current;
  const copied = useRef(new Animated.Value(0)).current;
  const [didCopy, setDidCopy] = React.useState<boolean>(false);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAdmin) router.replace("/portal");
  }, [authHydrated, isAdmin, router]);

  // The auto-generated client code from AccessContext's initial seed is only
  // stored locally until we explicitly publish it. Do that here so the code
  // shown on this screen is the same one client devices will see in KV.
  useEffect(() => {
    if (!accessHydrated) return;
    publishClientCode();
  }, [accessHydrated, publishClientCode]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(checkScale, {
        toValue: 1,
        damping: 9,
        stiffness: 120,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(420),
        Animated.timing(codeReveal, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 4800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 4800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [fade, lift, checkScale, codeReveal, breathe]);

  const realtorFirst = useMemo(
    () => (session?.name ?? b.realtor.name).split(" ")[0] ?? "there",
    [session, b.realtor.name]
  );

  const inviteMessage = useMemo(
    () =>
      [
        `${b.realtor.name} just invited you into her private app.`,
        "",
        clientCodeEnabled
          ? `Your private access code: ${clientCode}`
          : "Open the app to create your private profile.",
        "",
        `Download: ${APP_STORE_URL}`,
      ].join("\n"),
    [b.realtor.name, clientCode, clientCodeEnabled]
  );

  const flashCopied = () => {
    setDidCopy(true);
    Animated.sequence([
      Animated.timing(copied, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(1400),
      Animated.timing(copied, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setDidCopy(false));
  };

  const onCopyCode = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    await Clipboard.setStringAsync(clientCode);
    flashCopied();
  };

  const onCopyInvite = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    await Clipboard.setStringAsync(inviteMessage);
    flashCopied();
  };

  const onShare = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(inviteMessage);
        flashCopied();
        return;
      }
      await Share.share({ message: inviteMessage, title: "Your private invitation" });
    } catch (e) {
      console.log("[admin/ready] share", e);
      Alert.alert("Couldn't share", "Try copying the invite instead.");
    }
  };

  const enterDashboard = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.replace("/admin");
  };

  if (!accessHydrated || !authHydrated) {
    return <View style={[styles.root, { backgroundColor: brand.nightDeep }]} />;
  }

  const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });
  const glowScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[brand.nightDeep, brand.night, brand.nightDeep]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          { opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      >
        <LinearGradient
          colors={["rgba(210,163,67,0.55)", "rgba(210,163,67,0)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fade,
            transform: [{ translateY: lift }],
            paddingTop: insets.top + 80,
            paddingBottom: insets.bottom + 36,
          },
        ]}
      >
        <Animated.View style={[styles.checkRing, { transform: [{ scale: checkScale }] }]}>
          <View style={styles.checkRingInner}>
            <Check size={26} color={brand.nightDeep} strokeWidth={2.2} />
          </View>
          <Sparkles
            size={14}
            color={brand.goldLight}
            strokeWidth={1.6}
            style={styles.sparkle1}
          />
          <Sparkles
            size={10}
            color={brand.goldLight}
            strokeWidth={1.6}
            style={styles.sparkle2}
          />
        </Animated.View>

        <Text style={styles.eyebrow}>YOUR STUDIO · LIVE</Text>
        <Text style={styles.title}>You're ready to share, {realtorFirst}.</Text>
        <Text style={styles.sub}>
          {clientCodeEnabled
            ? "Send your first client this private access code and they'll join your app in seconds."
            : "Client signup is open. Send the link below to invite anyone — no code required."}
        </Text>

        {clientCodeEnabled ? (
          <Animated.View
            style={[
              styles.codeCard,
              {
                opacity: codeReveal,
                transform: [
                  {
                    translateY: codeReveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.codeLabel}>CLIENT ACCESS CODE</Text>
            <Pressable onPress={onCopyCode} hitSlop={10}>
              <Text style={styles.codeValue} selectable>
                {clientCode}
              </Text>
            </Pressable>
            <Pressable onPress={onCopyCode} hitSlop={10} style={styles.codeCopyRow}>
              <Copy size={12} color={brand.goldLight} strokeWidth={1.6} />
              <Text style={styles.codeCopyText}>Tap to copy code</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={onShare}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
            ]}
          >
            <Send size={15} color={brand.nightDeep} strokeWidth={2} />
            <Text style={styles.primaryBtnText}>SHARE INVITATION</Text>
          </Pressable>

          <Pressable
            onPress={onCopyInvite}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Copy size={14} color={brand.goldLight} strokeWidth={1.6} />
            <Text style={styles.secondaryBtnText}>COPY FULL INVITE</Text>
          </Pressable>
        </View>

        <Pressable onPress={enterDashboard} hitSlop={10} style={styles.skipRow}>
          <Text style={styles.skipText}>Enter dashboard</Text>
          <ArrowRight size={13} color={brand.goldLight} strokeWidth={1.6} />
        </Pressable>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          {
            opacity: copied,
            transform: [
              {
                translateY: copied.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
            ],
            bottom: insets.bottom + 32,
          },
        ]}
      >
        <Check size={13} color={brand.nightDeep} strokeWidth={2.2} />
        <Text style={styles.toastText}>{didCopy ? "COPIED TO CLIPBOARD" : ""}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.nightDeep },
  glow: {
    position: "absolute",
    top: "12%",
    left: "-20%",
    right: "-20%",
    height: 520,
    borderRadius: 260,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 28,
  },
  checkRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.5)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  checkRingInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: brand.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkle1: { position: "absolute", top: -2, right: 4 },
  sparkle2: { position: "absolute", bottom: 6, left: -4 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 4,
    marginBottom: 16,
    textAlign: "center",
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    textAlign: "center",
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  sub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.62)",
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  codeCard: {
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.45)",
    backgroundColor: "rgba(8,26,21,0.5)",
    paddingVertical: 22,
    paddingHorizontal: 24,
    alignItems: "center",
    marginBottom: 32,
  },
  codeLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3.2,
    marginBottom: 10,
  },
  codeValue: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 36,
    letterSpacing: 10,
    textAlign: "center",
    paddingVertical: 4,
  },
  codeCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  codeCopyText: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10.5,
    letterSpacing: 1.6,
  },
  actions: { width: "100%", gap: 12 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: brand.ivory,
    paddingVertical: 17,
  },
  primaryBtnText: {
    fontFamily: fonts.sansSemi,
    color: brand.nightDeep,
    fontSize: 12,
    letterSpacing: 3,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
  },
  secondaryBtnText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 11,
    letterSpacing: 2.4,
  },
  skipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 28,
  },
  skipText: {
    fontFamily: fonts.sansMedium,
    color: "rgba(244,239,230,0.55)",
    fontSize: 12,
    letterSpacing: 1.4,
  },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: brand.gold,
    borderRadius: 22,
  },
  toastText: {
    fontFamily: fonts.sansSemi,
    color: brand.nightDeep,
    fontSize: 10,
    letterSpacing: 1.8,
  },
});
