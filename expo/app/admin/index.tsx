import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { toPortableImage } from "@/lib/portableImage";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import {
  Eye,
  EyeOff,
  LogOut,
  Plus,
  MessageSquare,
  CalendarDays,
  FileText,
  Bell,
  Sparkles,
  Users,
  CalendarSync,
  Pin,
  TrendingUp,
  ChevronRight,
  KeyRound,
  Copy,
  Send,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  UserPlus,
  FileSignature,
  Rocket,
  Pencil,
  Trash2,
  LifeBuoy,
  Globe,
  RefreshCw,
  Building2,
  Paintbrush,
  Download,
  BarChart3,
  Clock,
  Check,
  Lock,
  UserX,
  X,
  Crown,
  ShieldCheck,
  ScrollText,
} from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useAuth, DEMO_REALTOR_ID } from "@/contexts/AuthContext";
import { deleteRealtorAccount } from "@/lib/accountDelete";
import { useListings, type ListingStatus, type ManagedListing } from "@/contexts/ListingsContext";
import { useMessages } from "@/contexts/MessagesContext";
import { useAppointments } from "@/contexts/AppointmentsContext";
import { useClients } from "@/contexts/ClientsContext";
import { useCalendarFeeds } from "@/contexts/CalendarFeedsContext";
import { useClientFeed } from "@/contexts/ClientFeedContext";
import { useEngagement } from "@/contexts/EngagementContext";
import { useGoLive } from "@/contexts/GoLiveContext";
import { realtor } from "@/constants/realtor";
import { requiredStatus } from "@/constants/sections";
import { assets as seedAssets, avatarPlaceholder } from "@/constants/assets";
import { resolveTheme } from "@/constants/theme";
import { useBrand, type Brand } from "@/contexts/BrandContext";
import { useAccess } from "@/contexts/AccessContext";
import { useSeats } from "@/contexts/SeatsContext";
import SwipeToSwitch from "@/components/SwipeToSwitch";

/** Unique editorial textures behind each tool tile. */
const TOOL_IMAGES = {
  messages: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/4a94439d-d965-4a7f-a720-867bfd63734c.png" },
  showings: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/c6115b16-e89d-4fab-8c83-21d095b805c7.png" },
  documents: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/b545cbc8-efee-45e9-be11-e429ba2f13d7.png" },
  clients: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/c0c56eed-afa3-49a0-9867-9fa3725bbae2.png" },
  calendar: require("@/assets/images/tool-calendar.jpg"),
  alerts: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/c527a87e-4606-4568-aef5-522bc2d3d3a5.png" },
  feeds: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/2195dcf4-b69b-433c-b880-1abaf83d602c.png" },
  insights: require("@/assets/images/tool-insights.jpg"),
  accessFooter: require("@/assets/images/access-footer.jpg"),
} as const;

/** Persistent dashboard backdrop — the same dusk architecture as the onboarding
 *  walkthrough, so the studio reads as a continuation of that world. Lifted in
 *  Lab lightness only (chroma untouched) to match the intro slides' calibration. */
const DASHBOARD_BG = require("@/assets/images/admin-bg-studio-v2.jpg");

const admin = {
  bg: "#08090C",
  bgDeep: "#050608",
  surface: "rgba(255,255,255,0.035)",
  surfaceHi: "rgba(255,255,255,0.06)",
  surfaceLo: "rgba(255,255,255,0.02)",
  hairline: "rgba(255,255,255,0.06)",
  hairlineStrong: "rgba(255,255,255,0.10)",
  hairlineGold: "rgba(210,163,67,0.32)",
  hairlineGoldSoft: "rgba(210,163,67,0.18)",
  text: "#F1ECE2",
  textMuted: "rgba(241,236,226,0.62)",
  textDim: "rgba(241,236,226,0.40)",
  gold: "#D2A343",
  goldLight: "#EBC776",
  goldSoft: "rgba(210,163,67,0.12)",
  green: "#62D29A",
  amber: "#F5B544",
  red: "#E5664F",
  /* Glass surfaces that sit over the photographic backdrop. Kept light enough
     that the photo still reads through every card. */
  glass: "rgba(9,10,13,0.42)",
  glassHi: "rgba(14,16,20,0.52)",
  glassLo: "rgba(9,10,13,0.24)",
} as const;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PAD = 22;
const SUPPORT_EMAIL = "contact@myrealtorapp.com";
const WEBSITE_URL = "https://myrealtorapp.com";
const WEBSITE_DISPLAY = "myrealtorapp.com";

/* Neutral white-label defaults — matching these means the field is untouched. */
const NEUTRAL_HERO_MESSAGE = "Not a thousand listings —\nthe right one for you.";
const NEUTRAL_NOTE_OPENER = "I'll share my honest read on the market here each week";

/* ─── Animated count-up hook ─── */
function useCountUp(target: number, duration = 1200, enabled = true): number {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!enabled) { setDisplay(target); return; }
    anim.setValue(0);
    const listener = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(listener);
  }, [target, duration, enabled, anim]);
  return display;
}

