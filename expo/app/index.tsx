import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Building2, User, Eye, X, Pencil, Check, LayoutDashboard } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { brand, dark, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { setConsultInfo } from "@/lib/contact";
import { useListings } from "@/contexts/ListingsContext";
import { useBrand } from "@/contexts/BrandContext";
import { useEditMode } from "@/contexts/EditModeContext";
import { useClientFeed } from "@/contexts/ClientFeedContext";
import { useDocuments } from "@/contexts/DocumentsContext";
import { useMessages } from "@/contexts/MessagesContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useAppointments } from "@/contexts/AppointmentsContext";
import { useClients } from "@/contexts/ClientsContext";
import { useClientProfiles } from "@/contexts/ClientProfileContext";
import Hero from "@/components/Hero";
import ThemeHero from "@/components/ThemeHero";
import ClientLayoutHero from "@/components/ClientLayoutHero";
import CoastalHero from "@/components/CoastalHero";
import ThemeCollection from "@/components/ThemeCollection";
import ThemeContentSection from "@/components/ThemeContentSection";
import ThemeCarousel from "@/components/ThemeCarousel";
import ReferenceHome from "@/components/themes/ReferenceHome";
import { themeCandidate } from "@/constants/themeDesigns";
import type { Brand } from "@/contexts/BrandContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { orderThemeSections } from "@/constants/themeStructure";
import BottomNav from "@/components/BottomNav";
import CuratedListings from "@/components/CuratedListings";
import PersonalNote from "@/components/PersonalNote";
import Credentials from "@/components/Credentials";
import MarketBeat from "@/components/MarketBeat";
import QuickContact from "@/components/QuickContact";
import SocialProof from "@/components/SocialProof";
import Footer from "@/components/Footer";
import ConciergeSection from "@/components/ConciergeSection";
import SupportSection from "@/components/SupportSection";
import Reveal from "@/components/Reveal";
import SwipeToSwitch from "@/components/SwipeToSwitch";
import SetupGate from "@/components/SetupGate";
import {
  visibleSections,
  requiredStatus,
  revealDelays,
  type ClientSectionId,
  type SectionContext,
} from "@/constants/sections";

/** Landing screen (unauthenticated) or client home (authenticated client). Admins redirect to /admin. */
export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hydrated, isAuthenticated, isAdmin, isClient, previewAdmin, viewAsClient, demoViewMode, enterDemoView } = useAuth();
  const { brand: b } = useBrand();
  const { hydrated: profilesHydrated, myProfileShared } = useClientProfiles();

  // Redirect admins to dashboard — unless they're previewing the client side
  useEffect(() => {
    if (!hydrated) return;
    if (isAuthenticated && isAdmin && !viewAsClient) {
      router.replace("/admin");
    }
  }, [hydrated, isAuthenticated, isAdmin, viewAsClient, router]);

  // A valid invite creates the relationship, but never grants the app before
  // the required client profile has been saved. The profile context is scoped
  // to the authenticated realtor/client pair and preserves partial answers.
  useEffect(() => {
    if (hydrated && profilesHydrated && isClient && !demoViewMode && !myProfileShared) {
      router.replace("/client-profile");
    }
  }, [hydrated, profilesHydrated, isClient, demoViewMode, myProfileShared, router]);

  // Preview admin bypass — show pure Eliza Vance demo client experience
  const handleExploreDemo = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    await previewAdmin();
    // Enter demo-view mode so the admin redirect is suppressed and the
    // client home renders with the pure Eliza Vance showcase (no edit UI).
    enterDemoView();
  }, [previewAdmin, enterDemoView]);

  if (!hydrated) {
    return <View style={styles.root} />;
  }

  // Unauthenticated — show landing screen
  if (!isAuthenticated && !demoViewMode) {
    return <LandingScreen onExploreDemo={handleExploreDemo} insets={insets} />;
  }

  // Client home experience (existing editorial layout)
  return <ClientHome insets={insets} />;
}

// ── Landing Screen (3 paths) ──────────────────────────────────────────

