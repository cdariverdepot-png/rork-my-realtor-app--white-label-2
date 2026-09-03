import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Compass,
  Home as HomeIcon,
  LayoutDashboard,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useOnboarding } from "@/contexts/OnboardingContext";

type Step = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  preview: React.ReactNode;
};

const SCREEN_W = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 0.35;

function BrandPreview() {
  const { brand: b } = useBrand();
  return (
    <View style={previewStyles.brandCard}>
      <View style={previewStyles.brandAvatar}>
        <Text style={previewStyles.brandInitials}>{b.realtor.monogram}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={previewStyles.brandLabel}>SIGNATURE</Text>
        <Text style={previewStyles.brandName}>{b.realtor.name}</Text>
        <View style={previewStyles.swatchRow}>
          <View style={[previewStyles.swatch, { backgroundColor: brand.forestDeep }]} />
          <View style={[previewStyles.swatch, { backgroundColor: brand.gold }]} />
          <View style={[previewStyles.swatch, { backgroundColor: brand.nightHi }]} />
        </View>
      </View>
    </View>
  );
}

function ContactsPreview() {
  const rows = ["AC", "MR", "JL", "DK"];
  return (
    <View style={previewStyles.contactsWrap}>
      {rows.map((r, i) => (
        <View key={r} style={[previewStyles.contactRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
          <View style={previewStyles.contactAvatar}>
            <Text style={previewStyles.contactInitials}>{r}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={[previewStyles.bar, { width: "55%" }]} />
            <View style={[previewStyles.bar, { width: "32%", opacity: 0.5 }]} />
          </View>
          <Text style={previewStyles.contactBadge}>NEW</Text>
        </View>
      ))}
    </View>
  );
}

function ListingsPreview() {
  return (
    <View style={previewStyles.listingsWrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={previewStyles.listingRow}>
          <View style={previewStyles.listingThumb} />
          <View style={{ flex: 1, gap: 5 }}>
            <View style={[previewStyles.bar, { width: "70%" }]} />
            <View style={[previewStyles.bar, { width: "40%", opacity: 0.5 }]} />
          </View>
          <View style={previewStyles.listingDot} />
        </View>
      ))}
    </View>
  );
}

function InvitePreview() {
  return (
    <View style={previewStyles.inviteCard}>
      <Text style={previewStyles.inviteEyebrow}>PRIVATE LINK</Text>
      <Text style={previewStyles.inviteLink} numberOfLines={1}>
        vance.app/private/eliza-v
      </Text>
      <View style={previewStyles.inviteRow}>
        <View style={previewStyles.inviteBtn}>
          <Text style={previewStyles.inviteBtnText}>COPY</Text>
        </View>
        <View style={[previewStyles.inviteBtn, previewStyles.inviteBtnPrimary]}>
          <Send size={11} color={brand.forestDeep} strokeWidth={2} />
          <Text style={[previewStyles.inviteBtnText, { color: brand.forestDeep }]}>SHARE</Text>
        </View>
      </View>
    </View>
  );
}

function DashboardPreview() {
  return (
    <View style={previewStyles.dashWrap}>
      <View style={previewStyles.dashRow}>
        <View style={previewStyles.dashTile} />
        <View style={previewStyles.dashTile} />
      </View>
      <View style={previewStyles.dashRow}>
        <View style={previewStyles.dashTile} />
        <View style={previewStyles.dashTile} />
      </View>
      <View style={previewStyles.dashBar}>
        <View style={[previewStyles.dashBarFill, { width: "62%" }]} />
      </View>
    </View>
  );
}