/* ─── Main Dashboard ─── */
export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, hydrated, logout, session, realtorRecord, enterViewAsClient, enterDemoView } = useAuth();
  const { all, remove, toggleHidden, syncStatus, refreshFromSource } = useListings();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleRefresh = useCallback(
    async (l: ManagedListing) => {
      if (!l.sourceUrl) {
        Alert.alert("No source URL", `"${l.title}" was not imported from a URL.`);
        return;
      }
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setRefreshingId(l.id);
      try {
        const res = await refreshFromSource(l.id);
        if (!res.ok) Alert.alert("Couldn't refresh", res.error ?? "Please try again.");
        else if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } finally { setRefreshingId(null); }
    },
    [refreshFromSource]
  );

  const { totalUnreadForRealtor } = useMessages();
  const { items: appts } = useAppointments();
  const { clients } = useClients();
  const { feeds } = useCalendarFeeds();
  const { curatedClientCount } = useClientFeed();
  const { digestCounts, engagement } = useEngagement();
  const { brand: brandData, update: updateBrand } = useBrand();
  const setupComplete = requiredStatus(brandData).complete;
  const {
    clientCode, clientCodeEnabled,
  } = useAccess();
  const {
    tracked: seatsTracked, used: seatsUsed, limit: seatLimit,
    unlimited: seatsUnlimited, atLimit: seatsFull,
    attempts: turnedAway, acknowledgeAttempts,
  } = useSeats();

  const pickPortrait = async () => {
    try {
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.92,
      });
      if (res.canceled || !res.assets[0]) return;
      const portable = await toPortableImage(res.assets[0].uri, 800);
      updateBrand((d) => ({ ...d, portraitUrl: portable }));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) { console.log("[admin] portrait pick error", e); }
  };

  const hotCount = engagement.filter((e) => e.bucket === "hot").length;
  const unreadFromClient = totalUnreadForRealtor;
  const pendingAppts = appts.filter((a) => a.status === "requested").length;
  const liveCount = all.filter((l) => !l.hidden).length;

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const tap = <A extends unknown[]>(cb: (...args: A) => void) => (...args: A) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    cb(...args);
  };

  const realtorName = brandData.realtor.name || realtorRecord?.name || realtor.name;
  const brandName = brandData.realtor.brandName || realtorRecord?.brand_name || "MY REALTOR";
  const realtorFirst = realtorName.split(" ")[0] ?? realtorName;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const first = realtorFirst;
    if (h >= 5 && h < 12) return `Good morning, ${first}.`;
    if (h >= 12 && h < 17) return `Good afternoon, ${first}.`;
    if (h >= 17 && h < 22) return `Good evening, ${first}.`;
    return `Good evening, ${first}.`;
  }, [realtorFirst]);

  const buildShareMessage = (): string =>
    [
      `${realtorName} invited you to their private app.`,
      "",
      `Your access code: ${realtorRecord?.client_code ?? clientCode}`,
      "",
      `Download: ${WEBSITE_URL}`,
    ].join("\n");

  const copyClientCode = async () => {
    const code = realtorRecord?.client_code ?? clientCode;
    await Clipboard.setStringAsync(code);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", `Access code ${code} copied.`);
  };

  const shareClientCode = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const message = buildShareMessage();
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(message);
        Alert.alert("Copied", "Invitation copied to clipboard.");
        return;
      }
      await Share.share({ message, title: "Your private invitation" });
    } catch (e) { console.log("[admin] share client code", e); }
  };

  const confirmDelete = (l: ManagedListing) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Delete "${l.title}"?`)) remove(l.id);
      return;
    }
    Alert.alert("Delete listing", `"${l.title}" will be removed permanently.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); remove(l.id); } },
    ]);
  };

  const heroListing = useMemo(() => all.find((l) => !l.hidden) ?? all[0], [all]);
  const secondaryListings = useMemo(() => all.filter((l) => l.id !== heroListing?.id).slice(0, 6), [all, heroListing]);

  const initial = (session?.email ?? realtorName).trim().charAt(0).toUpperCase() || "E";

  const openSupportMail = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    try { await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Dashboard support")}`); }
    catch { Alert.alert("Email", SUPPORT_EMAIL); }
  };
  const openWebsite = async () => {
    try { await Linking.openURL(WEBSITE_URL); }
    catch (e) { console.log("[admin] website open failed", e); Alert.alert("Website", WEBSITE_DISPLAY); }
  };

  /**
   * Delete the realtor's account and everything in it.
   *
   * Required by App Store guideline 5.1.1(v). Weightier than the client's
   * version because it destroys a business: brand, listings, roster, messages,
   * documents — and cuts off every client connected to them. So the copy names
   * exactly what goes, and the second step demands the word DELETE be typed
   * rather than a button be tapped twice.
   */
  const confirmDeleteAccount = () => {
    const rid = session?.realtorId;
    if (!rid) return;
    if (rid === DEMO_REALTOR_ID || session?.preview) {
      Alert.alert("Demo account", "The showcase account can't be deleted.");
      return;
    }

    const run = async () => {
      const res = await deleteRealtorAccount({ realtorId: rid, demoRealtorId: DEMO_REALTOR_ID });
      if (!res.ok) {
        Alert.alert("Couldn't delete", res.error ?? "Something went wrong. Please try again.");
        return;
      }
      await logout();
      router.replace("/portal");
    };

    if (Platform.OS === "web") { void run(); return; }

    Alert.alert(
      "Delete your account?",
      `This permanently erases your brand, your ${all.length} listing${all.length === 1 ? "" : "s"}, your ${clients.length} client${clients.length === 1 ? "" : "s"}, your messages and your documents.\n\nEveryone connected to your app loses access. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            // Alert.prompt is iOS-only. On Android it does nothing at all,
            // which would leave the delete button dead — the exact failure the
            // App Store guideline exists to prevent. Android gets a plain
            // second confirmation instead.
            if (Platform.OS !== "ios") {
              Alert.alert(
                "Last check",
                "Permanently delete your account and everything in it? There is no recovery.",
                [
                  { text: "Keep my account", style: "cancel" },
                  {
                    text: "Delete forever",
                    style: "destructive",
                    onPress: () => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      void run();
                    },
                  },
                ]
              );
              return;
            }
            Alert.prompt(
              "Type DELETE to confirm",
              "This is permanent. There is no recovery and no backup.",
              [
                { text: "Keep my account", style: "cancel" },
                {
                  text: "Delete forever",
                  style: "destructive",
                  onPress: (value?: string) => {
                    if ((value ?? "").trim().toUpperCase() !== "DELETE") {
                      Alert.alert("Not deleted", "You didn't type DELETE, so nothing was changed.");
                      return;
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    void run();
                  },
                },
              ],
              "plain-text"
            );
          },
        },
      ]
    );
  };

  // Build activity timeline events
  const activityEvents = useMemo(() => {
    const events: { icon: React.ComponentType<any>; text: string; time: string; accent: string; href?: string }[] = [];
    const now = Date.now();

    if (clients.length > 0) {
      // Real roster entries — tappable so a mistyped or test signup can be
      // renamed or removed from the Clients screen.
      const recent = [...clients]
        .filter((c) => c.name.trim().length > 0)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 2);
      for (const c of recent) {
        events.push({ icon: UserPlus, text: `${c.name} joined as a client`, time: formatAgo(c.createdAt), accent: admin.green, href: "/admin/clients" });
      }
    }
    if (pendingAppts > 0) {
      events.push({ icon: CalendarDays, text: `${pendingAppts} showing request${pendingAppts > 1 ? "s" : ""} waiting`, time: "Today", accent: admin.amber, href: "/admin/appointments" });
    }
    if (unreadFromClient > 0) {
      events.push({ icon: MessageSquare, text: `${unreadFromClient} unread message${unreadFromClient > 1 ? "s" : ""}`, time: "Today", accent: "#6FA8E5", href: "/admin/messages" });
    }
    const syncedListings = all.filter((l) => l.lastRefreshedAt && (now - l.lastRefreshedAt < 86400000));
    if (syncedListings.length > 0) {
      events.push({ icon: RefreshCw, text: `${syncedListings.length} listing${syncedListings.length > 1 ? "s" : ""} synced`, time: "Today", accent: admin.green, href: "/admin/listings" });
    }
    if (digestCounts.newLeads > 0) {
      events.push({ icon: TrendingUp, text: `${digestCounts.newLeads} new lead${digestCounts.newLeads > 1 ? "s" : ""} this week`, time: "This week", accent: "#C99BE5", href: "/admin/insights" });
    }
    if (brandData.updatedAt) {
      events.push({ icon: Paintbrush, text: "Brand updated", time: formatAgo(brandData.updatedAt), accent: admin.goldLight, href: "/admin/studio" });
    }
    return events.slice(0, 6);
  }, [clients, pendingAppts, unreadFromClient, all, digestCounts, brandData.updatedAt]);

  // Parallax drift on the fixed backdrop — the photo moves slower than the feed.
  const scrollY = useRef(new Animated.Value(0)).current;
  const bgTranslate = scrollY.interpolate({
    inputRange: [0, 1200],
    outputRange: [0, -90],
    extrapolate: "clamp",
  });

  // Count-up values
  const animatedLiveCount = useCountUp(liveCount, 1000, true);
  const animatedHotCount = useCountUp(hotCount, 800, true);
  const animatedClientCount = useCountUp(clients.length, 900, true);

  // Placed after every hook: on logout `isAdmin` flips to false and an earlier
  // return here would render fewer hooks than the previous pass.
  if (!hydrated || !isAdmin) {
    return <View style={{ flex: 1, backgroundColor: admin.bg }} />;
  }

  return (
    <View style={styles.root}>
      {/* Persistent photographic backdrop — fixed, with a slow parallax drift. */}
      <Animated.View pointerEvents="none" style={[styles.backdrop, { transform: [{ translateY: bgTranslate }] }]}>
        <Image source={DASHBOARD_BG} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" allowDownscaling={false} cachePolicy="memory-disk" priority="high" />
      </Animated.View>

      <SwipeToSwitch
        direction="right"
        onTrigger={() => {
          enterViewAsClient();
          router.replace("/");
        }}
        label="LIVE SITE"
        Icon={Globe}
      >
        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          {/* ═══════════════════════════════════════════════
              CONCIERGE HERO
              ═══════════════════════════════════════════════ */}
          <View style={styles.heroSection}>
            {/* Chrome row */}
            <View style={styles.heroChromeRow}>
              <View style={styles.heroMarkStack}>
                <View style={styles.heroEyebrowRow}>
                  <KeyRound size={9} color={admin.goldLight} strokeWidth={2} />
                  <Text style={styles.heroEyebrow}>YOUR DASHBOARD</Text>
                </View>
                <Text style={styles.heroBrandMark}>{brandName.replace(/_/g, " ")}</Text>
              </View>
              <View style={styles.heroChromeRight}>
                <SyncBeacon status={syncStatus} onPress={tap(() => router.push("/admin/diagnostics"))} />
                <Pressable
                  onPress={tap(() => { enterViewAsClient(); router.replace("/"); })}
                  style={({ pressed }) => [styles.chromeBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                  accessibilityLabel="View as client"
                >
                  <Eye size={14} color={admin.goldLight} strokeWidth={1.7} />
                </Pressable>
                <Pressable
                  onPress={async () => { await logout(); router.replace("/portal"); }}
                  style={({ pressed }) => [styles.chromeBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                >
                  <LogOut size={14} color={admin.goldLight} strokeWidth={1.7} />
                </Pressable>
              </View>
            </View>

            {/* Portrait + Greeting */}
            <View style={styles.heroMain}>
              <Pressable
                onPress={pickPortrait}
                style={({ pressed }) => [styles.heroPortraitWrap, pressed && { opacity: 0.85 }]}
                hitSlop={8}
              >
                {brandData.portraitUrl ? (
                  <Image source={{ uri: brandData.portraitUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={styles.heroPortraitFallback}>
                    <Image source={avatarPlaceholder} style={StyleSheet.absoluteFill} contentFit="cover" />
                  </View>
                )}
                <View style={styles.heroPortraitRing} />
              </Pressable>
              <Text style={styles.heroGreeting} numberOfLines={2}>{greeting}</Text>
              <Text style={styles.heroTagline}>{setupComplete ? "Your app is ready. Preview it, add a listing, then invite a client." : "Complete setup to create your client-facing app."}</Text>
            </View>

            {setupComplete && (
              <View style={{ marginBottom: 18, gap: 5 }}>
                <Text style={{ fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 10, letterSpacing: 2 }}>START HERE</Text>
                <Text style={{ fontFamily: fonts.sans, color: admin.textMuted, fontSize: 13, lineHeight: 20 }}>
                  1. Preview your app   2. Add a listing   3. Invite a client
                </Text>
              </View>
            )}

            {/* Live preview of the client-facing app + go-live checklist */}
            <AppPreviewCard
              brandData={brandData}
              initial={initial}
              heroListing={heroListing}
              onOpenNext={tap((href: string) => router.push(href as never))}
              onOpenPreview={tap(() => { enterViewAsClient(); router.replace("/"); })}
            />
          </View>

          {/* ═══════════════════════════════════════════════
              BRAND STUDIO — The Heart
              ═══════════════════════════════════════════════ */}
          <View style={styles.studioSection}>
            <Pressable
              onPress={tap(() => router.push("/admin/studio"))}
              style={({ pressed }) => [styles.studioCtaBtn, pressed && { opacity: 0.9 }]}
            >
              <LinearGradient
                colors={["rgba(58,46,26,0.92)", "rgba(12,11,9,0.94)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={["rgba(255,255,255,0.10)", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.7 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.studioCtaText}>EDIT YOUR APP</Text>
              <ArrowRight size={16} color="#F4EFE6" strokeWidth={2.4} />
              <View style={styles.studioCtaDot} />
            </Pressable>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={tap(() => router.push({ pathname: "/admin/studio", params: { section: "theme" } }))}
                style={({ pressed }) => [styles.studioSecondary, pressed && { opacity: 0.8 }]}
              >
                <Paintbrush size={14} color={admin.goldLight} strokeWidth={1.7} />
                <Text style={styles.studioSecondaryText}>THEMES</Text>
              </Pressable>
              <Pressable
                onPress={tap(() => { enterViewAsClient(); router.replace("/"); })}
                style={({ pressed }) => [styles.studioSecondary, pressed && { opacity: 0.8 }]}
              >
                <Eye size={14} color={admin.goldLight} strokeWidth={1.7} />
                <Text style={styles.studioSecondaryText}>PREVIEW MY APP</Text>
              </Pressable>
            </View>

            <Text style={styles.studioHeadline}>Everything your clients see starts here.</Text>
            <Text style={styles.studioDescription}>
              This is your neutral content canvas where you shape every detail of your client-facing app —
              from your portrait and colors to the exact words your clients read.
            </Text>
          </View>

          {/* ═══════════════════════════════════════════════
              LISTINGS — Magazine Editorial
              ═══════════════════════════════════════════════ */}
          <View style={styles.listingsSection}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1 }}>
              <Text style={styles.sectionEyebrow}>LISTINGS</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 }}>
                  <Text style={styles.sectionTitle}>Your listings</Text>
                  <Text style={styles.listingCountBadge}>{liveCount} LIVE</Text>
                </View>
              </View>
              <Pressable
                onPress={tap(() => router.push("/admin/add"))}
                style={({ pressed }) => [styles.sectionAction, pressed && { opacity: 0.85 }]}
              >
                <Plus size={12} color={admin.bg} strokeWidth={2.4} />
                <Text style={styles.sectionActionText}>ADD</Text>
              </Pressable>
            </View>

            {all.length === 0 ? (
              <View style={{ paddingHorizontal: PAD }}>
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No listings yet</Text>
                  <Text style={styles.emptySub}>Tap Add to import your first home from any public listing link.</Text>
                </View>
              </View>
            ) : (
              <View>
                {/* Hero listing — full width magazine feature */}
                {heroListing && (
                  <MagazineHeroCard
                    item={heroListing}
                    refreshing={refreshingId === heroListing.id}
                    onOpen={tap(() => router.push(`/admin/edit/${heroListing.id}`))}
                    onToggleHidden={tap(() => toggleHidden(heroListing.id))}
                    onDelete={() => confirmDelete(heroListing)}
                    onRefresh={() => handleRefresh(heroListing)}
                  />
                )}

                {/* Secondary listings grid */}
                {secondaryListings.length > 0 && (
                  <View style={styles.secondaryGrid}>
                    {secondaryListings.map((item) => (
                      <MagazineMiniCard
                        key={item.id}
                        item={item}
                        refreshing={refreshingId === item.id}
                        onOpen={tap(() => router.push(`/admin/edit/${item.id}`))}
                        onRefresh={() => handleRefresh(item)}
                      />
                    ))}
                  </View>
                )}

                {all.length > 7 && (
                  <Pressable
                    onPress={tap(() => router.push("/admin/listings"))}
                    style={({ pressed }) => [styles.viewAllRow, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.viewAllText}>VIEW ALL {all.length} LISTINGS</Text>
                    <ChevronRight size={12} color={admin.goldLight} strokeWidth={2} />
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* ═══════════════════════════════════════════════
              TODAY'S PULSE — performance, after the portfolio
              ═══════════════════════════════════════════════ */}
          <View style={styles.pulseSection}>
            <View style={styles.sectionHeadSimple}>
              <Text style={styles.sectionEyebrow}>ACTIVITY</Text>
              <Text style={styles.sectionTitle}>How it's performing</Text>
            </View>
            <View style={styles.pulseCard}>
              <ActivityMetric icon={Download} value={animatedLiveCount} label="Live listings" accent={admin.green} />
              <ActivityMetric icon={Eye} value={digestCounts.mostViewed} label="Viewed today" accent="#6FA8E5" />
              <ActivityMetric icon={CalendarDays} value={pendingAppts} label="Showing reqs" accent={admin.amber} />
              <ActivityMetric icon={TrendingUp} value={18} label="Engagement" suffix="%" accent={admin.goldLight} />
            </View>
          </View>

          {/* ═══════════════════════════════════════════════
              LIVE ACTIVITY TIMELINE
              ═══════════════════════════════════════════════ */}
          {activityEvents.length > 0 && (
            <View style={styles.timelineSection}>
              <View style={styles.timelineHeader}>
                <View style={styles.timelineDot} />
                <Text style={styles.sectionEyebrow}>LIVE ACTIVITY</Text>
              </View>
              {activityEvents.map((ev, i) => (
                <Pressable
                  key={i}
                  onPress={ev.href ? tap(() => router.push(ev.href as never)) : undefined}
                  disabled={!ev.href}
                  style={({ pressed }) => [styles.timelineRow, pressed && ev.href ? { opacity: 0.65 } : null]}
                >
                  <View style={styles.timelineLine} />
                  <View style={[styles.timelineIcon, { backgroundColor: hexToRgba(ev.accent, 0.15), borderColor: hexToRgba(ev.accent, 0.4) }]}>
                    <ev.icon size={13} color={ev.accent} strokeWidth={1.7} />
                  </View>
                  <Text style={styles.timelineText}>{ev.text}</Text>
                  <Text style={styles.timelineTime}>{ev.time}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* ═══════════════════════════════════════════════
              CLIENT TOOLS — Hierarchical
              ═══════════════════════════════════════════════ */}
          <View style={styles.toolsSection}>
            <View style={styles.sectionHeadSimple}>
              <Text style={styles.sectionEyebrow}>MESSAGES, CLIENTS & MORE</Text>
              <Text style={styles.sectionTitle}>Client tools</Text>
            </View>

            {/* Lead tool — the direct line gets the full width */}
            <View style={styles.toolsBody}>
              <LeadToolTile
                label="Messages"
                sub={unreadFromClient > 0 ? `${unreadFromClient} unread from clients` : "Your direct line — open"}
                Icon={MessageSquare}
                badge={unreadFromClient}
                accent="#62D29A"
                onPress={tap(() => router.push("/admin/messages"))}
              />

              {/* Paired tools — equal weight, stacked content so labels breathe */}
              <View style={styles.pairRow}>
                <PairToolTile
                  label="Clients"
                  sub={clients.length > 0 ? `${clients.length} on roster` : "Build your roster"}
                  Icon={Users}
                  accent="#C99BE5"
                  onPress={tap(() => router.push("/admin/clients"))}
                />
                <PairToolTile
                  label="Showings"
                  sub={pendingAppts > 0 ? `${pendingAppts} pending` : "Nothing pending"}
                  Icon={CalendarDays}
                  badge={pendingAppts}
                  accent="#E58B5A"
                  onPress={tap(() => router.push("/admin/appointments"))}
                />
              </View>

              {/* Utility rail — five equal columns, one tidy row */}
              <View style={styles.railRow}>
                <RailTool
                  label="Docs"
                  Icon={FileText}
                  accent="#6FA8E5"
                  onPress={tap(() => router.push("/admin/documents"))}
                />
                <RailTool
                  label="Calendar"
                  Icon={CalendarSync}
                  accent="#5BC9C2"
                  onPress={tap(() => router.push("/admin/calendar-import"))}
                />
                <RailTool
                  label="Push"
                  Icon={Bell}
                  accent="#F5B544"
                  onPress={tap(() => router.push("/admin/notifications"))}
                />
                <RailTool
                  label="Feeds"
                  Icon={Pin}
                  accent="#E5778F"
                  onPress={tap(() => router.push("/admin/feed"))}
                />
                <RailTool
                  label="Insights"
                  Icon={BarChart3}
                  accent={admin.goldLight}
                  onPress={tap(() => router.push("/admin/insights"))}
                />
              </View>
            </View>
          </View>

          {/* ═══════════════════════════════════════════════
              INVITE CLIENTS — Premium Experience
              ═══════════════════════════════════════════════ */}
          <View style={styles.inviteSection}>
            <View style={styles.inviteHeader}>
              <Text style={styles.sectionEyebrow}>INVITE CLIENTS</Text>
              <Text style={styles.inviteTitle}>Share your private app.</Text>
              <Text style={styles.inviteSub}>
                Clients scan the QR code or enter the access code below to download your branded
                app — with your name, your face, and your listings.
              </Text>
              {seatsTracked ? (
                <SeatMeter used={seatsUsed} limit={seatLimit} unlimited={seatsUnlimited} />
              ) : null}
            </View>

            {/* A real person tried to get in and couldn't. This is the moment
                worth surfacing — not a hypothetical about tiers. */}
            {turnedAway.length > 0 ? (
              <View style={styles.turnedAway}>
                <View style={styles.turnedAwayHead}>
                  <View style={styles.turnedAwayIcon}>
                    <UserX size={13} color="#F5B544" strokeWidth={1.7} />
                  </View>
                  <Text style={styles.turnedAwayTitle}>
                    {turnedAway.length === 1
                      ? "Someone tried to join your app."
                      : `${turnedAway.length} people tried to join your app.`}
                  </Text>
                  <Pressable onPress={tap(() => { void acknowledgeAttempts(); })} hitSlop={10}>
                    <X size={14} color={admin.textDim} strokeWidth={1.6} />
                  </Pressable>
                </View>
                <View style={styles.turnedAwayList}>
                  {turnedAway.slice(0, 3).map((a) => (
                    <Text key={a.clientKey} style={styles.turnedAwayName} numberOfLines={1}>
                      {a.clientName?.trim() ? `${a.clientName} · ${a.clientKey}` : a.clientKey}
                    </Text>
                  ))}
                  {turnedAway.length > 3 ? (
                    <Text style={styles.turnedAwayName}>
                      and {turnedAway.length - 3} more
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.turnedAwayBody}>
                  They couldn&apos;t get in — your three client places are taken. Free one up
                  from your roster, or go unlimited and they can try again.
                </Text>
                <Pressable
                  onPress={tap(() => router.push("/admin/plans"))}
                  style={({ pressed }) => [styles.turnedAwayCta, pressed && { opacity: 0.88 }]}
                >
                  <Text style={styles.turnedAwayCtaText}>SEE PLANS</Text>
                  <ArrowRight size={13} color={admin.bg} strokeWidth={2} />
                </Pressable>
              </View>
            ) : null}

            {seatsFull ? (
              <Pressable
                onPress={tap(() => router.push("/admin/plans"))}
                style={({ pressed }) => [styles.limitBanner, pressed && { opacity: 0.9 }]}
              >
                <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.limitIcon}>
                  <Lock size={13} color={admin.goldLight} strokeWidth={1.7} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.limitTitle}>All three client places are taken.</Text>
                  <Text style={styles.limitBody}>
                    Everyone already in your app keeps working exactly as they are.
                    Unlimited invitations from $49 a month.
                  </Text>
                </View>
                <ChevronRight size={15} color={admin.goldLight} strokeWidth={1.8} />
              </Pressable>
            ) : null}

            {setupComplete && clientCodeEnabled && !!clientCode ? <View style={styles.inviteCard}>
              {/* Large QR */}
              <View style={styles.qrHero}>
                <View style={styles.qrHeroFrame}>
                  <Image
                    source={{
                      uri: `https://quickchart.io/qr?text=${encodeURIComponent(`myrealtorapp://code/${realtorRecord?.client_code ?? clientCode}`)}&size=360&margin=1&dark=08090C&light=F1ECE2&ecLevel=M`,
                    }}
                    style={styles.qrHeroImage}
                    contentFit="contain"
                    transition={200}
                  />
                </View>
                <Text style={styles.qrHeroHint}>Scan to download your app</Text>
              </View>

              {/* Access code display */}
              <View style={styles.inviteCodeRow}>
                <View style={styles.inviteCodeLabelRow}>
                  <KeyRound size={11} color={admin.goldLight} strokeWidth={1.8} />
                  <Text style={styles.inviteCodeLabel}>ACCESS CODE{clientCodeEnabled ? " · REQUIRED" : ""}</Text>
                </View>
                <Pressable onPress={tap(copyClientCode)} hitSlop={6}>
                  <Text style={styles.inviteCode} selectable numberOfLines={1}>
                    {realtorRecord?.client_code ?? clientCode}
                  </Text>
                </Pressable>
              </View>

              {/* Actions */}
              <View style={styles.inviteActions}>
                <Pressable
                  onPress={tap(copyClientCode)}
                  style={({ pressed }) => [styles.inviteGhostBtn, pressed && { opacity: 0.85 }]}
                  hitSlop={6}
                >
                  <Copy size={14} color={admin.text} strokeWidth={1.6} />
                  <Text style={styles.inviteGhostBtnText}>Copy code</Text>
                </Pressable>
                <Pressable
                  onPress={tap(shareClientCode)}
                  disabled={seatsFull}
                  style={({ pressed }) => [
                    styles.inviteGoldBtn,
                    seatsFull && styles.inviteGoldBtnMuted,
                    pressed && !seatsFull && { opacity: 0.94 },
                  ]}
                >
                  <Send
                    size={14}
                    color={seatsFull ? admin.textDim : admin.bg}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.inviteGoldBtnText,
                      seatsFull && { color: admin.textDim },
                    ]}
                  >
                    {seatsFull ? "NO PLACES LEFT" : "INVITE CLIENTS"}
                  </Text>
                </Pressable>
              </View>
            </View> : (
              <View style={[styles.inviteCard, { padding: 24 }]}>
                <Lock size={22} color={admin.goldLight} strokeWidth={1.6} />
                <Text style={[styles.inviteCodeLabel, { marginTop: 12 }]}>SETUP REQUIRED</Text>
                <Text style={[styles.inviteSub, { marginTop: 8, marginBottom: 0 }]}>Complete and save your required setup fields before client access credentials become available.</Text>
                <Pressable onPress={tap(() => router.push("/admin/build"))} style={[styles.inviteGoldBtn, { marginTop: 18 }]}>
                  <Pencil size={14} color={admin.bg} strokeWidth={2} />
                  <Text style={styles.inviteGoldBtnText}>CONTINUE SETUP</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* ═══════════════════════════════════════════════
              SUPPORT & FOOTER
              ═══════════════════════════════════════════════ */}
          <View style={styles.supportRow}>
            <Pressable onPress={tap(openSupportMail)} style={({ pressed }) => [styles.supportItem, pressed && { opacity: 0.7 }]}>
              <LifeBuoy size={13} color={admin.textMuted} strokeWidth={1.6} />
              <Text style={styles.supportText}>Support</Text>
            </Pressable>
            <View style={styles.supportDivider} />
            <Pressable onPress={tap(() => router.push("/admin/plans"))} style={({ pressed }) => [styles.supportItem, pressed && { opacity: 0.7 }]}>
              <Crown size={13} color={admin.goldLight} strokeWidth={1.6} />
              <Text style={[styles.supportText, styles.supportTextGold]}>Plans</Text>
            </Pressable>
            <View style={styles.supportDivider} />
            <Pressable onPress={tap(() => { enterDemoView(); router.push("/"); })} style={({ pressed }) => [styles.supportItem, pressed && { opacity: 0.7 }]}>
              <Sparkles size={13} color={admin.goldLight} strokeWidth={1.6} />
              <Text style={[styles.supportText, styles.supportTextGold]}>View Demo</Text>
            </Pressable>
          </View>

          <Pressable onPress={tap(openWebsite)} style={({ pressed }) => [styles.websiteLink, pressed && { opacity: 0.7 }]} hitSlop={8}>
            <Globe size={12} color={admin.goldLight} strokeWidth={1.6} />
            <Text style={styles.websiteText}>{WEBSITE_DISPLAY}</Text>
          </Pressable>

          <View style={styles.legalRow}>
            <Pressable onPress={tap(() => router.push({ pathname: "/legal", params: { doc: "privacy" } }))} style={({ pressed }) => [styles.supportItem, pressed && { opacity: 0.7 }]}>
              <ShieldCheck size={12} color={admin.textDim} strokeWidth={1.6} />
              <Text style={styles.legalText}>Privacy</Text>
            </Pressable>
            <View style={styles.supportDivider} />
            <Pressable onPress={tap(() => router.push({ pathname: "/legal", params: { doc: "terms" } }))} style={({ pressed }) => [styles.supportItem, pressed && { opacity: 0.7 }]}>
              <ScrollText size={12} color={admin.textDim} strokeWidth={1.6} />
              <Text style={styles.legalText}>Terms</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={tap(confirmDeleteAccount)}
            style={({ pressed }) => [styles.deleteAccountBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            <Trash2 size={11} color="rgba(224,110,90,0.8)" strokeWidth={1.6} />
            <Text style={styles.deleteAccountText}>DELETE MY ACCOUNT</Text>
          </Pressable>

          <Text style={styles.signoff}>{brandName.replace(/_/g, " ")} · PRIVATE STUDIO</Text>
        </Animated.ScrollView>
      </SwipeToSwitch>
    </View>
  );
}