function LandingScreen({ onExploreDemo, insets }: { onExploreDemo: () => Promise<void>; insets: { top: number; bottom: number } }) {
  const router = useRouter();
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [entrance]);

  const heroOpacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const heroTranslate = entrance.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

  return (
    <View style={styles.landingRoot}>
      {/* A softly lit front door at dusk — arriving home, right where you sign in. */}
      <Image
        source={require("@/assets/images/login-bg-door.jpg")}
        style={styles.landingBg}
        contentFit="cover"
        contentPosition="center"
        transition={420}
        allowDownscaling={false}
        cachePolicy="memory-disk"
        priority="high"
      />

      <ScrollView
        contentContainerStyle={[styles.landingScroll, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View style={[styles.landingCenter, { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] }]}>
          {/* Monogram */}
          <View style={styles.landingMonoWrap}>
            <View style={styles.landingMonoRing} />
            <Text style={styles.landingMono}>MR</Text>
          </View>

          <Text style={styles.landingBrand}>MY REALTOR APP</Text>
          <Text style={styles.landingTagline}>Your brand. Your clients. One app.</Text>

          {/* Primary CTAs */}
          <View style={styles.landingActions}>
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                router.push({ pathname: "/portal", params: { entry: "realtor" } });
              }}
              style={({ pressed }) => [styles.landingBtn, styles.landingBtnRealtor, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            >
              <Building2 size={20} color={brand.goldLight} strokeWidth={1.6} />
              <View style={{ flex: 1 }}>
                <Text style={styles.landingBtnTitle}>Realtor Login</Text>
                <Text style={styles.landingBtnSub}>Create your branded app experience</Text>
              </View>
              <ArrowRight size={16} color={brand.goldLight} strokeWidth={1.8} />
            </Pressable>

            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                router.push({ pathname: "/portal", params: { entry: "client" } });
              }}
              style={({ pressed }) => [styles.landingBtn, styles.landingBtnClient, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            >
              <User size={20} color={brand.ivory} strokeWidth={1.6} />
              <View style={{ flex: 1 }}>
                <Text style={styles.landingBtnTitle}>Client Login</Text>
                <Text style={styles.landingBtnSub}>Connect to your realtor with a code</Text>
              </View>
              <ArrowRight size={16} color={brand.ivory} strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Demo soft option */}
          <Pressable
            onPress={onExploreDemo}
            style={({ pressed }) => [styles.demoBtn, pressed && { opacity: 0.6 }]}
          >
            <Eye size={14} color="rgba(244,239,230,0.45)" strokeWidth={1.4} />
            <Text style={styles.demoText}>Explore Demo</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* Footer lockup */}
      <View style={[styles.landingFooter, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.landingFooterText}>MY REALTOR APP · PRIVATE</Text>
      </View>
    </View>
  );
}

// ── Client Home (existing editorial layout) ───────────────────────────