const STEPS: Step[] = [
  {
    key: "brand",
    eyebrow: "01 \u00b7 BRANDING",
    title: "Make it unmistakably you.",
    body: "Your name, photo, voice, and palette flow into every screen \u2014 from the hero to the signature.",
    Icon: Sparkles,
    preview: <BrandPreview />,
  },
  {
    key: "contacts",
    eyebrow: "02 \u00b7 CONTACTS",
    title: "Bring your roster in seconds.",
    body: "Phone, Gmail, Outlook, LinkedIn \u2014 or paste a CSV. Duplicates merge automatically.",
    Icon: Users,
    preview: <ContactsPreview />,
  },
  {
    key: "listings",
    eyebrow: "03 \u00b7 LISTINGS",
    title: "Curate homes with one tap.",
    body: "Paste any property URL \u2014 photos, beds, baths, and price import in seconds. Reorder, hide, or feature anytime.",
    Icon: HomeIcon,
    preview: <ListingsPreview />,
  },
  {
    key: "invite",
    eyebrow: "04 \u00b7 CLIENT INVITES",
    title: "One private link. Done.",
    body: "Text or email it to anyone. They open a branded app that feels like it was built just for them.",
    Icon: Send,
    preview: <InvitePreview />,
  },
  {
    key: "dashboard",
    eyebrow: "05 \u00b7 DASHBOARD",
    title: "Everything within reach.",
    body: "Messages, showings, documents, and insights live one tap away. Tap any tile to dive in.",
    Icon: LayoutDashboard,
    preview: <DashboardPreview />,
  },
];

export default function AdminOnboardingTour() {
  const router = useRouter();
  const { isAdmin, hydrated: authHydrated } = useAuth();
  const { markSeen } = useOnboarding();
  const [index, setIndex] = useState<number>(0);
  const indexRef = useRef<number>(0);
  const animatingRef = useRef<boolean>(false);

  const drag = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1 / STEPS.length)).current;
  const hint = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (authHydrated && !isAdmin) router.replace("/admin/login");
  }, [authHydrated, isAdmin, router]);

  const total = STEPS.length;

  useEffect(() => {
    indexRef.current = index;
    Animated.timing(progress, {
      toValue: (index + 1) / total,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [index, progress, total]);

  // Subtle swipe-hint nudge on first mount.
  useEffect(() => {
    const seq = Animated.sequence([
      Animated.delay(420),
      Animated.timing(hint, {
        toValue: -18,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(hint, {
        toValue: 0,
        duration: 320,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    seq.start();
  }, [hint]);

  const finish = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markSeen();
    router.back();
  };

  const goTo = (next: number, dir: 1 | -1) => {
    if (animatingRef.current) return;
    if (next < 0) {
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      return;
    }
    if (next >= total) {
      // Swipe past the end completes the tour.
      animatingRef.current = true;
      Animated.timing(drag, {
        toValue: -SCREEN_W,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        animatingRef.current = false;
        drag.setValue(0);
        finish();
      });
      return;
    }
    if (Platform.OS !== "web") Haptics.selectionAsync();
    animatingRef.current = true;
    Animated.timing(drag, {
      toValue: dir === 1 ? -SCREEN_W : SCREEN_W,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIndex(next);
      drag.setValue(dir === 1 ? SCREEN_W : -SCREEN_W);
      Animated.timing(drag, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        animatingRef.current = false;
      });
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_e, g) => {
          if (animatingRef.current) return;
          drag.setValue(g.dx);
        },
        onPanResponderRelease: (_e, g) => {
          if (animatingRef.current) return;
          const i = indexRef.current;
          const goingNext = g.dx < -SWIPE_THRESHOLD || g.vx < -VELOCITY_THRESHOLD;
          const goingBack = g.dx > SWIPE_THRESHOLD || g.vx > VELOCITY_THRESHOLD;
          if (goingNext) {
            goTo(i + 1, 1);
          } else if (goingBack) {
            goTo(i - 1, -1);
          } else {
            Animated.spring(drag, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 4,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
      }),
    [drag]
  );

  const step = STEPS[index];

  const progressWidth = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
    [progress]
  );

  const cardOpacity = drag.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: [0.35, 1, 0.35],
    extrapolate: "clamp",
  });

  const isLast = index === total - 1;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.topCenter}>
          <Compass size={11} color={brand.goldDeep} strokeWidth={1.6} />
          <Text style={styles.topLabel}>QUICK TOUR</Text>
        </View>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            markSeen();
            router.back();
          }}
          hitSlop={14}
          style={styles.closeBtn}
        >
          <X size={16} color={brand.muted} strokeWidth={1.6} />
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      <View style={styles.stage} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: cardOpacity,
              transform: [{ translateX: Animated.add(drag, hint) }],
            },
          ]}
        >
          <View style={styles.iconWrap}>
            <step.Icon size={20} color={brand.gold} strokeWidth={1.5} />
          </View>
          <Text style={styles.eyebrow}>{step.eyebrow}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.previewWrap}>{step.preview}</View>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {STEPS.map((s, i) => {
            const active = i === index;
            return (
              <View
                key={s.key}
                style={[
                  styles.dot,
                  active && styles.dotActive,
                  i < index && styles.dotPast,
                ]}
              />
            );
          })}
        </View>

        <Text style={styles.swipeHint}>
          {isLast
            ? "\u2190 SWIPE LEFT TO FINISH"
            : index === 0
            ? "SWIPE TO EXPLORE \u2192"
            : "\u2190 SWIPE \u2192"}
        </Text>

        <Text style={styles.counter}>
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.nightDeep },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 60,
    paddingBottom: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  topLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.5,
  },
  progressTrack: {
    height: 2,
    marginHorizontal: 24,
    backgroundColor: brand.nightLine,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: brand.gold },
  stage: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    justifyContent: "flex-start",
  },
  card: { width: SCREEN_W - 48 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: brand.forestDeep,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 12,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
    marginBottom: 14,
  },
  body: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0.2,
  },
  previewWrap: { marginTop: 32 },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    gap: 14,
    alignItems: "center",
  },
  dotsRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: brand.nightLine,
  },
  dotPast: { backgroundColor: "rgba(210,163,67,0.5)" },
  dotActive: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: brand.gold,
  },
  swipeHint: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.4,
  },
  counter: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 9,
    letterSpacing: 2,
  },
});