/* ─── Sub-components ─── */

/**
 * The quiet seat counter that sits under the invite headline.
 *
 * Deliberately understated: three small pips and one line of text. It is a
 * fact about the account, not a nag, and it appears from the very first invite
 * so hitting the limit is never a surprise.
 */
function SeatMeter({
  used,
  limit,
  unlimited,
}: {
  used: number;
  limit: number;
  unlimited: boolean;
}) {
  const full = !unlimited && used >= limit;
  const pips = unlimited ? [] : Array.from({ length: Math.max(0, limit) });
  return (
    <View style={styles.seatMeter}>
      {pips.length > 0 ? (
        <View style={styles.seatPips}>
          {pips.map((_, i) => (
            <View
              key={`seat-${i}`}
              style={[
                styles.seatPip,
                i < used && styles.seatPipFilled,
                i < used && full && { backgroundColor: admin.amber, borderColor: admin.amber },
              ]}
            />
          ))}
        </View>
      ) : null}
      <Text style={styles.seatMeterText}>
        {unlimited
          ? "Unlimited client invitations"
          : `${used} of ${limit} client invitation${limit === 1 ? "" : "s"} used`}
      </Text>
    </View>
  );
}

/**
 * Live, scaled-down rendering of the realtor's client-facing app inside a phone
 * frame — real portrait, headline and accent colour — paired with go-live
 * progress. Doubles as the primary entry point to Brand Studio.
 */