function ClientHome({ insets }: { insets: { top: number; bottom: number } }) {
  const router = useRouter();
  const { isFavorited, toggleListing } = useFavorites();
  const [demoThemeDraft, setDemoThemeDraft] = useState<Brand | null>(null);
  const { viewAsClient, demoViewMode, exitViewAsClient, exitDemoView } = useAuth();
  const { editing, dirty, cancel, save, guardExit, previewBrand, previewListings } =
    useEditMode();

  // Exiting the realtor's own template preview — go back to admin.
  const exitTemplate = useCallback(() => {
    guardExit(() => {
      exitViewAsClient();
      router.replace("/admin");
    });
  }, [guardExit, exitViewAsClient, router]);

  // Exiting the Eliza Vance demo showcase.
  const exitDemo = useCallback(async () => {
    await exitDemoView();
    router.replace("/");
  }, [exitDemoView, router]);
  const { refresh: refreshListings } = useListings();
  const { refresh: refreshBrand } = useBrand();
  const { refresh: refreshFeed } = useClientFeed();
  const { refresh: refreshDocs } = useDocuments();
  const { refresh: refreshMessages } = useMessages();
  const { refresh: refreshNotifs } = useNotifications();
  const { refresh: refreshAppts } = useAppointments();
  const { refresh: refreshClients } = useClients();
  const { brand: b, theme, previewingDraft, setDraftPreview } = useBrand();
  const [refreshing, setRefreshing] = useState<boolean>(false);

  /** Leave the unpublished-draft preview and return to Studio. */
  const exitDraftPreview = useCallback(() => {
    setDraftPreview(null);
    router.back();
  }, [setDraftPreview, router]);

  useEffect(() => {
    const realtor = b.realtor;
    setConsultInfo({
      phoneDisplay: realtor.phone,
      phoneTel: realtor.phone.replace(/[^+\d]/g, ""),
      email: realtor.email,
      firstName: realtor.name.split(" ")[0] ?? realtor.name,
    });
  }, [b.realtor]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      await Promise.all([
        refreshListings(), refreshBrand(), refreshFeed(), refreshDocs(),
        refreshMessages(), refreshNotifs(), refreshAppts(), refreshClients(),
        new Promise<void>((r) => setTimeout(r, 900)),
      ]);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.log("[home] refresh error", e);
    } finally {
      setRefreshing(false);
    }
  }, [refreshListings, refreshBrand, refreshFeed, refreshDocs, refreshMessages, refreshNotifs, refreshAppts, refreshClients]);

  const scrollRef = useRef<ScrollView>(null);
  const listingsY = useRef<number>(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const bottomPad = Math.max(insets.bottom, 10) + 100;

  const bannerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(bannerAnim, {
      toValue: refreshing ? 1 : 0,
      duration: refreshing ? 220 : 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [refreshing, bannerAnim]);
  const bannerTranslate = bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-32, 0] });

  const scrollToListings = () => {
    scrollRef.current?.scrollTo({ y: listingsY.current - 24, animated: true });
  };

  // Which sections have earned their place, decided in one pass before render.
  // Knowing the visible list up front is what lets the entrance cascade stay
  // even no matter how much of their profile the realtor has filled in.
  const visibleListingCount = useMemo(
    () => previewListings.filter((l) => !l.hidden).length,
    [previewListings]
  );
  const sectionCtx: SectionContext = useMemo(
    () => ({ brand: previewBrand, visibleListingCount }),
    [previewBrand, visibleListingCount]
  );
  const visible = useMemo(
    () => {
      const sections = visibleSections(sectionCtx);
      return orderThemeSections(sections, previewBrand.layoutId);
    },
    [sectionCtx]
  );
  const delays = useMemo(() => revealDelays(visible), [visible]);

  const renderSection = useCallback(
    (id: ClientSectionId) => {
      const designed = previewBrand.theme.presentationVersion === 2 && !demoViewMode && !editing;
      if (designed && id !== "hero" && id !== "listings" && id !== "footer") {
        return <Reveal key={id} delay={delays[id] ?? 200}>
          <ThemeContentSection id={id} brand={previewBrand} onNavigate={path => router.push(path)}
            onContact={channel => {
              const phone = previewBrand.realtor.phone.replace(/[^+\d]/g, "");
              const email = previewBrand.realtor.email.trim();
              const url = channel === "email" ? email ? `mailto:${encodeURIComponent(email)}` : "" :
                phone ? `${channel === "call" ? "tel" : "sms"}:${phone}` : "";
              if (url) void Linking.openURL(url).catch(() => Alert.alert("Contact your realtor", channel === "email" ? email : previewBrand.realtor.phone));
            }} />
        </Reveal>;
      }
      switch (id) {
        case "hero":
          if (!designed) return demoViewMode || editing || previewBrand.layoutId === "eliza-editorial"
            ? <Hero key="hero" onPrimary={scrollToListings} scrollY={scrollY} />
            : previewBrand.layoutId === "coastal-personal"
              ? <CoastalHero key="hero" brand={previewBrand} scrollY={scrollY} />
              : <ClientLayoutHero key="hero" brand={previewBrand} scrollY={scrollY} />;
          return demoViewMode || editing
            ? <Hero key="hero" onPrimary={scrollToListings} scrollY={scrollY} />
            : <ThemeHero key="hero" brand={previewBrand} scrollY={scrollY} topInset={insets.top + 24}
                onBrowse={() => router.push("/listings")} onMessage={() => router.push("/message")}
                onSaved={() => router.push("/favorites")} onSchedule={() => router.push("/calendar")} />;
        case "listings":
          return (
            <View
              key="listings"
              onLayout={(e) => {
                listingsY.current = e.nativeEvent.layout.y;
              }}
            >
              <Reveal delay={delays.listings ?? 120}>
                {!designed ? <CuratedListings /> : <ThemeCollection brand={previewBrand} listings={previewListings}
                  onOpen={id => router.push(`/listing/${id}`)} onBrowse={() => router.push("/listings")}
                  isFavorite={isFavorited} onFavorite={id => toggleListing("favorites", id)} />}
              </Reveal>
            </View>
          );
        case "note":
          return (
            <Reveal key="note" delay={delays.note ?? 200}>
              <PersonalNote />
            </Reveal>
          );
        case "credentials":
          return (
            <Reveal key="credentials" delay={delays.credentials ?? 240}>
              <Credentials />
            </Reveal>
          );
        case "beat":
          return (
            <Reveal key="beat" delay={delays.beat ?? 280}>
              <MarketBeat />
            </Reveal>
          );
        case "quickContact":
          return (
            <Reveal key="quickContact" delay={delays.quickContact ?? 320}>
              <QuickContact />
            </Reveal>
          );
        case "concierge":
          return (
            <Reveal key="concierge" delay={delays.concierge ?? 360}>
              <ConciergeSection />
            </Reveal>
          );
        case "social":
          return (
            <Reveal key="social" delay={delays.social ?? 400}>
              <SocialProof />
            </Reveal>
          );
        case "support":
          return (
            <Reveal key="support" delay={delays.support ?? 440}>
              <SupportSection />
            </Reveal>
          );
        case "footer":
          return <Footer key="footer" />;
        default:
          return null;
      }
    },
    [delays, scrollY, demoViewMode, editing, previewBrand, previewListings, router, insets.top, isFavorited, toggleListing]
  );

  /**
   * The client app is composed from the realtor's own facts, so it cannot exist
   * before they exist. Below the required floor there is no page to render —
   * only gaps — so the whole experience is withheld rather than assembled out of
   * blanks and stale placeholders.
   *
   * This is the single gate for every route into the client side: a realtor
   * swiping across to preview, a Studio draft preview, and a real signed-in
   * client all pass through it. The demo showcase is exempt — it is complete by
   * construction and frozen.
   */
  const required = useMemo(() => requiredStatus(previewBrand), [previewBrand]);
  const setupIncomplete = !demoViewMode && !required.complete;
  const gateAudience: "realtor" | "client" = viewAsClient || previewingDraft ? "realtor" : "client";

  const body = setupIncomplete ? (
    <SetupGate
      missing={required.missing}
      met={required.met}
      audience={gateAudience}
      onBack={previewingDraft ? exitDraftPreview : viewAsClient ? exitTemplate : undefined}
    />
  ) : (
    <View style={[styles.root, { backgroundColor: theme.band.deep }]}>
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ backgroundColor: theme.surface.paper, paddingBottom: bottomPad }}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent.base}
              colors={[theme.accent.base]}
              progressBackgroundColor={theme.band.deep}
              progressViewOffset={insets.top + 12}
            />
          }
        >
          {previewBrand.theme.presentationVersion === 2 && !demoViewMode && !editing ?
            <ReferenceHome brand={previewBrand} listings={previewListings} scrollY={scrollY} topInset={insets.top + 24}
              onNavigate={path => router.push(path)} onOpen={id => router.push(`/listing/${id}`)}
              onFavorite={id => toggleListing("favorites", id)} isFavorite={isFavorited}
              onCall={previewBrand.realtor.phone.trim() ? () => {
                const phone = previewBrand.realtor.phone.replace(/[^+\d]/g, "");
                if (phone) void Linking.openURL(`tel:${phone}`).catch(() => Alert.alert("Contact your realtor", previewBrand.realtor.phone));
              } : undefined}
              renderAdditional={renderSection} /> : visible.map(renderSection)}
        </Animated.ScrollView>
      {!demoViewMode && !editing && !previewingDraft && <BottomNav />}
      {demoViewMode && <Pressable accessibilityRole="button" onPress={() => setDemoThemeDraft(themeCandidate(b, "eliza-editorial"))}
        style={{ position: "absolute", bottom: insets.bottom + 18, alignSelf: "center", backgroundColor: "#D4B989", paddingHorizontal: 22, paddingVertical: 15, borderRadius: 26 }}>
        <Text style={{ color: "#111713", fontWeight: "600" }}>Explore the seven themes</Text>
      </Pressable>}
      <Modal visible={demoViewMode && demoThemeDraft !== null} animationType="none" onRequestClose={() => setDemoThemeDraft(null)}>
        <View style={{ flex: 1, backgroundColor: "#101211", paddingTop: insets.top + 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20 }}>
            <Text style={{ flex: 1, color: "#E9DECB" }}>Read-only demo · no profile changes</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close theme showcase" onPress={() => setDemoThemeDraft(null)} style={{ padding: 14 }}><X color="#E9DECB" /></Pressable>
          </View>
          <ScrollView>{demoThemeDraft && <ThemeCarousel demo draft={demoThemeDraft} listings={previewListings} onChoose={setDemoThemeDraft} />}</ScrollView>
        </View>
      </Modal>
      {demoViewMode ? (
        /* Eliza Vance demo showcase — static, view-only, no edit UI. */
        <View style={[styles.previewBar, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable
            onPress={exitDemo}
            style={({ pressed }) => [styles.previewPill, pressed && { opacity: 0.8 }]}
            hitSlop={8}
          >
            <Eye size={13} color={brand.goldLight} strokeWidth={1.7} />
            <Text style={styles.previewText}>ELIZA VANCE · DEMO</Text>
            <View style={styles.previewDivider} />
            <X size={13} color={brand.ivory} strokeWidth={2} />
          </Pressable>
        </View>
      ) : previewingDraft ? (
        /* Unpublished Studio draft — visible only to the realtor, never to clients. */
        <View style={[styles.previewBar, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable
            onPress={exitDraftPreview}
            style={({ pressed }) => [styles.previewPill, styles.draftPill, pressed && { opacity: 0.8 }]}
            hitSlop={8}
          >
            <Eye size={13} color={brand.goldLight} strokeWidth={1.7} />
            <Text style={styles.previewText}>UNPUBLISHED DRAFT</Text>
            <View style={styles.previewDivider} />
            <Text style={styles.draftBack}>BACK TO STUDIO</Text>
          </Pressable>
        </View>
      ) : viewAsClient ? (
        /* Realtor's own template — editable preview with save bar. */
        <View style={[styles.previewBar, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable
            onPress={exitTemplate}
            style={({ pressed }) => [styles.previewPill, pressed && { opacity: 0.8 }]}
            hitSlop={8}
          >
            <Eye size={13} color={brand.goldLight} strokeWidth={1.7} />
            <Text style={styles.previewText}>{editing ? "EDITING" : "VIEWING AS CLIENT"}</Text>
            <View style={styles.previewDivider} />
            <X size={13} color={brand.ivory} strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}

      {editing ? (
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
          <Pressable
            onPress={cancel}
            style={({ pressed }) => [styles.discardBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.discardText}>Discard</Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={!dirty}
            style={({ pressed }) => [styles.saveBtn, !dirty && { opacity: 0.45 }, pressed && { opacity: 0.88 }]}
          >
            <Check size={15} color={brand.ivory} strokeWidth={2} />
            <Text style={styles.saveText}>{dirty ? "SAVE CHANGES" : "NO CHANGES"}</Text>
          </Pressable>
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.grain}>

      </View>
      <Animated.View
        pointerEvents="none"
        style={[styles.banner, { top: insets.top + 8, opacity: bannerAnim, transform: [{ translateY: bannerTranslate }] }]}
      >
        <View style={styles.bannerPill}>
          <ActivityIndicator size="small" color={brand.gold} />
          <Text style={styles.bannerText}>Refreshing your space</Text>
        </View>
      </Animated.View>
    </View>
  );

  // Realtor previewing their own template: mirror the dashboard gesture so they
  // can pull the preview aside and step straight back into editing.
  if (viewAsClient && !demoViewMode && !previewingDraft) {
    return (
      <SwipeToSwitch
        direction="left"
        onTrigger={exitTemplate}
        label="DASHBOARD"
        Icon={LayoutDashboard}
        enabled={!editing}
      >
        {body}
      </SwipeToSwitch>
    );
  }

  return body;
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.forestDeep },
  grain: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  banner: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bannerPill: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
    backgroundColor: "rgba(8,26,21,0.92)",
    borderWidth: 1, borderColor: "rgba(210,163,67,0.45)",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  bannerText: { color: brand.ivory, fontSize: 12, letterSpacing: 1.6, fontWeight: "600" as const },
  previewBar: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  previewPill: {
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: "rgba(8,26,21,0.94)",
    borderWidth: 1, borderColor: "rgba(210,163,67,0.45)",
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  previewText: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 10.5, letterSpacing: 1.6 },
  draftPill: { borderColor: "rgba(198,161,91,0.7)", backgroundColor: "rgba(30,22,6,0.95)" },
  draftBack: { fontFamily: fonts.sansSemi, color: brand.goldLight, fontSize: 10.5, letterSpacing: 1.6 },
  previewDivider: { width: 1, height: 13, backgroundColor: "rgba(244,239,230,0.22)" },
  editPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999,
    backgroundColor: brand.goldLight,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  editPillText: { fontFamily: fonts.sansSemi, color: brand.nightDeep, fontSize: 10.5, letterSpacing: 1.6 },
  saveBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 14,
    backgroundColor: "rgba(8,26,21,0.96)",
    borderTopWidth: 1, borderTopColor: "rgba(210,163,67,0.4)",
  },
  discardBtn: { paddingVertical: 15, paddingHorizontal: 18 },
  discardText: { fontFamily: fonts.sansMedium, color: "rgba(244,239,230,0.7)", fontSize: 12, letterSpacing: 1 },
  saveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 15, backgroundColor: brand.forest,
    borderWidth: 1, borderColor: "rgba(210,163,67,0.5)",
  },
  saveText: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 12, letterSpacing: 2 },

  // ── Landing screen ──
  landingRoot: { flex: 1, backgroundColor: dark.bg },
  landingBg: { ...StyleSheet.absoluteFill },
  landingScroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 28 },
  landingCenter: { alignItems: "center", width: "100%" },
  landingMonoWrap: { width: 88, height: 88, alignItems: "center", justifyContent: "center", marginBottom: 28 },
  landingMonoRing: { ...StyleSheet.absoluteFill, borderRadius: 44, borderWidth: 1, borderColor: "rgba(210,163,67,0.4)" },
  landingMono: { fontFamily: fonts.serifItalic, color: brand.goldLight, fontSize: 34, letterSpacing: 1 },
  landingBrand: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 13, letterSpacing: 5, marginBottom: 14, textAlign: "center", textShadowColor: "rgba(0,0,0,0.65)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  landingTagline: { fontFamily: fonts.serif, color: "rgba(244,239,230,0.9)", fontSize: 16, lineHeight: 24, textAlign: "center", marginBottom: 44, letterSpacing: 0.3, textShadowColor: "rgba(0,0,0,0.65)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  landingActions: { width: "100%", gap: 14, marginBottom: 20 },
  landingBtn: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderWidth: 1, borderRadius: 12 },
  landingBtnRealtor: { borderColor: "rgba(210,163,67,0.4)", backgroundColor: "rgba(210,163,67,0.08)" },
  landingBtnClient: { borderColor: "rgba(244,239,230,0.15)", backgroundColor: "rgba(244,239,230,0.04)" },
  landingBtnTitle: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 15, letterSpacing: 0.3, marginBottom: 2 },
  landingBtnSub: { fontFamily: fonts.sans, color: "rgba(244,239,230,0.5)", fontSize: 11.5 },
  demoBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 20 },
  demoText: { fontFamily: fonts.sansMedium, color: "rgba(244,239,230,0.45)", fontSize: 13, letterSpacing: 1.2 },
  landingFooter: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingTop: 10, paddingHorizontal: 28 },
  landingFooterText: { fontFamily: fonts.sansMedium, color: "rgba(244,239,230,0.35)", fontSize: 11, letterSpacing: 3, textAlign: "center" },
});