const previewStyles = StyleSheet.create({
  brandCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 18,
    backgroundColor: brand.night,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  brandAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: brand.forestDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  brandInitials: {
    fontFamily: fonts.serif,
    color: brand.gold,
    fontSize: 20,
    letterSpacing: 1,
  },
  brandLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 4,
  },
  brandName: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 18,
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  swatchRow: { flexDirection: "row", gap: 6 },
  swatch: {
    width: 22,
    height: 12,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  contactsWrap: {
    backgroundColor: brand.night,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairline,
  },
  contactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: brand.nightHi,
    borderWidth: 1,
    borderColor: brand.nightLine,
    alignItems: "center",
    justifyContent: "center",
  },
  contactInitials: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  contactBadge: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 8,
    letterSpacing: 1.6,
  },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: brand.nightLine,
  },
  listingsWrap: {
    gap: 10,
  },
  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    backgroundColor: brand.night,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  listingThumb: {
    width: 48,
    height: 48,
    backgroundColor: brand.forest,
  },
  listingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: brand.gold,
  },
  inviteCard: {
    padding: 18,
    backgroundColor: brand.forestDeep,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
  },
  inviteEyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  inviteLink: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 17,
    letterSpacing: -0.2,
    marginBottom: 16,
  },
  inviteRow: { flexDirection: "row", gap: 8 },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
    flex: 1,
  },
  inviteBtnPrimary: {
    backgroundColor: brand.gold,
    borderColor: brand.gold,
  },
  inviteBtnText: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  dashWrap: {
    gap: 8,
    padding: 14,
    backgroundColor: brand.night,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  dashRow: { flexDirection: "row", gap: 8 },
  dashTile: {
    flex: 1,
    height: 46,
    backgroundColor: brand.nightHi,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  dashBar: {
    height: 4,
    backgroundColor: brand.nightLine,
    overflow: "hidden",
    marginTop: 4,
  },
  dashBarFill: {
    height: "100%",
    backgroundColor: brand.gold,
  },
});