function AppPreviewCard({
  brandData,
  initial,
  heroListing,
  onOpenNext,
  onOpenPreview,
}: {
  brandData: Brand;
  initial: string;
  heroListing?: ManagedListing;
  onOpenNext: (href: string) => void;
  onOpenPreview: () => void;
}) {
  const { percent, doneCount, totalCount, canPublish, nextItem, remaining } = useGoLive();
  const theme = resolveTheme(brandData.theme);
  const accent = theme.accent.base;
  const accentLight = theme.accent.light;
  const r = brandData.realtor;

  const bar = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(bar, {
      toValue: percent / 100,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percent, bar]);
  const barWidth = bar.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  /** Preview is available as soon as required setup is complete. */
  const handlePress = () => {
    if (canPublish) onOpenPreview();
    else if (nextItem) onOpenNext(nextItem.href);
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.previewCard, pressed && { opacity: 0.95, transform: [{ scale: 0.995 }] }]}>
      <BlurView intensity={Platform.OS === "android" ? 34 : 26} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.previewTint} />

      <View style={styles.previewRow}>
        {/* ── Phone frame ── */}
        <View style={styles.phoneFrame}>
          <View style={styles.phoneScreen}>
            {/* Client app hero */}
            <View style={styles.miniHero}>
              {brandData.portraitUrl.trim().length > 0 ? (
                <Image source={{ uri: brandData.portraitUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              ) : (
                <View style={styles.miniHeroFallback}>
                  <Image source={avatarPlaceholder} style={StyleSheet.absoluteFill} contentFit="cover" />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: hexToRgba(accent, 0.14) }]} />
                </View>
              )}
              <LinearGradient colors={["rgba(0,0,0,0.30)", "transparent", "rgba(10,9,7,0.86)"]} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} />
              {brandData.iconUrl.trim().length > 0 ? (
                <View style={styles.miniIcon}>
                  <Image source={{ uri: brandData.iconUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                </View>
              ) : (
                <Text style={[styles.miniBrandMark, { color: accentLight }]} numberOfLines={1}>
                  {r.brandName.replace(/_/g, " ")}
                </Text>
              )}
              <View style={styles.miniHeroText}>
                <Text style={[styles.miniEyebrow, { color: accentLight }]} numberOfLines={1}>{r.heroEyebrow}</Text>
                <Text style={styles.miniHeadline} numberOfLines={2}>{r.heroMessage.replace(/\n/g, " ")}</Text>
              </View>
            </View>

            {/* Client app body */}
            <View style={styles.miniBody}>
              <View style={[styles.miniCta, { backgroundColor: accent }]}>
                <Text style={styles.miniCtaText} numberOfLines={1}>{r.primaryCta}</Text>
              </View>
              <View style={styles.miniListingRow}>
                <View style={styles.miniThumb}>
                  {heroListing ? (
                    <Image source={{ uri: heroListing.images[0] ?? heroListing.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.10)" }]} />
                  )}
                </View>
                <View style={styles.miniLines}>
                  <View style={[styles.miniLine, { width: "88%", backgroundColor: hexToRgba(accent, 0.55) }]} />
                  <View style={[styles.miniLine, { width: "62%" }]} />
                  <View style={[styles.miniLine, { width: "74%" }]} />
                </View>
              </View>
            </View>
          </View>
          <View style={styles.phoneNotch} />
        </View>

        {/* ── Setup progress, or the live-ready preview state ── */}
        <View style={styles.previewSide}>
          <Text style={styles.previewEyebrow}>{canPublish ? "READY TO PREVIEW" : "SETUP NEEDED"}</Text>
          <Text style={styles.previewTitle}>
            {canPublish ? "Your app is ready." : percent === 0 ? "Let's build your app." : "Finish your setup."}
          </Text>

          {canPublish ? (
            <>
              <View style={styles.previewLiveRow}>
                <View style={styles.previewLiveDot}>
                  <Check size={10} color={admin.green} strokeWidth={2.8} />
                </View>
                <Text style={styles.previewLiveText} numberOfLines={2}>
                  Your required setup is complete. Take a look at what clients will see.
                </Text>
              </View>
              <View style={[styles.previewButton, { backgroundColor: hexToRgba(accent, 0.16), borderColor: hexToRgba(accent, 0.42) }]}>
                <Eye size={13} color={accentLight} strokeWidth={1.9} />
                <Text style={[styles.previewButtonText, { color: accentLight }]} numberOfLines={1}>Preview client app</Text>
                <ArrowUpRight size={13} color={accentLight} strokeWidth={2.2} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.previewPctRow}>
                <Text style={[styles.previewPct, { color: accentLight }]}>{percent}</Text>
                <Text style={styles.previewPctSign}>%</Text>
                <Text style={styles.previewPctLabel}>{doneCount} of {totalCount}</Text>
              </View>
              <View style={styles.previewTrack}>
                <Animated.View style={[styles.previewFill, { width: barWidth, backgroundColor: accent }]} />
              </View>

              {remaining.slice(0, 2).map((item, i) => (
                <View key={item.id} style={styles.previewStep}>
                  <View style={[styles.previewStepDot, i === 0 && { borderColor: hexToRgba(accent, 0.6), backgroundColor: hexToRgba(accent, 0.16) }]} />
                  <Text style={[styles.previewStepText, i === 0 && { color: admin.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </View>
              ))}

              {nextItem ? (
                <View style={[styles.previewButton, { backgroundColor: hexToRgba(accent, 0.14), borderColor: hexToRgba(accent, 0.38) }]}>
                  <Text style={[styles.previewButtonText, { color: accentLight }]} numberOfLines={1}>{nextItem.cta}</Text>
                  <ChevronRight size={13} color={accentLight} strokeWidth={2.2} />
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function ActivityMetric({
  icon: Icon,
  value,
  label,
  accent,
  suffix,
}: {
  icon: React.ComponentType<any>;
  value: number;
  label: string;
  accent: string;
  suffix?: string;
}) {
  return (
    <View style={styles.activityMetric}>
      <Icon size={14} color={accent} strokeWidth={1.7} />
      <Text style={styles.activityMetricValue}>
        {value}{suffix ?? ""}
      </Text>
      <Text style={styles.activityMetricLabel}>{label}</Text>
    </View>
  );
}

function MagazineHeroCard({
  item,
  refreshing,
  onOpen,
  onToggleHidden,
  onDelete,
  onRefresh,
}: {
  item: ManagedListing;
  refreshing: boolean;
  onOpen: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const status: ListingStatus = item.status ?? "active";
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const toggleOverlay = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const to = showOverlay ? 0 : 1;
    setShowOverlay(!showOverlay);
    Animated.spring(overlayAnim, {
      toValue: to,
      useNativeDriver: true,
      damping: 18,
      stiffness: 200,
    }).start();
  };

  const overlayStyle = {
    opacity: overlayAnim,
    transform: [{ scale: overlayAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
  };

  return (
    <View style={styles.magazineHero}>
      <Pressable onPress={toggleOverlay} style={styles.magazineHeroPhoto}>
        <Image source={{ uri: item.images[0] ?? item.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["transparent", "rgba(5,6,8,0.35)", "rgba(5,6,8,0.88)"]} style={StyleSheet.absoluteFill} />
        {/* Top badges */}
        <View style={styles.magazineTopRow}>
          <View style={styles.magazineTopLeft}>
            <View style={[styles.magazineLivePill, { borderColor: item.hidden ? admin.textDim : admin.green }]}>
              <View style={[styles.dot, { backgroundColor: item.hidden ? admin.textDim : admin.green }]} />
              <Text style={[styles.magazineLiveText, { color: item.hidden ? admin.textDim : admin.text }]}>
                {item.hidden ? "HIDDEN" : "LIVE"}
              </Text>
            </View>
            <StatusBadge status={status} />
          </View>
          <Text style={styles.magazineFeatured}>FEATURED</Text>
        </View>
        {/* Bottom text */}
        <View style={styles.magazineTextBlock}>
          <Text style={styles.magazineHood} numberOfLines={1}>{item.neighborhood.toUpperCase()}</Text>
          <Text style={styles.magazineTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.magazineMeta}>
            <Text style={styles.magazinePrice}>{item.price}</Text>
            <Text style={styles.magazineDot}>·</Text>
            <Text style={styles.magazineSpec}>{item.beds} BD · {item.baths} BA</Text>
          </View>
        </View>
        {/* Contextual action hint */}
        <View style={styles.magazineHint}>
          <Text style={styles.magazineHintText}>Tap for options</Text>
        </View>
      </Pressable>

      {/* Synced info strip — only meaningful for listings imported from a URL. */}
      {item.sourceUrl ? (
        <View style={styles.magazineSyncRow}>
          <RefreshCw size={9} color={admin.textDim} strokeWidth={1.8} />
          <Text style={styles.magazineSyncText} numberOfLines={1}>
            {formatRefreshed(item.lastRefreshedAt)}
          </Text>
        </View>
      ) : null}

      {/* Contextual overlay — appears on tap */}
      {showOverlay && (
        <Animated.View style={[styles.magazineOverlay, overlayStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={toggleOverlay} />
          <View style={styles.magazineOverlayContent}>
            <Pressable onPress={onOpen} style={styles.magazineOverlayBtn}>
              <Pencil size={16} color={admin.text} strokeWidth={1.7} />
              <Text style={styles.magazineOverlayBtnText}>Edit listing</Text>
            </Pressable>
            <Pressable
              onPress={onRefresh}
              disabled={refreshing || !item.sourceUrl}
              style={[styles.magazineOverlayBtn, (refreshing || !item.sourceUrl) && { opacity: 0.4 }]}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={admin.goldLight} />
              ) : (
                <RefreshCw size={16} color={admin.goldLight} strokeWidth={1.8} />
              )}
              <Text style={[styles.magazineOverlayBtnText, { color: admin.goldLight }]}>Sync from source</Text>
            </Pressable>
            <Pressable onPress={onToggleHidden} style={styles.magazineOverlayBtn}>
              {item.hidden ? <EyeOff size={16} color={admin.text} strokeWidth={1.7} /> : <Eye size={16} color={admin.text} strokeWidth={1.7} />}
              <Text style={styles.magazineOverlayBtnText}>{item.hidden ? "Show listing" : "Hide listing"}</Text>
            </Pressable>
            <Pressable onPress={onDelete} style={styles.magazineOverlayBtnDanger}>
              <Trash2 size={16} color={admin.red} strokeWidth={1.7} />
              <Text style={styles.magazineOverlayBtnTextDanger}>Delete listing</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function MagazineMiniCard({
  item,
  refreshing,
  onOpen,
  onRefresh,
}: {
  item: ManagedListing;
  refreshing: boolean;
  onOpen: () => void;
  onRefresh: () => void;
}) {
  const status: ListingStatus = item.status ?? "active";
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.magazineMini, pressed && { opacity: 0.94 }]}>
      <View style={styles.magazineMiniPhoto}>
        <Image source={{ uri: item.images[0] ?? item.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={["transparent", "rgba(5,6,8,0.78)"]} style={StyleSheet.absoluteFill} />
        <View style={styles.magazineMiniTopRow}>
          {item.hidden ? (
            <View style={styles.magazineMiniHiddenChip}>
              <EyeOff size={9} color={admin.text} strokeWidth={1.6} />
            </View>
          ) : <View style={{ width: 18 }} />}
          <StatusBadge status={status} />
        </View>
        {item.sourceUrl && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onRefresh(); }}
            disabled={refreshing}
            style={({ pressed }) => [styles.magazineMiniSyncBtn, refreshing && { opacity: 0.6 }, pressed && { opacity: 0.75 }]}
            hitSlop={6}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={admin.goldLight} />
            ) : (
              <RefreshCw size={10} color={admin.goldLight} strokeWidth={1.8} />
            )}
          </Pressable>
        )}
        <View style={styles.magazineMiniTextBlock}>
          <Text style={styles.magazineMiniPrice} numberOfLines={1}>{item.price}</Text>
          <Text style={styles.magazineMiniHood} numberOfLines={1}>{item.neighborhood.toUpperCase()}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Full-width lead tile: icon rail, two-line text column, chevron. */
function LeadToolTile({
  label, sub, Icon, onPress, badge, accent,
}: {
  label: string; sub: string; Icon: React.ComponentType<any>; onPress: () => void; badge?: number; accent: string;
}) {
  const hasBadge = !!badge && badge > 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.leadTile, { borderColor: hexToRgba(accent, 0.28) }, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
    >
      <View style={[styles.leadTileIcon, { backgroundColor: hexToRgba(accent, 0.12), borderColor: hexToRgba(accent, 0.32) }]}>
        <Icon size={22} color={accent} strokeWidth={1.7} />
        {hasBadge && (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        )}
      </View>
      <View style={styles.leadTileText}>
        <Text style={styles.leadTileLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.tileSub, hasBadge && { color: accent }]} numberOfLines={1}>{sub}</Text>
      </View>
      <ChevronRight size={16} color={admin.textDim} strokeWidth={1.8} />
    </Pressable>
  );
}

/** Half-width tile: content stacks vertically so labels never wrap. */
function PairToolTile({
  label, sub, Icon, onPress, badge, accent,
}: {
  label: string; sub: string; Icon: React.ComponentType<any>; onPress: () => void; badge?: number; accent: string;
}) {
  const hasBadge = !!badge && badge > 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pairTile, { borderColor: hexToRgba(accent, 0.22) }, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
    >
      <View style={[styles.pairTileIcon, { backgroundColor: hexToRgba(accent, 0.12), borderColor: hexToRgba(accent, 0.3) }]}>
        <Icon size={19} color={accent} strokeWidth={1.7} />
        {hasBadge && (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.pairTileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
      <Text style={[styles.tileSub, hasBadge && { color: accent }]} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

/** One of five equal columns in the utility rail. */
function RailTool({
  label, Icon, accent, onPress,
}: {
  label: string; Icon: React.ComponentType<any>; accent: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.railTool, { borderColor: hexToRgba(accent, 0.2) }, pressed && { opacity: 0.75 }]}
    >
      <Icon size={16} color={accent} strokeWidth={1.7} />
      <Text style={styles.railToolLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: ListingStatus }) {
  const meta: Record<ListingStatus, { label: string; color: string; dot: string }> = {
    active: { label: "ACTIVE", color: admin.green, dot: admin.green },
    pending: { label: "PENDING", color: admin.amber, dot: admin.amber },
    contingent: { label: "CONTINGENT", color: admin.amber, dot: admin.amber },
    sold: { label: "SOLD", color: admin.red, dot: admin.red },
    off_market: { label: "OFF MARKET", color: admin.red, dot: admin.red },
  };
  const m = meta[status];
  return (
    <View style={[styles.statusBadge, { borderColor: m.color }]}>
      <View style={[styles.statusBadgeDot, { backgroundColor: m.dot }]} />
      <Text style={[styles.statusBadgeText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

function SyncBeacon({ status, onPress }: { status: "idle" | "connecting" | "live" | "offline"; onPress: () => void }) {
  const settled: "online" | "offline" = status === "offline" ? "offline" : "online";
  const [shown, setShown] = useState<"online" | "offline">(settled);
  useEffect(() => {
    if (settled === "online") { setShown("online"); return; }
    const t = setTimeout(() => setShown("offline"), 2500);
    return () => clearTimeout(t);
  }, [settled]);

  const meta = shown === "online" ? { label: "LIVE", color: admin.green } : { label: "OFFLINE", color: admin.textDim };
  const active = shown === "online";

  const ping = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { ping.stopAnimation(); ping.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(ping, { toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, ping]);

  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    fade.setValue(0.25);
    Animated.timing(fade, { toValue: 1, duration: 520, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [shown, fade]);

  const pingScale = ping.interpolate({ inputRange: [0, 1], outputRange: [1, 3.4] });
  const pingOpacity = ping.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] });
  const coreScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.12] });
  const coreGlow = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.statusPill, pressed && { opacity: 0.75 }]} hitSlop={8}>
      <View style={styles.beaconWrap}>
        {active && <Animated.View style={[styles.beaconPing, { backgroundColor: meta.color, opacity: pingOpacity, transform: [{ scale: pingScale }] }]} />}
        <Animated.View style={[styles.beaconHalo, { backgroundColor: meta.color, opacity: active ? coreGlow : 0.2, transform: [{ scale: coreScale }] }]} />
        <View style={[styles.beaconCore, { backgroundColor: meta.color }]} />
      </View>
      <Animated.Text style={[styles.statusPillText, { color: meta.color, opacity: fade }]}>{meta.label}</Animated.Text>
    </Pressable>
  );
}

/** Relative time in days and weeks — never raw hours. */
function formatAgo(ts: number): string {
  const days = Math.floor(Math.max(0, Date.now() - ts) / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}

function formatRefreshed(ts?: number): string {
  if (!ts) return "Not synced yet";
  const days = Math.floor(Math.max(0, Date.now() - ts) / 86_400_000);
  if (days < 1) return "Synced today";
  if (days === 1) return "Synced yesterday";
  if (days < 7) return `Synced ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "Synced 1 week ago" : `Synced ${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "Synced 1 month ago" : `Synced ${months} months ago`;
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: admin.bg },
  backdrop: { position: "absolute", top: -60, left: 0, right: 0, bottom: -140 },
  dot: { width: 5, height: 5, borderRadius: 3 },

  /* ── Concierge Hero ── */
  heroSection: { paddingHorizontal: PAD, paddingBottom: 8 },
  heroChromeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  heroBrandMark: {
    fontFamily: fonts.serif, color: admin.text, fontSize: 17, letterSpacing: 4,
    textShadowColor: "rgba(0,0,0,0.75)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 10,
  },
  heroChromeRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroMarkStack: { gap: 5 },
  heroEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroEyebrow: {
    fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 8, letterSpacing: 2.2,
    textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },

  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, borderColor: admin.hairlineGoldSoft, backgroundColor: admin.surfaceLo,
  },
  beaconWrap: { width: 8, height: 8, alignItems: "center", justifyContent: "center" },
  beaconPing: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  beaconHalo: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  beaconCore: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontFamily: fonts.sansSemi, fontSize: 8.5, letterSpacing: 1.4 },
  chromeBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: admin.hairlineGold,
    backgroundColor: admin.goldSoft, alignItems: "center", justifyContent: "center",
  },
  heroMain: { flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 20 },
  heroPortraitWrap: {
    width: 120, height: 120, borderRadius: 60, overflow: "hidden",
    backgroundColor: admin.surfaceHi, position: "relative", marginBottom: 4,
    shadowColor: admin.gold, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  heroPortraitRing: { ...StyleSheet.absoluteFill, borderRadius: 60, borderWidth: 1.5, borderColor: admin.hairlineGold },
  heroPortraitFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#07070A" },
  heroGreeting: {
    fontFamily: fonts.serif, color: admin.text, fontSize: 32, letterSpacing: -0.8,
    textAlign: "center", lineHeight: 40, paddingHorizontal: 8,
    textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 16,
  },
  heroTagline: {
    fontFamily: fonts.sansMedium, color: admin.goldLight, fontSize: 13, letterSpacing: 1.2,
    textAlign: "center", marginTop: -2,
    textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 12,
  },

  /* ── App preview + go-live progress ── */
  previewCard: {
    marginTop: 20, borderRadius: 22, overflow: "hidden",
    borderWidth: 1, borderColor: admin.hairlineGoldSoft,
  },
  previewTint: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(10,11,14,0.20)" },
  previewRow: { flexDirection: "row", gap: 16, padding: 16, alignItems: "center" },

  phoneFrame: {
    width: 116, aspectRatio: 0.485, borderRadius: 18, padding: 4,
    backgroundColor: "#141519", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)",
    shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  phoneScreen: { flex: 1, borderRadius: 14, overflow: "hidden", backgroundColor: "#F4EFE6" },
  phoneNotch: {
    position: "absolute", top: 8, alignSelf: "center",
    width: 34, height: 5, borderRadius: 3, backgroundColor: "#141519", zIndex: 4,
  },
  miniHero: { flex: 1.42, justifyContent: "flex-end", backgroundColor: "#1A1713" },
  miniHeroFallback: { ...StyleSheet.absoluteFill, backgroundColor: "#07070A" },
  miniIcon: {
    position: "absolute", top: 11, alignSelf: "center",
    width: 16, height: 16, borderRadius: 4, overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.35)",
  },
  miniBrandMark: {
    position: "absolute", top: 12, left: 0, right: 0,
    fontFamily: fonts.serif, fontSize: 7, letterSpacing: 2, textAlign: "center",
  },
  miniHeroText: { paddingHorizontal: 7, paddingBottom: 7, gap: 2 },
  miniEyebrow: { fontFamily: fonts.sansSemi, fontSize: 3.6, letterSpacing: 0.9 },
  miniHeadline: { fontFamily: fonts.serif, color: "#F6F1E8", fontSize: 8, lineHeight: 10, letterSpacing: -0.2 },
  miniBody: { flex: 1, paddingHorizontal: 7, paddingTop: 7, gap: 7 },
  miniCta: { height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  miniCtaText: { fontFamily: fonts.sansSemi, color: "#FFF", fontSize: 4.4, letterSpacing: 0.3 },
  miniListingRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  miniThumb: { width: 32, height: 26, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.08)" },
  miniLines: { flex: 1, gap: 3.5 },
  miniLine: { height: 2.5, borderRadius: 2, backgroundColor: "rgba(26,23,19,0.20)" },

  previewSide: { flex: 1, gap: 7 },
  previewEyebrow: { fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 8.5, letterSpacing: 2.2 },
  previewTitle: { fontFamily: fonts.serif, color: admin.text, fontSize: 21, letterSpacing: -0.4, lineHeight: 25 },
  previewPctRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 2 },
  previewPct: { fontFamily: fonts.serif, fontSize: 27, letterSpacing: -1 },
  previewPctSign: { fontFamily: fonts.serif, color: admin.textMuted, fontSize: 14 },
  previewPctLabel: { fontFamily: fonts.sansSemi, color: admin.textDim, fontSize: 9, letterSpacing: 1.2, marginLeft: 4 },
  previewTrack: {
    height: 3, borderRadius: 2, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.10)", marginBottom: 3,
  },
  previewFill: { height: "100%", borderRadius: 2 },
  previewStep: { flexDirection: "row", alignItems: "center", gap: 7 },
  previewStepDot: {
    width: 14, height: 14, borderRadius: 7, borderWidth: 1,
    borderColor: admin.hairlineGold, backgroundColor: admin.goldSoft,
    alignItems: "center", justifyContent: "center",
  },
  previewStepText: { flex: 1, fontFamily: fonts.sansMedium, color: admin.textMuted, fontSize: 10.5, lineHeight: 14 },
  previewLiveRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  previewLiveDot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1,
    borderColor: hexToRgba(admin.green, 0.5), backgroundColor: hexToRgba(admin.green, 0.16),
    alignItems: "center", justifyContent: "center",
  },
  previewLiveText: { flex: 1, fontFamily: fonts.sansMedium, color: admin.textMuted, fontSize: 10.5, lineHeight: 14 },
  previewButton: {
    flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1,
  },
  previewButtonText: { flex: 1, fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 0.3 },

  /* Today's Pulse */
  pulseSection: { marginTop: 38 },
  pulseCard: {
    flexDirection: "row", justifyContent: "space-between",
    marginHorizontal: PAD, paddingVertical: 18, paddingHorizontal: 12,
    borderRadius: 16, borderWidth: 1, borderColor: admin.hairline,
    backgroundColor: admin.glass,
  },
  activityMetric: { alignItems: "center", gap: 6, flex: 1 },
  activityMetricValue: {
    fontFamily: fonts.serif, color: admin.text, fontSize: 22, letterSpacing: -0.4,
  },
  activityMetricLabel: {
    fontFamily: fonts.sansSemi, color: admin.textMuted, fontSize: 9, letterSpacing: 1, textAlign: "center",
  },

  /* ── Brand Studio ── */
  studioSection: {
    marginTop: 32, marginHorizontal: PAD,
    padding: 20, borderRadius: 20, overflow: "hidden",
    borderWidth: 1, borderColor: admin.hairlineGold,
    backgroundColor: admin.glassHi,
  },
  studioHeadline: {
    fontFamily: fonts.serif, color: admin.text, fontSize: 28, letterSpacing: -0.5, lineHeight: 34,
    marginTop: 20,
  },
  studioDescription: {
    fontFamily: fonts.sans, color: admin.textMuted, fontSize: 13, lineHeight: 19, marginTop: 10,
  },
  studioCtaBtn: {
    alignSelf: "flex-start",
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 11, paddingHorizontal: 15,
    borderRadius: 10, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(210,163,67,0.8)",
    backgroundColor: "rgba(12,11,9,0.9)",
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  studioCtaText: {
    fontFamily: fonts.sansSemi, color: "#F4EFE6", fontSize: 11.5, letterSpacing: 1.8,
  },
  studioCtaDot: {
    position: "absolute", right: 7, bottom: 6,
    width: 4.5, height: 4.5, borderRadius: 999,
    backgroundColor: "#EBC776",
    shadowColor: "#EBC776", shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  studioSecondary: {
    flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    borderRadius: 10, borderWidth: 1, borderColor: admin.hairlineGold, backgroundColor: "rgba(210,163,67,0.07)",
  },
  studioSecondaryText: { fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 9.5, letterSpacing: 1.1 },

  /* ── Live Activity Timeline ── */
  timelineSection: {
    marginTop: 20, marginHorizontal: PAD,
    padding: 18, borderRadius: 16, overflow: "hidden",
    borderWidth: 1, borderColor: admin.hairline,
    backgroundColor: admin.glass,
  },
  timelineHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  timelineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: admin.green },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 0, paddingVertical: 10 },
  timelineLine: {
    position: "absolute", left: 16, top: 0, bottom: 0, width: 1,
    backgroundColor: admin.hairline, opacity: 0.5,
  },
  timelineIcon: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginRight: 12, zIndex: 1,
  },
  timelineText: {
    flex: 1, fontFamily: fonts.sansMedium, color: admin.text, fontSize: 12.5, letterSpacing: 0.2,
  },
  timelineTime: {
    fontFamily: fonts.sans, color: admin.textDim, fontSize: 11, letterSpacing: 0.5,
  },

  /* ── Listings ── */
  listingsSection: { marginTop: 36 },
  sectionHead: {
    flexDirection: "row", alignItems: "flex-end", paddingHorizontal: PAD,
    marginBottom: 16, gap: 12,
  },
  sectionHeadSimple: {
    paddingHorizontal: PAD, marginBottom: 14, gap: 4,
  },
  sectionEyebrow: {
    fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 10, letterSpacing: 2.8,
  },
  sectionTitle: {
    fontFamily: fonts.serif, color: admin.text, fontSize: 28, letterSpacing: -0.5,
  },
  listingCountBadge: {
    fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 10, letterSpacing: 1.8,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    borderWidth: 1, borderColor: admin.hairlineGoldSoft,
  },
  sectionAction: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999,
    backgroundColor: admin.gold,
    shadowColor: admin.gold, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  sectionActionText: { fontFamily: fonts.sansSemi, color: admin.bg, fontSize: 11, letterSpacing: 2 },

  /* Magazine hero listing */
  magazineHero: {
    marginHorizontal: PAD, borderRadius: 18, overflow: "hidden",
    borderWidth: 1, borderColor: admin.hairlineGoldSoft,
  },
  magazineHeroPhoto: { width: "100%", height: 320, backgroundColor: admin.surfaceHi, justifyContent: "flex-end" },
  magazineTopRow: { position: "absolute", top: 14, left: 14, right: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  magazineTopLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  magazineLivePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999,
    backgroundColor: "rgba(8,9,12,0.65)", borderWidth: 1,
  },
  magazineLiveText: { fontFamily: fonts.sansSemi, fontSize: 8.5, letterSpacing: 1.6 },
  magazineFeatured: { fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 9, letterSpacing: 2.2 },
  magazineTextBlock: { padding: 18 },
  magazineHood: { fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 10, letterSpacing: 2.4, marginBottom: 8 },
  magazineTitle: { fontFamily: fonts.serif, color: admin.text, fontSize: 24, letterSpacing: -0.4, lineHeight: 28 },
  magazineMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  magazinePrice: { fontFamily: fonts.sansSemi, color: admin.text, fontSize: 15, letterSpacing: 0.1 },
  magazineDot: { color: admin.textDim, fontSize: 15 },
  magazineSpec: { fontFamily: fonts.sansSemi, color: admin.textMuted, fontSize: 12, letterSpacing: 1.2 },
  magazineHint: {
    position: "absolute", bottom: 14, right: 14,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    backgroundColor: "rgba(8,9,12,0.65)", borderWidth: 1, borderColor: admin.hairlineStrong,
  },
  magazineHintText: { fontFamily: fonts.sans, color: admin.textDim, fontSize: 9, letterSpacing: 0.5 },
  magazineSyncRow: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 18, paddingVertical: 10, backgroundColor: admin.glassLo,
  },
  magazineSyncText: { fontFamily: fonts.sansSemi, color: admin.textDim, fontSize: 9.5, letterSpacing: 1.2 },

  /* Magazine overlay */
  magazineOverlay: {
    ...StyleSheet.absoluteFill, backgroundColor: "rgba(5,6,8,0.92)",
    alignItems: "center", justifyContent: "center",
  },
  magazineOverlayContent: { gap: 8, width: "75%" },
  magazineOverlayBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12,
    backgroundColor: admin.surfaceHi, borderWidth: 1, borderColor: admin.hairlineStrong,
  },
  magazineOverlayBtnText: { fontFamily: fonts.sansSemi, color: admin.text, fontSize: 13, letterSpacing: 0.4 },
  magazineOverlayBtnDanger: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12,
    backgroundColor: "rgba(229,102,79,0.12)", borderWidth: 1, borderColor: "rgba(229,102,79,0.3)",
  },
  magazineOverlayBtnTextDanger: { fontFamily: fonts.sansSemi, color: admin.red, fontSize: 13, letterSpacing: 0.4 },

  /* Magazine mini cards */
  secondaryGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: PAD, gap: 8, marginTop: 8 },
  magazineMini: { flexGrow: 1, flexBasis: "47%", borderRadius: 12, overflow: "hidden" },
  magazineMiniPhoto: { width: "100%", aspectRatio: 1.15, backgroundColor: admin.surfaceHi, justifyContent: "flex-end" },
  magazineMiniTopRow: { position: "absolute", top: 8, left: 8, right: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 2 },
  magazineMiniHiddenChip: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(8,9,12,0.7)",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: admin.hairlineStrong,
  },
  magazineMiniSyncBtn: {
    position: "absolute", bottom: 8, right: 8,
    width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(8,9,12,0.7)", borderWidth: 1, borderColor: admin.hairlineGoldSoft, zIndex: 3,
  },
  magazineMiniTextBlock: { padding: 10 },
  magazineMiniPrice: { fontFamily: fonts.serif, color: admin.text, fontSize: 14, letterSpacing: -0.2 },
  magazineMiniHood: { fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 8, letterSpacing: 1.6, marginTop: 3 },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, backgroundColor: "rgba(8,9,12,0.75)",
  },
  statusBadgeDot: { width: 5, height: 5, borderRadius: 3 },
  statusBadgeText: { fontFamily: fonts.sansSemi, fontSize: 8.5, letterSpacing: 1.4 },

  viewAllRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16, paddingVertical: 12 },
  viewAllText: { fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 10, letterSpacing: 1.8 },

  /* ── Client Tools ── */
  toolsSection: { marginTop: 36 },
  toolsBody: { paddingHorizontal: PAD, gap: 10 },

  leadTile: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 16, paddingHorizontal: 16, borderRadius: 16,
    borderWidth: 1, borderColor: admin.hairlineStrong, backgroundColor: admin.glassHi,
  },
  leadTileIcon: {
    width: 46, height: 46, borderRadius: 13, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  leadTileText: { flex: 1, minWidth: 0 },
  leadTileLabel: { fontFamily: fonts.serif, color: admin.text, fontSize: 19, letterSpacing: 0.1 },

  pairRow: { flexDirection: "row", gap: 10 },
  pairTile: {
    flex: 1, minWidth: 0, gap: 10,
    paddingVertical: 16, paddingHorizontal: 14, borderRadius: 16,
    borderWidth: 1, borderColor: admin.hairlineStrong, backgroundColor: admin.glassHi,
  },
  pairTileIcon: {
    width: 38, height: 38, borderRadius: 11, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  pairTileLabel: { fontFamily: fonts.serif, color: admin.text, fontSize: 17, letterSpacing: 0.1 },

  tileBadge: {
    position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3, backgroundColor: admin.red, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: admin.bg,
  },
  tileBadgeText: { fontFamily: fonts.sansSemi, color: "#fff", fontSize: 8 },
  tileSub: { fontFamily: fonts.sansMedium, color: admin.textMuted, fontSize: 10.5, letterSpacing: 0.4, marginTop: 3 },

  railRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  railTool: {
    flex: 1, minWidth: 0, alignItems: "center", gap: 7,
    paddingVertical: 12, paddingHorizontal: 4, borderRadius: 14,
    borderWidth: 1, borderColor: admin.hairline, backgroundColor: admin.glass,
  },
  railToolLabel: {
    fontFamily: fonts.sansSemi, color: admin.textMuted, fontSize: 9.5,
    letterSpacing: 0.2, textAlign: "center",
  },

  /* ── Client seats ── */
  seatMeter: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  seatPips: { flexDirection: "row", gap: 5 },
  seatPip: {
    width: 16,
    height: 3,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "transparent",
  },
  seatPipFilled: { backgroundColor: admin.goldLight, borderColor: admin.goldLight },
  seatMeterText: {
    fontFamily: fonts.sansMedium,
    color: admin.textDim,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  limitBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: admin.hairlineGold,
    backgroundColor: "rgba(210,163,67,0.05)",
    overflow: "hidden",
  },
  limitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: admin.hairlineGoldSoft,
    backgroundColor: admin.goldSoft,
  },
  limitTitle: {
    fontFamily: fonts.sansSemi,
    color: admin.text,
    fontSize: 13,
    letterSpacing: 0.1,
  },
  limitBody: {
    fontFamily: fonts.sans,
    color: admin.textMuted,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 4,
  },
  turnedAway: {
    padding: 18,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(245,181,68,0.32)",
    backgroundColor: "rgba(245,181,68,0.06)",
  },
  turnedAwayHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  turnedAwayIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(245,181,68,0.35)",
  },
  turnedAwayTitle: {
    flex: 1,
    fontFamily: fonts.sansSemi,
    color: admin.text,
    fontSize: 13,
  },
  turnedAwayList: { gap: 3, marginTop: 12, marginLeft: 36 },
  turnedAwayName: {
    fontFamily: fonts.sans,
    color: admin.textMuted,
    fontSize: 11.5,
  },
  turnedAwayBody: {
    fontFamily: fonts.sans,
    color: admin.textMuted,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 12,
  },
  turnedAwayCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: admin.goldLight,
  },
  turnedAwayCtaText: {
    fontFamily: fonts.sansSemi,
    color: admin.bg,
    fontSize: 11,
    letterSpacing: 2,
  },

  /* ── Invite Clients ── */
  inviteSection: { marginTop: 40, paddingHorizontal: PAD },
  inviteHeader: { gap: 8, marginBottom: 18 },
  inviteTitle: { fontFamily: fonts.serif, color: admin.text, fontSize: 30, letterSpacing: -0.5, lineHeight: 36 },
  inviteSub: { fontFamily: fonts.sans, color: admin.textMuted, fontSize: 13, lineHeight: 19 },
  inviteCard: {
    borderRadius: 18, overflow: "hidden", borderWidth: 1,
    borderColor: admin.hairlineGoldSoft, backgroundColor: admin.glassHi,
  },
  qrHero: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 20 },
  qrHeroFrame: {
    width: 180, height: 180, borderRadius: 14, backgroundColor: "#F1ECE2",
    borderWidth: 2, borderColor: admin.hairlineGold,
    padding: 10, alignItems: "center", justifyContent: "center",
  },
  qrHeroImage: { width: "100%", height: "100%" },
  qrHeroHint: {
    fontFamily: fonts.sansSemi, color: admin.textMuted, fontSize: 11, letterSpacing: 1.2,
    marginTop: 12,
  },
  inviteCodeRow: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18,
    borderTopWidth: 1, borderTopColor: admin.hairline,
    alignItems: "center",
  },
  inviteCodeLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  inviteCodeLabel: { fontFamily: fonts.sansSemi, color: admin.textDim, fontSize: 9, letterSpacing: 1.8 },
  inviteCode: {
    fontFamily: fonts.serif, color: admin.text, fontSize: 28, letterSpacing: 8,
  },
  inviteActions: {
    flexDirection: "row", paddingHorizontal: 20, paddingBottom: 20, gap: 10,
    borderTopWidth: 1, borderTopColor: admin.hairline, paddingTop: 16,
  },
  inviteGhostBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 999,
    borderWidth: 1, borderColor: admin.hairlineStrong, backgroundColor: admin.surfaceHi,
  },
  inviteGhostBtnText: { fontFamily: fonts.sansSemi, color: admin.text, fontSize: 12, letterSpacing: 0.8 },
  inviteGoldBtn: {
    flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 999,
    backgroundColor: admin.gold,
    shadowColor: admin.gold, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  /* At the limit the primary invite action goes quiet rather than gold — the
     banner directly above it is where the way forward lives. */
  inviteGoldBtnMuted: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: admin.hairlineStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  inviteGoldBtnText: { fontFamily: fonts.sansSemi, color: admin.bg, fontSize: 12, letterSpacing: 2 },

  /* ── Support & Footer ── */
  supportRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 40, paddingHorizontal: PAD },
  supportItem: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 6 },
  supportText: { fontFamily: fonts.sans, color: admin.textMuted, fontSize: 12 },
  supportTextGold: { color: admin.goldLight, fontFamily: fonts.sansSemi },
  supportDivider: { width: 1, height: 12, backgroundColor: admin.hairline },
  legalRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 22, paddingHorizontal: PAD },
  legalText: { fontFamily: fonts.sans, color: admin.textDim, fontSize: 11.5 },
  deleteAccountBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 14, paddingVertical: 10 },
  deleteAccountText: { fontFamily: fonts.sansMedium, color: "rgba(224,110,90,0.8)", fontSize: 9.5, letterSpacing: 1.8 },
  websiteLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 30, paddingVertical: 4 },
  websiteText: { fontFamily: fonts.sansMedium, color: admin.goldLight, fontSize: 12, letterSpacing: 1 },
  signoff: {
    fontFamily: fonts.sansSemi, color: admin.textDim, fontSize: 8.5, letterSpacing: 2.4, textAlign: "center", marginTop: 18,
    textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },

  /* ── Empty state ── */
  empty: {
    paddingVertical: 36, paddingHorizontal: 24, alignItems: "center", gap: 10,
    backgroundColor: admin.glass, borderWidth: 1, borderColor: admin.hairline, borderRadius: 14,
  },
  emptyTitle: { fontFamily: fonts.serif, color: admin.text, fontSize: 18, letterSpacing: -0.1 },
  emptySub: { fontFamily: fonts.sans, color: admin.textMuted, fontSize: 12, textAlign: "center", maxWidth: 260, lineHeight: 18 },
});
