import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import NeutralContentCanvas from "@/components/NeutralContentCanvas";
import PressableScale from "@/components/PressableScale";
import { checkSite, useSiteCheck } from "@/lib/siteCheck";
import { randomUUID } from "expo-crypto";
import { analyzeBuild, loadBuild, saveBuildSources } from "@/lib/appBuilder/buildService";
import { applyBuildDraft } from "@/lib/appBuilder/applyDraft";
import { resolveFacts, type BuildSource } from "@/lib/appBuilder/sourceModel";
import ThemeCarousel from "@/components/ThemeCarousel";
import { imagePosition } from "@/lib/themeImages";
import { editorSave } from "@/lib/editorSave";
import { useListings, type ManagedListing } from "@/contexts/ListingsContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { toPortableImage } from "@/lib/portableImage";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ImagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Eye,
  Sparkles,
  Palette,
  Type as TypeIcon,
  SlidersHorizontal,
  Monitor,
  LayoutGrid,
  FileText,
  AlertTriangle,
  ArrowRight,
  X,
} from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { tint } from "@/constants/backdrops";
import {
  ACCENT_FAMILY_ORDER,
  SURFACE_ORDER,
  THEME_ACCENTS,
  THEME_FONTS,
  THEME_LOOKS,
  THEME_SURFACES,
  contrastCheck,
  matchLook,
  type ThemeAccent,
  type ThemeConfig,
  type ThemeFont,
  type ThemeLook,
  type ThemeSurface,
} from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand, type Brand } from "@/contexts/BrandContext";
import { studioPlaceholders as ph } from "@/constants/studioPlaceholders";
import { CLIENT_LAYOUTS } from "@/constants/clientLayouts";
import { DESIGNATIONS, type DesignationDef } from "@/constants/designations";
import {
  AGENT_TITLES,
  BROKERAGES,
  DEGREES,
  LANGUAGES,
  MEMBERSHIPS,
  US_STATES,
  VIBE_TAGS,
  yearOptions,
} from "@/constants/catalogues";
import { MultiPickerField, PickerField } from "@/components/PickerField";
import { requiredStatus } from "@/constants/sections";

type SectionId =
  | "profile"
  | "credentials"
  | "theme"
  | "hero"
  | "note"
  | "market"
  | "concierge"
  | "voices"
  | "closed"
  | "neighborhoods"
  | "pulse"
  | "footer";

/**
 * The walkthrough photography, reused as studio scenery.
 *
 * Each section gets the frame whose subject matches what is being edited, so
 * moving across the tab strip feels like walking through the same world the
 * intro established rather than landing on eleven identical grey forms.
 */
const SECTION_BG: Record<SectionId, number> = {
  profile: require("@/assets/images/onboard-bg-brand.jpg"),
  credentials: require("@/assets/images/onboard-bg-codes.jpg"),
  theme: require("@/assets/images/onboard-bg-control.jpg"),
  hero: require("@/assets/images/onboard-bg-listings.jpg"),
  note: require("@/assets/images/onboard-bg-connected.jpg"),
  market: require("@/assets/images/onboard-bg-brand.jpg"),
  concierge: require("@/assets/images/onboard-bg-codes.jpg"),
  voices: require("@/assets/images/onboard-bg-connected.jpg"),
  closed: require("@/assets/images/login-bg-door.jpg"),
  neighborhoods: require("@/assets/images/onboard-bg-listings.jpg"),
  pulse: require("@/assets/images/onboard-bg-brand.jpg"),
  footer: require("@/assets/images/onboard-bg-control.jpg"),
};

/**
 * Year lists are built once at module scope — regenerating them per keystroke
 * inside a repeater would rebuild sixty options on every edit.
 */
const GRAD_YEARS = yearOptions(60);
const AWARD_YEARS = yearOptions(40);
const LICENSE_YEARS = yearOptions(50);

const AnimatedImage = Animated.createAnimatedComponent(Image);

/**
 * Crossfades between section backdrops.
 *
 * Opacity is animated directly on the `expo-image` layer — wrapping it in an
 * extra `Animated.View` would force an offscreen buffer and visibly soften the
 * photograph, the same trap the onboarding carousel avoids.
 */
function StudioBackdrop({ source }: { source: number }) {
  const [base, setBase] = useState<number>(source);
  const [incoming, setIncoming] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (source === base) {
      setIncoming(null);
      return;
    }
    setIncoming(source);
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setBase(source);
      setIncoming(null);
      fade.setValue(0);
    });
  }, [source, base, fade]);

  return (
    <View pointerEvents="none" style={styles.backdrop}>
      <Image
        source={base}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        allowDownscaling={false}
        cachePolicy="memory-disk"
        priority="high"
      />
      {incoming !== null && (
        <AnimatedImage
          source={incoming}
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
          contentFit="cover"
          contentPosition="center"
          allowDownscaling={false}
          cachePolicy="memory-disk"
          priority="high"
        />
      )}
      {/* Legibility is carried at the top and bottom, where the chrome and the
          save dock sit. The middle band stays open so the photograph keeps its
          full richness behind the form. */}
      <></>
    </View>
  );
}

/**
 * A tab that behaves like a keycap: the cap travels down into a dark plinth on
 * press, then springs back. Weight comes from the plinth, sleekness from the
 * sheen across the cap.
 */
function KeyCap({
  onPress,
  active,
  baseStyle,
  capStyle,
  children,
}: {
  onPress: () => void;
  active: boolean;
  baseStyle?: any;
  capStyle?: any;
  children: React.ReactNode;
}) {
  /* The selected key stays latched at the bottom of its travel. */
  const travel = useRef(new Animated.Value(active ? 1 : 0)).current;
  const held = useRef(false);

  useEffect(() => {
    if (held.current) return;
    Animated.spring(travel, {
      toValue: active ? 1 : 0,
      speed: 20,
      bounciness: active ? 0 : 6,
      useNativeDriver: true,
    }).start();
  }, [active, travel]);

  const down = () => {
    held.current = true;
    Animated.timing(travel, {
      toValue: 1,
      duration: 55,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const up = () => {
    held.current = false;
    Animated.spring(travel, {
      toValue: active ? 1 : 0,
      speed: 22,
      bounciness: active ? 0 : 6,
      useNativeDriver: true,
    }).start();
  };

  const y = travel.interpolate({ inputRange: [0, 1], outputRange: [0, KEY_TRAVEL] });

  return (
    <Pressable onPressIn={down} onPressOut={up} onPress={onPress} style={[styles.keyBase, baseStyle]}>
      <Animated.View style={[styles.keyCap, capStyle, { transform: [{ translateY: y }] }]}>
        {/* Raised keys catch light on the crown; a latched key sits in shadow. */}
        <LinearGradient
          colors={
            active
              ? ["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]
              : ["rgba(255,255,255,0.13)", "rgba(255,255,255,0)"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.8 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {children}
      </Animated.View>
    </Pressable>
  );
}

const KEY_TRAVEL = 3;

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "credentials", label: "Credentials" },
  { id: "theme", label: "Theme" },
  { id: "hero", label: "Hero" },
  { id: "note", label: "Note" },
  { id: "market", label: "Market" },
  { id: "concierge", label: "Concierge" },
  { id: "voices", label: "Voices" },
  { id: "closed", label: "Closed" },
  { id: "neighborhoods", label: "Areas" },
  { id: "pulse", label: "Pulse" },
  { id: "footer", label: "Footer" },
];

export default function StudioScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const insets = useSafeAreaInsets();
  const { isAdmin, hydrated, enterViewAsClient } = useAuth();
  const { brand: live, saveBrand, syncStatus, setDraftPreview } = useBrand();
  const [saving, setSaving] = useState(false);
  const { all: liveListings, saveListings } = useListings();
  const [listingEdits, setListingEdits] = useState<Record<string, Partial<ManagedListing>>>({});

  const [draft, setDraft] = useState<Brand>(live);
  const [active, setActive] = useState<SectionId>(params.section === "theme" ? "theme" : "profile");
  const [dirty, setDirty] = useState<boolean>(false);
  const [tabsAtEnd, setTabsAtEnd] = useState<boolean>(false);
  const tabsRef = useRef<ScrollView>(null);

  /** Only worth surfacing when a save can't reach the realtor's other devices yet. */
  const offline = syncStatus !== "live" && syncStatus !== "connecting";

  // The required floor, measured against the draft rather than the published
  // brand — the realtor should see the gap close as they type, not after saving.
  const required = useMemo(() => requiredStatus(draft), [draft]);

  // Post-save confirmation. It exists for the beat right after you publish and
  // then gets out of the way — it is never a persistent status readout.
  const [confirmText, setConfirmText] = useState<string>("");
  const confirmOpacity = useRef(new Animated.Value(0)).current;
  const confirmLift = useRef(new Animated.Value(8)).current;
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashConfirm = (message: string) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmText(message);
    confirmOpacity.stopAnimation();
    confirmLift.stopAnimation();
    Animated.parallel([
      Animated.timing(confirmOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(confirmLift, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    confirmTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(confirmOpacity, {
          toValue: 0,
          duration: 480,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(confirmLift, {
          toValue: 8,
          duration: 480,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const onTabsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 8;
    setTabsAtEnd(atEnd);
  };

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  // Pull in remote changes when not actively editing
  useEffect(() => {
    if (!dirty) setDraft(live);
  }, [live, dirty]);

  // Never leave an unpublished draft overriding the app once Studio is gone.
  useEffect(() => {
    return () => setDraftPreview(null);
  }, [setDraftPreview]);

  const setBrand = (mutator: (d: Brand) => Brand) => {
    setDraft((d) => mutator(d));
    setDirty(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (params.section !== "theme" && Object.keys(listingEdits).length) {
        await saveListings(liveListings.map(l => listingEdits[l.id] ? { ...l, ...listingEdits[l.id], updatedAt: Date.now() } : l));
      }
      await saveBrand(editorSave(live, draft, params.section === "theme" ? "theme" : "content"));
    } catch {
      setSaving(false);
      Alert.alert("Couldn’t save", "Your edits are still here. Please try again.");
      return;
    }
    setSaving(false);
    setDraftPreview(null);
    setDirty(false);
    setListingEdits({});
    // Work is never held hostage — edits always save. What changes below the
    // floor is the promise: this is stored, but it is not yet a finished app.
    flashConfirm(
      !required.complete
        ? `Saved · ${required.missing.length} still needed before clients see a finished app`
        : offline
          ? "Saved · will sync when you're back online"
          : "Saved · your app is ready to preview and share when you choose"
    );
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    // Show the finished result: after saving, open the app as clients will see it
    // (Back or a swipe from the left edge returns to the dashboard).
    if (required.complete) {
      enterViewAsClient();
      router.replace("/");
    }
  };

  /** Throw away the unpublished draft and snap back to what clients currently see. */
  const discard = () => {
    const drop = () => {
      setDraft(live);
      setListingEdits({});
      setDirty(false);
      setDraftPreview(null);
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Discard your unsaved changes?")) drop();
      return;
    }
    Alert.alert("Discard changes?", "Your unpublished edits will be lost. Clients never saw them.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: drop },
    ]);
  };

  /** Leaving with unpublished edits should never silently drop them. */
  const leave = () => {
    if (!dirty) {
      setDraftPreview(null);
      router.back();
      return;
    }
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Save your changes?")) {
        void save();
        return;
      } else {
        setDraftPreview(null);
      }
      router.back();
      return;
    }
    Alert.alert("Unsaved changes", "Save your edits before leaving?", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          setDraftPreview(null);
          router.back();
        },
      },
      {
        text: "Save changes",
        onPress: () => {
          void save();
        },
      },
    ]);
  };

  const headTitle = useMemo(() => SECTIONS.find((s) => s.id === active)?.label ?? "", [active]);

  if (!hydrated || !isAdmin) {
    return <View style={{ flex: 1, backgroundColor: brand.nightDeep }} />;
  }

  return (
    <View style={styles.root}>

      <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
        <Pressable hitSlop={12} onPress={leave} style={styles.iconBtn}>
          <ArrowLeft size={18} color={brand.ivory} strokeWidth={1.5} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.brandName}>{params.section === "theme" ? "THEMES" : "EDIT CONTENT"}</Text>
          <Text style={styles.brandSub}>{headTitle.toUpperCase()}</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {params.section === "theme" && <View style={styles.tabsWrap}>
        <ScrollView
          ref={tabsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          onScroll={onTabsScroll}
          onContentSizeChange={() => {
            tabsRef.current?.scrollTo({ x: 0, animated: false });
          }}
          scrollEventThrottle={16}
        >
          {SECTIONS.filter(s => params.section === "theme" ? s.id === "theme" : s.id !== "theme").map((s) => {
            const on = s.id === active;
            return (
              <KeyCap
                key={s.id}
                active={on}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  setActive(s.id);
                }}
                capStyle={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{s.label}</Text>
              </KeyCap>
            );
          })}
        </ScrollView>
        {!tabsAtEnd && (
          <View pointerEvents="none" style={styles.tabsFade}>
            <LinearGradient
              colors={["rgba(8,10,9,0)", "rgba(8,10,9,0.92)"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.tabsFadeChip}>
              <ChevronRight size={15} color={brand.goldLight} strokeWidth={2.2} />
            </View>
          </View>
        )}
      </View>}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
          showsVerticalScrollIndicator={false}
        >
          {params.section !== "theme" && <UpdateUrlSection setBrand={setBrand} />}
          {params.section === "theme" ? <ThemeSection draft={draft} setBrand={setBrand} /> :
            <NeutralContentCanvas draft={draft} onChange={setBrand}
              listings={liveListings.map(l => ({ ...l, ...listingEdits[l.id] }))}
              onListingChange={(id, patch) => { setListingEdits(edits => ({ ...edits, [id]: { ...edits[id], ...patch } })); setDirty(true); }} details={{
              hero: <><ProfileSection draft={draft} setBrand={setBrand} /><HeroSection draft={draft} setBrand={setBrand} /></>,
              note: <NoteSection draft={draft} setBrand={setBrand} />,
              credentials: <CredentialsSection draft={draft} setBrand={setBrand} />,
              beat: <MarketSection draft={draft} setBrand={setBrand} />,
              concierge: <ConciergeSection draft={draft} setBrand={setBrand} />,
              social: <><VoicesSection draft={draft} setBrand={setBrand} /><ClosedSection draft={draft} setBrand={setBrand} /></>,
              footer: <FooterSection draft={draft} setBrand={setBrand} />,
              additional: <><NeighborhoodsSection draft={draft} setBrand={setBrand} /><PulseSection draft={draft} setBrand={setBrand} /></>,
            }} />}
        </ScrollView>
      </KeyboardAvoidingView>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.confirmWrap,
          { bottom: insets.bottom + 86, opacity: confirmOpacity, transform: [{ translateY: confirmLift }] },
        ]}
      >
        <View style={styles.confirmPill}>
          <Check size={13} color={brand.goldLight} strokeWidth={2.4} />
          <Text style={styles.confirmText}>{confirmText}</Text>
        </View>
      </Animated.View>

      {/* The floor, stated plainly and only while it is unmet. Tapping jumps to
          the tab that owns the first missing field rather than making the
          realtor hunt for it. */}
      {!required.complete ? (
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
            const first = required.missing[0];
            setActive(first?.id === "license" ? "credentials" : "profile");
          }}
          style={({ pressed }) => [
            styles.floorStrip,
            { bottom: insets.bottom + 78 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <AlertTriangle size={12} color={brand.goldLight} strokeWidth={1.9} />
          <Text style={styles.floorText} numberOfLines={1}>
            {required.missing.length} still needed · {required.missing[0]?.label}
          </Text>
          <ChevronRight size={13} color={brand.textOnDarkMuted} strokeWidth={1.8} />
        </Pressable>
      ) : null}

      <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={discard}
          disabled={!dirty}
          accessibilityRole="button"
          accessibilityLabel="Discard unsaved changes"
          style={({ pressed }) => [
            styles.resetBtn,
            !dirty && { opacity: 0.3 },
            pressed && dirty && { opacity: 0.7 },
          ]}
          hitSlop={6}
        >
          <RotateCcw size={14} color={dirty ? brand.goldLight : brand.ivory} strokeWidth={1.5} />
        </Pressable>
        <Pressable
          onPress={save}
          disabled={!dirty || saving}
          style={({ pressed }) => [
            styles.saveBtn,
            dirty && required.complete && styles.saveBtnReady,
            !dirty && { opacity: 0.45 },
            pressed && dirty && { opacity: 0.92 },
          ]}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.02)"]}
            style={StyleSheet.absoluteFill}
          />
          {dirty && (
            <LinearGradient
              colors={["rgba(210,163,67,0.26)", "transparent"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          {dirty ? (
            <Check size={16} color={brand.goldLight} strokeWidth={2} />
          ) : (
            <RefreshCw size={14} color={brand.textOnDarkMuted} strokeWidth={1.8} />
          )}
          <Text style={styles.saveText}>
            {dirty
              ? required.complete
                ? "Save & continue"
                : "Save progress"
              : required.complete
                ? "Saved · ready to share"
                : "Saved · not finished"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------ Sections ------------------------------ */

type SectionProps = {
  draft: Brand;
  setBrand: (mutator: (d: Brand) => Brand) => void;
};

function ProfileSection({ draft, setBrand }: SectionProps) {
  const r = draft.realtor;
  const set = <K extends keyof Brand["realtor"]>(k: K, v: Brand["realtor"][K]) =>
    setBrand((d) => ({ ...d, realtor: { ...d.realtor, [k]: v } }));

  return (
    <View>
      <SectionHeader title="Who you are" hint="Your name, contact and city — used everywhere in the app." />
      <PortraitField uri={draft.portraitUrl} onChange={(uri) => setBrand((d) => ({ ...d, portraitUrl: uri }))} label="HERO PORTRAIT" hint="Tap to choose a new portrait." />
      <Field label="FULL NAME" value={r.name} onChange={(v) => set("name", v)} placeholder={ph.profile.name} />
      <PickerField
        label="TITLE"
        value={r.title}
        onChange={(v) => set("title", v)}
        options={AGENT_TITLES}
        placeholder={ph.profile.title}
        allowCustom
        customHint="Check your state's rules before using an unlisted title."
        sheetTitle="Your title"
      />
      <Field label="CITY / REGION" value={r.city} onChange={(v) => set("city", v)} placeholder={ph.profile.city} />
      <Field label="PHONE" value={r.phone} onChange={(v) => set("phone", v)} keyboardType="phone-pad" placeholder={ph.profile.phone} />
      <Field label="EMAIL" value={r.email} onChange={(v) => set("email", v.toLowerCase())} keyboardType="email-address" placeholder={ph.profile.email} />
      <View style={styles.row2}>
        <Field
          small
          label="YEARS ACTIVE"
          value={r.yearsActive > 0 ? String(r.yearsActive) : ""}
          onChange={(v) => set("yearsActive", Number(v.replace(/[^\d]/g, "")) || 0)}
          keyboardType="numeric"
          placeholder={ph.profile.yearsActive}
        />
        <Field small label="VOLUME CLOSED" value={r.closedVolume} onChange={(v) => set("closedVolume", v)} placeholder={ph.profile.closedVolume} />
      </View>
      <Field label="TAGLINE" value={r.tagline} onChange={(v) => set("tagline", v)} multiline placeholder={ph.profile.tagline} />
    </View>
  );
}

/* --------------------------- Credentials --------------------------- */

/**
 * Credentials are captured as structured facts, never as prose.
 *
 * The realtor supplies the record; each theme decides how it is presented on
 * the client side (see `credentials` in ThemeTokens). Keeping designations as
 * catalogue codes rather than typed text is what makes that possible — a look
 * can render the short mark or the full trademarked name from the same entry.
 */
function CredentialsSection({ draft, setBrand }: SectionProps) {
  const c = draft.credentials;
  const [picking, setPicking] = useState<boolean>(false);

  const setC = <K extends keyof Brand["credentials"]>(k: K, v: Brand["credentials"][K]) =>
    setBrand((d) => ({ ...d, credentials: { ...d.credentials, [k]: v } }));

  const setLicense = <K extends keyof Brand["credentials"]["license"]>(
    k: K,
    v: Brand["credentials"]["license"][K]
  ) =>
    setBrand((d) => ({
      ...d,
      credentials: { ...d.credentials, license: { ...d.credentials.license, [k]: v } },
    }));

  const chosen = new Set(c.designations.map((d) => d.code));

  const toggleDesignation = (def: DesignationDef) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setC(
      "designations",
      chosen.has(def.code)
        ? c.designations.filter((d) => d.code !== def.code)
        : [...c.designations, { code: def.code, mark: def.mark, name: def.name }]
    );
  };

  const addCustom = () =>
    setC("designations", [...c.designations, { code: `custom-${Date.now()}`, mark: "", name: "" }]);

  const updateCustom = (code: string, key: "mark" | "name", v: string) =>
    setC(
      "designations",
      c.designations.map((d) => (d.code === code ? { ...d, [key]: v } : d))
    );

  const removeDesignation = (code: string) =>
    setC("designations", c.designations.filter((d) => d.code !== code));

  const custom = c.designations.filter((d) => d.code.startsWith("custom-"));

  return (
    <View>
      <SectionHeader
        title="Credentials"
        hint="Your qualifications, in your clients' words. Your theme decides where these appear."
      />

      {/* Designations — picked from a list so trademarked names stay exact. */}
      <View style={styles.credGroup}>
        <Text style={styles.label}>DESIGNATIONS</Text>
        <Text style={styles.fieldHint}>Tap the ones you hold.</Text>

        {c.designations.length > 0 ? (
          <View style={styles.credChips}>
            {c.designations
              .filter((d) => !d.code.startsWith("custom-"))
              .map((d) => (
                <Pressable
                  key={d.code}
                  onPress={() => removeDesignation(d.code)}
                  style={({ pressed }) => [styles.credChipOn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.credChipOnText}>{d.mark}</Text>
                  <X size={11} color={brand.goldLight} strokeWidth={2} />
                </Pressable>
              ))}
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
            setPicking((p) => !p);
          }}
          style={({ pressed }) => [styles.credPickToggle, pressed && { opacity: 0.85 }]}
        >
          <Plus size={13} color={brand.goldLight} strokeWidth={2} />
          <Text style={styles.credPickToggleText}>
            {picking ? "DONE CHOOSING" : "CHOOSE DESIGNATIONS"}
          </Text>
        </Pressable>

        {picking ? (
          <View style={styles.credList}>
            {DESIGNATIONS.map((def) => {
              const on = chosen.has(def.code);
              return (
                <Pressable
                  key={def.code}
                  onPress={() => toggleDesignation(def)}
                  style={({ pressed }) => [
                    styles.credOption,
                    on && styles.credOptionOn,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={styles.credOptionMark}>
                    <Text style={[styles.credOptionMarkText, on && { color: brand.goldLight }]}>
                      {def.mark}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.credOptionName}>{def.name}</Text>
                    <Text style={styles.credOptionBlurb}>{def.blurb}</Text>
                  </View>
                  {on ? <Check size={14} color={brand.goldLight} strokeWidth={2.2} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {custom.map((d) => (
          <View key={d.code} style={styles.cardBlock}>
            <View style={styles.row2}>
              <Field
                small
                label="SHORT MARK"
                value={d.mark}
                onChange={(v) => updateCustom(d.code, "mark", v.toUpperCase())}
                placeholder="CNE"
              />
              <Field
                small
                label="FULL NAME"
                value={d.name}
                onChange={(v) => updateCustom(d.code, "name", v)}
                placeholder={ph.credentials.designation}
              />
            </View>
            <Pressable onPress={() => removeDesignation(d.code)} style={styles.removeInline}>
              <Trash2 size={12} color="#A04A3C" strokeWidth={1.5} />
              <Text style={styles.removeInlineText}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <AddBtn label="Add another designation" onPress={addCustom} />
      </View>

      {/* Education */}
      <View style={styles.credGroup}>
        <Text style={styles.label}>EDUCATION</Text>
        {c.education.map((e, i) => (
          <View key={`edu-${i}`} style={styles.cardBlock}>
            <Field
              label="INSTITUTION"
              value={e.institution}
              onChange={(v) =>
                setC(
                  "education",
                  c.education.map((x, idx) => (idx === i ? { ...x, institution: v } : x))
                )
              }
              placeholder={ph.credentials.institution}
            />
            <View style={styles.row2}>
              <PickerField
                small
                label="DEGREE"
                value={e.credential}
                onChange={(v) =>
                  setC(
                    "education",
                    c.education.map((x, idx) => (idx === i ? { ...x, credential: v } : x))
                  )
                }
                options={DEGREES}
                allowCustom
                placeholder={ph.credentials.credential}
                sheetTitle="Degree"
              />
              <PickerField
                small
                label="YEAR"
                value={e.year}
                onChange={(v) =>
                  setC(
                    "education",
                    c.education.map((x, idx) => (idx === i ? { ...x, year: v } : x))
                  )
                }
                options={GRAD_YEARS}
                placeholder={ph.credentials.year}
                sheetTitle="Year"
              />
            </View>
            <Pressable
              onPress={() => setC("education", c.education.filter((_, idx) => idx !== i))}
              style={styles.removeInline}
            >
              <Trash2 size={12} color="#A04A3C" strokeWidth={1.5} />
              <Text style={styles.removeInlineText}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <AddBtn
          label="Add education"
          onPress={() =>
            setC("education", [...c.education, { institution: "", credential: "", year: "" }])
          }
        />
      </View>

      {/* Awards */}
      <View style={styles.credGroup}>
        <Text style={styles.label}>AWARDS & RECOGNITION</Text>
        {c.awards.map((a, i) => (
          <View key={`aw-${i}`} style={styles.cardBlock}>
            <Field
              label="AWARD"
              value={a.title}
              onChange={(v) =>
                setC("awards", c.awards.map((x, idx) => (idx === i ? { ...x, title: v } : x)))
              }
              placeholder={ph.credentials.awardTitle}
            />
            <View style={styles.row2}>
              <Field
                small
                label="ISSUED BY"
                value={a.issuer}
                onChange={(v) =>
                  setC("awards", c.awards.map((x, idx) => (idx === i ? { ...x, issuer: v } : x)))
                }
                placeholder={ph.credentials.issuer}
              />
              <PickerField
                small
                label="YEAR"
                value={a.year}
                onChange={(v) =>
                  setC("awards", c.awards.map((x, idx) => (idx === i ? { ...x, year: v } : x)))
                }
                options={AWARD_YEARS}
                placeholder="2024"
                sheetTitle="Year"
              />
            </View>
            <Pressable
              onPress={() => setC("awards", c.awards.filter((_, idx) => idx !== i))}
              style={styles.removeInline}
            >
              <Trash2 size={12} color="#A04A3C" strokeWidth={1.5} />
              <Text style={styles.removeInlineText}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <AddBtn
          label="Add award"
          onPress={() => setC("awards", [...c.awards, { title: "", issuer: "", year: "" }])}
        />
      </View>

      {/* Memberships & languages — simple lists, one per line. */}
      <View style={styles.credGroup}>
        <MultiPickerField
          label="MEMBERSHIPS"
          values={c.memberships}
          onChange={(v) => setC("memberships", v)}
          options={MEMBERSHIPS}
          emptyText="CHOOSE MEMBERSHIPS"
          allowCustom
          customHint="For your local board or MLS."
          hint="Tap a membership to remove it."
          sheetTitle="Memberships"
        />
        <MultiPickerField
          label="LANGUAGES SPOKEN"
          values={c.languages}
          onChange={(v) => setC("languages", v)}
          options={LANGUAGES}
          emptyText="CHOOSE LANGUAGES"
          allowCustom
          hint="Leave blank if you only work in English."
          sheetTitle="Languages"
        />
      </View>

      {/* Licensing — compliance, not marketing. Always rendered in the footer. */}
      <View style={styles.credGroup}>
        <Text style={styles.label}>LICENSING</Text>
        <Text style={styles.fieldHint}>
          Shown in the footer of every screen. Most states require your brokerage and licence
          number on advertising.
        </Text>
        <PickerField
          label="BROKERAGE"
          value={c.license.brokerage}
          onChange={(v) => setLicense("brokerage", v)}
          options={BROKERAGES}
          allowCustom
          customHint="For independent and boutique brokerages."
          placeholder={ph.credentials.brokerage}
          sheetTitle="Brokerage"
        />
        <View style={styles.row2}>
          <Field
            small
            label="LICENCE NUMBER"
            value={c.license.number}
            onChange={(v) => setLicense("number", v)}
            placeholder={ph.credentials.licenseNumber}
          />
          <PickerField
            small
            label="STATE"
            value={c.license.state}
            onChange={(v) => setLicense("state", v)}
            options={US_STATES}
            placeholder={ph.credentials.licenseState}
            sheetTitle="Licensing state"
          />
        </View>
        <PickerField
          label="LICENSED SINCE"
          value={c.license.since}
          onChange={(v) => setLicense("since", v)}
          options={LICENSE_YEARS}
          placeholder={ph.credentials.since}
          sheetTitle="Licensed since"
        />
      </View>
    </View>
  );
}

/* ------------------------------ Theme ------------------------------ */

type ThemeTab = "looks" | "color" | "type" | "style";
type PreviewTarget = "hero" | "collection" | "note";

const THEME_TABS: { id: ThemeTab; label: string; Icon: typeof Sparkles }[] = [
  { id: "looks", label: "Looks", Icon: Sparkles },
  { id: "color", label: "Color", Icon: Palette },
  { id: "type", label: "Type", Icon: TypeIcon },
  { id: "style", label: "Style", Icon: SlidersHorizontal },
];

const PREVIEW_TARGETS: { id: PreviewTarget; label: string; Icon: typeof Monitor }[] = [
  { id: "hero", label: "Hero", Icon: Monitor },
  { id: "collection", label: "Collection", Icon: LayoutGrid },
  { id: "note", label: "Note", Icon: FileText },
];

/** Mood photography for the look cards, cycled across the preset list. */
const LOOK_THUMBS: number[] = [
  require("@/assets/images/onboard-bg-listings.jpg"),
  require("@/assets/images/onboard-bg-control.jpg"),
  require("@/assets/images/onboard-bg-brand.jpg"),
  require("@/assets/images/onboard-bg-connected.jpg"),
  require("@/assets/images/login-bg-door.jpg"),
  require("@/assets/images/onboard-bg-codes.jpg"),
];

const LOOK_CARD_W = 116;
const LOOK_CARD_GAP = 10;
const LOOKS_PER_PAGE = 3;

function ThemeSection({ draft, setBrand }: SectionProps) {
  const { all: listings } = useListings();
  const accentId: ThemeAccent = draft.theme?.accent ?? "gold";
  const fontId: ThemeFont = draft.theme?.displayFont ?? "playfair";
  const surfaceId: ThemeSurface = draft.theme?.surface ?? "ivory";

  const [tab, setTab] = useState<ThemeTab>("looks");
  const [target, setTarget] = useState<PreviewTarget>("hero");
  const [looksPage, setLooksPage] = useState<number>(0);

  const tap = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  };

  const setAccent = (id: ThemeAccent) => {
    tap();
    setBrand((d) => ({ ...d, themeChosen: true, theme: { ...d.theme, accent: id } }));
  };
  const setFont = (id: ThemeFont) => {
    tap();
    setBrand((d) => ({ ...d, themeChosen: true, theme: { ...d.theme, displayFont: id } }));
  };
  const setSurface = (id: ThemeSurface) => {
    tap();
    setBrand((d) => ({ ...d, themeChosen: true, theme: { ...d.theme, surface: id } }));
  };
  const applyLook = (look: ThemeLook) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBrand((d) => ({
      ...d,
      themeChosen: true,
      theme: {
        ...d.theme,
        accent: look.accent,
        displayFont: look.displayFont,
        surface: look.surface,
      },
    }));
  };

  const active = THEME_ACCENTS[accentId] ?? THEME_ACCENTS.gold;
  const activeFont = THEME_FONTS[fontId] ?? THEME_FONTS.playfair;
  const activeSurface = THEME_SURFACES[surfaceId] ?? THEME_SURFACES.ivory;

  const currentLook = useMemo(
    () =>
      matchLook({ accent: accentId, displayFont: fontId, surface: surfaceId } as ThemeConfig),
    [accentId, fontId, surfaceId]
  );

  /* The accent has to carry small labels on the client's paper — that pairing
     is where a pretty palette quietly becomes unreadable, so it is what we score. */
  const contrast = useMemo(
    () => contrastCheck(active.deep, activeSurface.paper),
    [active.deep, activeSurface.paper]
  );

  const accentEntries = Object.entries(THEME_ACCENTS) as [
    ThemeAccent,
    (typeof THEME_ACCENTS)[ThemeAccent]
  ][];
  const fontList = Object.entries(THEME_FONTS) as [ThemeFont, (typeof THEME_FONTS)[ThemeFont]][];

  const looksPageCount = Math.ceil(THEME_LOOKS.length / LOOKS_PER_PAGE);
  const onLooksScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / ((LOOK_CARD_W + LOOK_CARD_GAP) * LOOKS_PER_PAGE));
    setLooksPage(Math.max(0, Math.min(looksPageCount - 1, page)));
  };

  return (
    <View>
      <ThemeCarousel draft={draft} listings={listings} onChoose={next => setBrand(() => next)} />
      {draft.theme.presentationVersion === 2 ? <>
        <Text style={{ color: "#D4C9B8", padding: 16, lineHeight: 21 }}>Each theme keeps its own design — your information fills it in. Tap the centre preview to drag and pinch your portrait into place; your original photo is preserved.</Text>
      </> : <>
      {/* ── Live preview ── */}
      <View style={styles.tpFrame}>
        <ThemePreview
          target={target}
          accent={active}
          font={activeFont}
          surface={activeSurface}
          realtor={draft.realtor}
          portraitUrl={draft.portraitUrl}
          themeConfig={draft.theme}
          layoutId={draft.layoutId}
        />
      </View>

      {/* ── What the frame is showing — glass segmented, sits with the preview ── */}
      <View style={styles.tpTargetRow}>
        {PREVIEW_TARGETS.map((t) => {
          const on = t.id === target;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                tap();
                setTarget(t.id);
              }}
              style={[styles.tpTargetBtn, on && { borderColor: tint(active.light, 0.5) }]}
            >
              {on && (
                <>
                  <LinearGradient
                    colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0.02)"]}
                    style={StyleSheet.absoluteFill}
                  />
                  <LinearGradient
                    colors={[tint(active.base, 0.26), "transparent"]}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </>
              )}
              <t.Icon
                size={13}
                color={on ? brand.ivory : brand.textOnDarkMuted}
                strokeWidth={1.7}
              />
              <Text style={[styles.tpTargetText, on && styles.tpTargetTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Editor panel ── */}
      <View style={styles.tpPanel}>
        <View style={styles.tpTabs}>
          {THEME_TABS.map((t) => {
            const on = t.id === tab;
            return (
              <KeyCap
                key={t.id}
                active={on}
                onPress={() => {
                  tap();
                  setTab(t.id);
                }}
                baseStyle={styles.tpTabBase}
                capStyle={[styles.tpTab, on && styles.tpTabOn]}
              >
                <t.Icon
                  size={15}
                  color={on ? "#F4EFE6" : brand.textOnDarkMuted}
                  strokeWidth={1.7}
                />
                <Text style={[styles.tpTabText, on && styles.tpTabTextOn]}>{t.label}</Text>
              </KeyCap>
            );
          })}
        </View>

        {tab === "looks" && (
          <View>
            <View style={styles.tpBlockHead}>
              <View style={styles.tpBlockHeadRow}>
                <Text style={styles.tpBlockTitle}>CHOOSE A LOOK</Text>
                <View style={styles.tpCurrentChip}>
                  <View style={styles.tpCurrentSwatches}>
                    <View style={[styles.tpCurrentSwatch, { backgroundColor: active.deep }]} />
                    <View style={[styles.tpCurrentSwatch, { backgroundColor: activeSurface.paper }]} />
                    <View style={[styles.tpCurrentSwatch, { backgroundColor: active.base }]} />
                  </View>
                  <Text style={styles.tpCurrentValue} numberOfLines={1}>
                    {currentLook ? currentLook.name : active.label}
                  </Text>
                </View>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tpLooksRow}
              onScroll={onLooksScroll}
              scrollEventThrottle={16}
              decelerationRate="fast"
              snapToInterval={LOOK_CARD_W + LOOK_CARD_GAP}
            >
              {THEME_LOOKS.map((look, i) => {
                const a = THEME_ACCENTS[look.accent];
                const f = THEME_FONTS[look.displayFont];
                const s = THEME_SURFACES[look.surface];
                const on = currentLook?.id === look.id;
                return (
                  <Pressable
                    key={look.id}
                    onPress={() => applyLook(look)}
                    style={[styles.lookCard, on && { borderColor: a.base }]}
                  >
                    <View style={styles.lookThumb}>
                      <Image
                        source={LOOK_THUMBS[i % LOOK_THUMBS.length]}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                      <></>
                      {on && (
                        <View style={[styles.lookTick, { backgroundColor: a.base }]}>
                          <Check size={12} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                    <View style={styles.lookBody}>
                      <Text
                        style={[styles.lookName, { fontFamily: f.display }]}
                        numberOfLines={1}
                      >
                        {look.name}
                      </Text>
                      <View style={styles.lookFootRow}>
                        <View style={styles.lookSwatches}>
                          <View style={[styles.lookSwatch, { backgroundColor: a.deep }]} />
                          <View style={[styles.lookSwatch, { backgroundColor: s.paper }]} />
                          <View style={[styles.lookSwatch, { backgroundColor: a.base }]} />
                        </View>
                        <Text style={styles.lookMeta} numberOfLines={1}>
                          {s.label}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.tpDots}>
              {Array.from({ length: looksPageCount }).map((_, i) => (
                <View
                  key={`dot-${i}`}
                  style={[styles.tpDot, i === looksPage && styles.tpDotOn]}
                />
              ))}
            </View>
          </View>
        )}

        {tab === "color" && (
          <View>
            <View style={styles.tpBlockHead}>
              <Text style={styles.tpBlockTitle}>ACCENT COLOR</Text>
              <Text style={styles.tpBlockHint}>
                Used for buttons, rules, and the small caps above every section.
              </Text>
            </View>
            {ACCENT_FAMILY_ORDER.map((family) => {
              const cells = accentEntries.filter(([, a]) => a.family === family);
              if (cells.length === 0) return null;
              return (
                <View key={family} style={styles.accentGroup}>
                  <Text style={styles.accentGroupLabel}>{family.toUpperCase()}</Text>
                  <View style={styles.swatchRow}>
                    {cells.map(([id, a]) => {
                      const on = id === accentId;
                      return (
                        <Pressable key={id} onPress={() => setAccent(id)} style={styles.swatchCell}>
                          <View
                            style={[styles.swatch, { backgroundColor: a.base }, on && styles.swatchOn]}
                          >
                            {on && <Check size={15} color={brand.paper} strokeWidth={3} />}
                          </View>
                          <Text
                            style={[styles.swatchLabel, on && { color: brand.ivory }]}
                            numberOfLines={1}
                          >
                            {a.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {tab === "type" && (
          <View>
            <View style={styles.tpBlockHead}>
              <Text style={styles.tpBlockTitle}>DISPLAY FONT</Text>
              <Text style={styles.tpBlockHint}>
                Sets every headline. Body copy stays on a neutral face for readability.
              </Text>
            </View>
            <View style={{ paddingHorizontal: 18, gap: 10, marginTop: 4 }}>
              {fontList.map(([id, f]) => {
                const on = id === fontId;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setFont(id)}
                    style={[
                      styles.fontTile,
                      on && { borderColor: active.base, backgroundColor: brand.night },
                    ]}
                  >
                    <View style={[styles.fontGlyph, on && { borderColor: active.base }]}>
                      <Text
                        style={[
                          styles.fontGlyphText,
                          { fontFamily: f.display },
                          on && { color: active.light },
                        ]}
                      >
                        Ag
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fontSample, { fontFamily: f.display }]}>
                        Homes I picked for you
                      </Text>
                      <Text style={styles.fontMeta}>
                        {f.label.toUpperCase()} · {f.note}
                      </Text>
                    </View>
                    <View style={[styles.fontRadio, on && { borderColor: active.base }]}>
                      {on && <View style={[styles.fontRadioDot, { backgroundColor: active.base }]} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {tab === "style" && (
          <View>
            <View style={styles.tpBlockHead}>
              <Text style={styles.tpBlockTitle}>PAPER</Text>
              <Text style={styles.tpBlockHint}>
                The canvas your clients scroll on. Warmer paper reads softer; cooler reads
                sharper.
              </Text>
            </View>
            <View style={{ paddingHorizontal: 18, gap: 10, marginTop: 4 }}>
              {SURFACE_ORDER.map((id) => {
                const s = THEME_SURFACES[id];
                const on = id === surfaceId;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setSurface(id)}
                    style={[
                      styles.surfaceTile,
                      on && { borderColor: active.base, backgroundColor: brand.night },
                    ]}
                  >
                    <View style={[styles.surfaceChip, { backgroundColor: s.paper }]}>
                      <View style={[styles.surfaceChipInner, { backgroundColor: s.panel }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.surfaceName}>{s.label}</Text>
                      <Text style={styles.fontMeta}>{s.note.toUpperCase()}</Text>
                    </View>
                    <View style={[styles.fontRadio, on && { borderColor: active.base }]}>
                      {on && <View style={[styles.fontRadioDot, { backgroundColor: active.base }]} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* A quiet nudge only when the pairing is genuinely hard to read. */}
      {contrast.grade === "fail" || contrast.grade === "large" ? (
        <View style={styles.legibilityRow}>
          <AlertTriangle size={15} color="#DCC06A" strokeWidth={1.9} />
          <Text style={styles.legibilityText}>
            {contrast.grade === "fail"
              ? "Small text in this colour will be hard to read on this paper. Try a deeper accent or a lighter paper."
              : "This colour works for headlines, but small text may be hard to read."}
          </Text>
        </View>
      ) : null}
      </>}
    </View>
  );
}

const PREVIEW_PHOTO = require("@/assets/images/studio-preview-pool.jpg");
const PREVIEW_PHOTO_ALT = require("@/assets/images/onboard-bg-brand.jpg");

/**
 * Copy for the preview, falling back to a dimmed word when the realtor hasn't
 * filled the field in yet.
 *
 * A theme is impossible to judge against blank space, but sample copy passed
 * off as their own is worse — it makes an unfinished profile look finished.
 * Placeholders read as visibly ghosted so there is always something to look at
 * without anyone mistaking it for real content.
 */
function copyOr(value: string | undefined, fallback: string): { text: string; ghost: boolean } {
  const v = (value ?? "").trim();
  return v.length > 0 ? { text: v, ghost: false } : { text: fallback, ghost: true };
}

/** Glass call-to-action — smoked panel, accent hairline, warm inner sheen. */
function GlassCta({ label, accent }: { label: string; accent: (typeof THEME_ACCENTS)[ThemeAccent] }) {
  return (
    <View style={[styles.tpCta, { borderColor: tint(accent.light, 0.55) }]}>
      <LinearGradient
        colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0.02)"]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[tint(accent.base, 0.3), "transparent"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.tpCtaText} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <ArrowRight size={12} color={accent.light} strokeWidth={2} />
      <View style={[styles.tpCtaSpark, { backgroundColor: accent.light }]} />
    </View>
  );
}

/**
 * Renders the chosen theme on the three surfaces clients actually see, using
 * the same tokens the live app consumes — so what a realtor approves here is
 * literally what ships.
 */
function ThemePreview({
  target,
  accent,
  font,
  surface,
  realtor,
  portraitUrl,
  themeConfig,
  layoutId,
}: {
  target: PreviewTarget;
  accent: (typeof THEME_ACCENTS)[ThemeAccent];
  font: (typeof THEME_FONTS)[ThemeFont];
  surface: (typeof THEME_SURFACES)[ThemeSurface];
  realtor: Brand["realtor"];
  portraitUrl: string;
  themeConfig: ThemeConfig;
  layoutId?: Brand["layoutId"];
}) {
  const ink = "#211C12";
  const mark = copyOr(realtor.brandName || realtor.name, "Your name");
  const sub = copyOr(realtor.brandSub || realtor.tagline, "Your tagline");
  const eyebrow = copyOr(realtor.heroEyebrow, "Your eyebrow");
  const headline = copyOr(realtor.heroMessage, "Your headline");
  const blurb = copyOr(realtor.welcomeNote, "Your description — a few warm lines about how you work.");
  const cta = copyOr(realtor.primaryCta, "See listings");
  const signer = copyOr(realtor.name, "Your name");

  if (target === "collection") {
    return (
      <View style={[styles.tpCanvas, { backgroundColor: surface.paper }]}>
        <Text style={[styles.tpEyebrow, { color: accent.deep }]}>CURATED FOR YOU</Text>
        <Text style={[styles.tpTitle, { fontFamily: font.display, color: ink }]}>
          Homes I picked{"\n"}for you.
        </Text>
        <View style={styles.tpGrid}>
          {[0, 1].map((i) => (
            <View
              key={`tile-${i}`}
              style={[
                styles.tpTile,
                { backgroundColor: surface.panel, borderColor: surface.hairline },
              ]}
            >
              <View style={styles.tpTileImg}>
                <Image
                  source={i === 0 ? PREVIEW_PHOTO : PREVIEW_PHOTO_ALT}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={240}
                />
              </View>
              <Text style={[styles.tpTileMeta, { color: accent.deep }]}>
                {i === 0 ? "JUST LISTED" : "BY APPOINTMENT"}
              </Text>
              <Text style={[styles.tpTileName, { fontFamily: font.display, color: ink }]}>
                {i === 0 ? "Cliff House" : "The Overlook"}
              </Text>
              <View style={[styles.tpTileRule, { backgroundColor: surface.hairline }]} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (target === "note") {
    return (
      <View style={[styles.tpCanvas, { backgroundColor: surface.paper }]}>
        <Text style={[styles.tpEyebrow, { color: accent.deep }]}>A NOTE FROM ME</Text>
        <View
          style={[
            styles.tpNoteCard,
            { backgroundColor: surface.panel, borderColor: surface.hairline },
          ]}
        >
          <View style={styles.tpNoteDateRow}>
            <Text style={[styles.tpNoteDate, { color: accent.deep }]}>THIS WEEK</Text>
            <View style={[styles.tpNoteRule, { backgroundColor: surface.hairline }]} />
          </View>
          <Text
            style={[
              styles.tpNoteBody,
              { fontFamily: font.displayItalic, color: ink },
              blurb.ghost && styles.tpGhostInk,
            ]}
            numberOfLines={4}
          >
            {blurb.text}
          </Text>
          <Text style={[styles.tpNoteSign, { fontFamily: font.displayItalic, color: "#6B6357" }]}>
            Warmly,
          </Text>
          <Text
            style={[styles.tpNoteName, { color: ink }, signer.ghost && styles.tpGhostInk]}
            numberOfLines={1}
          >
            {signer.text}
          </Text>
        </View>
      </View>
    );
  }

  /* Two-part hero: a photographic band on top, then the chosen paper carrying
     the headline. Type on paper is where a display face and accent are
     actually judged — the band above proves the same palette survives
     photography, and the glass CTA has a dark bed to sit on. */
  return (
    <View style={{ backgroundColor: surface.paper }}>
      <View style={styles.tpBand}>
        <Image
          source={portraitUrl ? { uri: portraitUrl } : PREVIEW_PHOTO}
          contentPosition={imagePosition(themeConfig, layoutId)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
        <></>
        <></>
        <View style={styles.tpBandInner}>
          <View style={styles.tpNavRow}>
            <View style={styles.tpNavMarkCol}>
              <Text
                style={[styles.tpNavMark, { fontFamily: font.display }, mark.ghost && styles.tpGhost]}
                numberOfLines={1}
              >
                {mark.text.toUpperCase()}
              </Text>
              <Text style={[styles.tpNavSub, sub.ghost && styles.tpGhost]} numberOfLines={1}>
                {sub.text.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.tpBandFoot}>
            <Text
              style={[
                styles.tpEyebrow,
                styles.tpOnPhoto,
                { color: accent.light },
                eyebrow.ghost && styles.tpGhost,
              ]}
              numberOfLines={1}
            >
              {eyebrow.text.toUpperCase()}
            </Text>
            <GlassCta label={cta.text} accent={accent} />
          </View>
        </View>
      </View>

      {/* Paper block — display face at full size on the chosen surface. */}
      <View style={styles.tpPaper}>
        <Text
          style={[
            styles.tpTitle,
            { fontFamily: font.display, color: ink },
            headline.ghost && styles.tpGhostInk,
          ]}
          numberOfLines={1}
        >
          {headline.text}
        </Text>
        <View style={styles.tpSigRow}>
          <View style={[styles.tpSigRule, { backgroundColor: accent.base }]} />
          <Text
            style={[
              styles.tpSig,
              { fontFamily: font.displayItalic, color: accent.deep },
              signer.ghost && styles.tpGhostInk,
            ]}
            numberOfLines={1}
          >
            {signer.text}
          </Text>
        </View>
      </View>
    </View>
  );
}

function HeroSection({ draft, setBrand }: SectionProps) {
  const r = draft.realtor;
  const set = <K extends keyof Brand["realtor"]>(k: K, v: Brand["realtor"][K]) =>
    setBrand((d) => ({ ...d, realtor: { ...d.realtor, [k]: v } }));
  return (
    <View>
      <SectionHeader title="The opening moment" hint="Everything on the first screen — wordmark, headline, and CTAs." />
      <View style={styles.row2}>
        <Field small label="MONOGRAM" value={r.monogram} onChange={(v) => set("monogram", v.slice(0, 3).toUpperCase())} placeholder={ph.hero.monogram} />
        <Field small label="BRAND NAME" value={r.brandName} onChange={(v) => set("brandName", v.toUpperCase())} placeholder={ph.hero.brandName} />
      </View>
      <Field label="BRAND SUB-LINE" value={r.brandSub} onChange={(v) => set("brandSub", v.toUpperCase())} placeholder={ph.hero.brandSub} />
      <Field label="HERO EYEBROW" value={r.heroEyebrow} onChange={(v) => set("heroEyebrow", v.toUpperCase())} placeholder={ph.hero.heroEyebrow} />
      <Field
        label="HERO HEADLINE"
        value={r.heroMessage}
        onChange={(v) => set("heroMessage", v)}
        multiline
        placeholder={ph.hero.heroMessage}
        hint="Use a line break for the second line."
      />
      <View style={styles.row2}>
        <Field small label="PRIMARY CTA" value={r.primaryCta} onChange={(v) => set("primaryCta", v)} placeholder={ph.hero.primaryCta} />
        <Field small label="SECONDARY CTA" value={r.secondaryCta} onChange={(v) => set("secondaryCta", v)} placeholder={ph.hero.secondaryCta} />
      </View>
      <Field
        label="WELCOME NOTE"
        value={r.welcomeNote}
        onChange={(v) => set("welcomeNote", v)}
        multiline
        placeholder={ph.hero.welcomeNote}
        hint="Optional — shown in onboarding contexts."
      />
    </View>
  );
}

function NoteSection({ draft, setBrand }: SectionProps) {
  const n = draft.note;
  const set = <K extends keyof Brand["note"]>(k: K, v: Brand["note"][K]) =>
    setBrand((d) => ({ ...d, note: { ...d.note, [k]: v } }));

  const updateBody = (i: number, v: string) => {
    const next = [...n.body];
    next[i] = v;
    set("body", next);
  };
  const addPara = () => set("body", [...n.body, ""]);
  const removePara = (i: number) => set("body", n.body.filter((_, idx) => idx !== i));

  return (
    <View>
      <SectionHeader title="A note from you" hint="The personal letter on your homepage and in the full reading view." />
      <PortraitField
        uri={draft.signatureUrl}
        onChange={(uri) => setBrand((d) => ({ ...d, signatureUrl: uri }))}
        label="SIGNATURE IMAGE"
        hint="Transparent PNG works best."
        square={false}
      />
      <Field label="DATE / KICKER" value={n.date} onChange={(v) => set("date", v)} placeholder={ph.note.date} />
      <Field label="TITLE" value={n.title} onChange={(v) => set("title", v)} placeholder={ph.note.title} />
      <Field label="OPENER (in letter view)" value={n.opener} onChange={(v) => set("opener", v)} placeholder={ph.note.opener} />

      <Text style={styles.subLabel}>PARAGRAPHS</Text>
      {n.body.map((p, i) => (
        <View key={`p-${i}`} style={styles.repeatRow}>
          <View style={{ flex: 1 }}>
            <TextInput
              value={p}
              onChangeText={(v) => updateBody(i, v)}
              multiline
              style={styles.textarea}
              placeholder={i === 0 ? ph.note.body : `Paragraph ${i + 1}…`}
              placeholderTextColor="rgba(46,42,32,0.4)"
            />
          </View>
          {n.body.length > 1 && (
            <Pressable onPress={() => removePara(i)} style={styles.repeatRemove} hitSlop={6}>
              <Trash2 size={14} color="#A04A3C" strokeWidth={1.5} />
            </Pressable>
          )}
        </View>
      ))}
      <AddBtn label="Add paragraph" onPress={addPara} />

      <Field label="SIGN-OFF" value={n.signoff} onChange={(v) => set("signoff", v)} placeholder={ph.note.signoff} />
    </View>
  );
}

function MarketSection({ draft, setBrand }: SectionProps) {
  const m = draft.beat;
  const set = <K extends keyof Brand["beat"]>(k: K, v: Brand["beat"][K]) =>
    setBrand((d) => ({ ...d, beat: { ...d.beat, [k]: v } }));

  const updateBullet = (i: number, key: "label" | "copy", v: string) => {
    const next = m.bullets.map((b, idx) => (idx === i ? { ...b, [key]: v } : b));
    set("bullets", next);
  };
  const addBullet = () => set("bullets", [...m.bullets, { label: "New segment", copy: "" }]);
  const removeBullet = (i: number) => set("bullets", m.bullets.filter((_, idx) => idx !== i));

  return (
    <View>
      <SectionHeader title="The honest read" hint="Three short takes shown on the dark market section." />
      <Field label="HEADLINE" value={m.headline} onChange={(v) => set("headline", v)} multiline placeholder={ph.beat.headline} />
      <Text style={styles.subLabel}>SEGMENTS</Text>
      {m.bullets.map((b, i) => (
        <View key={`b-${i}`} style={styles.cardBlock}>
          <Field small label={`#${i + 1} LABEL`} value={b.label} onChange={(v) => updateBullet(i, "label", v)} placeholder={ph.beat.label} />
          <Field
            label="YOUR TAKE"
            value={b.copy}
            onChange={(v) => updateBullet(i, "copy", v)}
            multiline
            placeholder={ph.beat.copy}
          />
          {m.bullets.length > 1 && (
            <Pressable onPress={() => removeBullet(i)} style={styles.removeInline}>
              <Trash2 size={12} color="#A04A3C" strokeWidth={1.5} />
              <Text style={styles.removeInlineText}>Remove</Text>
            </Pressable>
          )}
        </View>
      ))}
      <AddBtn label="Add segment" onPress={addBullet} />
    </View>
  );
}

function ConciergeSection({ draft, setBrand }: SectionProps) {
  const set = <K extends keyof Brand["concierge"]>(k: K, v: Brand["concierge"][K]) =>
    setBrand((d) => ({ ...d, concierge: { ...d.concierge, [k]: v } }));
  const setQ = <K extends keyof Brand["quickContact"]>(k: K, v: Brand["quickContact"][K]) =>
    setBrand((d) => ({ ...d, quickContact: { ...d.quickContact, [k]: v } }));
  const setC = <K extends keyof Brand["curated"]>(k: K, v: Brand["curated"][K]) =>
    setBrand((d) => ({ ...d, curated: { ...d.curated, [k]: v } }));
  return (
    <View>
      <SectionHeader title="Section copy" hint="The eyebrows and titles for sections on the homepage." />
      <Text style={styles.subLabel}>CURATED LISTINGS</Text>
      <Field label="EYEBROW" value={draft.curated.eyebrow} onChange={(v) => setC("eyebrow", v)} />
      <Field label="TITLE" value={draft.curated.title} onChange={(v) => setC("title", v)} multiline hint="Use a line break to wrap the title." />

      <Text style={styles.subLabel}>QUICK CONTACT</Text>
      <Field label="KICKER" value={draft.quickContact.kicker} onChange={(v) => setQ("kicker", v.toUpperCase())} />
      <Field label="TITLE" value={draft.quickContact.title} onChange={(v) => setQ("title", v)} />
      <Field
        label="SUBTITLE"
        value={draft.quickContact.sub}
        onChange={(v) => setQ("sub", v)}
        multiline
        hint="Use {first} to insert your first name."
      />

      <Text style={styles.subLabel}>CONCIERGE GRID</Text>
      <Field label="EYEBROW" value={draft.concierge.eyebrow} onChange={(v) => set("eyebrow", v)} />
      <Field label="TITLE" value={draft.concierge.title} onChange={(v) => set("title", v)} multiline />
    </View>
  );
}

function VoicesSection({ draft, setBrand }: SectionProps) {
  const t = draft.testimonials;
  const update = (i: number, key: "quote" | "author" | "detail", v: string) => {
    const next = t.map((x, idx) => (idx === i ? { ...x, [key]: v } : x));
    setBrand((d) => ({ ...d, testimonials: next }));
  };
  const add = () =>
    setBrand((d) => ({
      ...d,
      testimonials: [...d.testimonials, { quote: "", author: "", detail: "" }],
    }));
  const remove = (i: number) =>
    setBrand((d) => ({ ...d, testimonials: d.testimonials.filter((_, idx) => idx !== i) }));

  const set = <K extends keyof Brand["social"]>(k: K, v: Brand["social"][K]) =>
    setBrand((d) => ({ ...d, social: { ...d.social, [k]: v } }));

  return (
    <View>
      <SectionHeader title="In their words" hint="Client testimonials and the social-proof header." />
      <Field label="EYEBROW" value={draft.social.eyebrow} onChange={(v) => set("eyebrow", v)} />
      <Field label="TITLE" value={draft.social.title} onChange={(v) => set("title", v)} />
      <Field label="CLOSED-DEALS KICKER" value={draft.social.closedKicker} onChange={(v) => set("closedKicker", v.toUpperCase())} />

      <Text style={styles.subLabel}>TESTIMONIALS</Text>
      {t.map((x, i) => (
        <View key={`t-${i}`} style={styles.cardBlock}>
          <Field
            label="QUOTE"
            value={x.quote}
            onChange={(v) => update(i, "quote", v)}
            multiline
            placeholder="What they said about working with you."
          />
          <View style={styles.row2}>
            <Field small label="AUTHOR" value={x.author} onChange={(v) => update(i, "author", v)} />
            <Field small label="DETAIL" value={x.detail} onChange={(v) => update(i, "detail", v)} />
          </View>
          <Pressable onPress={() => remove(i)} style={styles.removeInline}>
            <Trash2 size={12} color="#A04A3C" strokeWidth={1.5} />
            <Text style={styles.removeInlineText}>Remove testimonial</Text>
          </Pressable>
        </View>
      ))}
      <AddBtn label="Add testimonial" onPress={add} />
    </View>
  );
}

function ClosedSection({ draft, setBrand }: SectionProps) {
  const c = draft.recentlyClosed;
  const update = (i: number, key: "address" | "price" | "days", v: string) => {
    const next = c.map((x, idx) => (idx === i ? { ...x, [key]: v } : x));
    setBrand((d) => ({ ...d, recentlyClosed: next }));
  };
  const add = () =>
    setBrand((d) => ({
      ...d,
      recentlyClosed: [...d.recentlyClosed, { address: "", price: "", days: "" }],
    }));
  const remove = (i: number) =>
    setBrand((d) => ({ ...d, recentlyClosed: d.recentlyClosed.filter((_, idx) => idx !== i) }));
  return (
    <View>
      <SectionHeader title="Recently closed" hint="Build trust with recent transactions." />
      {c.map((x, i) => (
        <View key={`c-${i}`} style={styles.cardBlock}>
          <Field label="ADDRESS" value={x.address} onChange={(v) => update(i, "address", v)} />
          <View style={styles.row2}>
            <Field small label="PRICE" value={x.price} onChange={(v) => update(i, "price", v)} placeholder="$5.1M" />
            <Field small label="DAYS" value={x.days} onChange={(v) => update(i, "days", v)} placeholder="12 days" />
          </View>
          <Pressable onPress={() => remove(i)} style={styles.removeInline}>
            <Trash2 size={12} color="#A04A3C" strokeWidth={1.5} />
            <Text style={styles.removeInlineText}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <AddBtn label="Add closed deal" onPress={add} />
    </View>
  );
}

function NeighborhoodsSection({ draft, setBrand }: SectionProps) {
  const n = draft.neighborhoods;
  const update = (i: number, mutator: (item: Brand["neighborhoods"][number]) => Brand["neighborhoods"][number]) => {
    setBrand((d) => ({
      ...d,
      neighborhoods: d.neighborhoods.map((x, idx) => (idx === i ? mutator(x) : x)),
    }));
  };
  const remove = (i: number) =>
    setBrand((d) => ({ ...d, neighborhoods: d.neighborhoods.filter((_, idx) => idx !== i) }));
  const add = () =>
    setBrand((d) => ({
      ...d,
      neighborhoods: [
        ...d.neighborhoods,
        {
          id: `n-${Date.now()}`,
          name: "New neighborhood",
          region: "",
          image: "",
          pace: "",
          pricePulse: "",
          blurb: "",
          vibe: [],
          picks: [],
        },
      ],
    }));

  return (
    <View>
      <SectionHeader title="Neighborhoods" hint="Editorial guides for the areas you cover." />
      {n.map((nh, i) => (
        <View key={nh.id} style={styles.cardBlock}>
          <PortraitField
            uri={nh.image}
            onChange={(uri) => update(i, (x) => ({ ...x, image: uri }))}
            label="HERO IMAGE"
            hint="Photo shown at the top of this neighborhood."
            square={false}
          />
          <Field label="NAME" value={nh.name} onChange={(v) => update(i, (x) => ({ ...x, name: v }))} />
          <Field label="REGION" value={nh.region} onChange={(v) => update(i, (x) => ({ ...x, region: v }))} placeholder="North Idaho" />
          <Field label="PACE" value={nh.pace} onChange={(v) => update(i, (x) => ({ ...x, pace: v }))} placeholder="Quietly competitive" />
          <Field label="PRICE PULSE" value={nh.pricePulse} onChange={(v) => update(i, (x) => ({ ...x, pricePulse: v }))} multiline />
          <Field label="YOUR READ" value={nh.blurb} onChange={(v) => update(i, (x) => ({ ...x, blurb: v }))} multiline />
          <MultiPickerField
            label="VIBE TAGS"
            values={nh.vibe}
            onChange={(v) => update(i, (x) => ({ ...x, vibe: v }))}
            options={VIBE_TAGS}
            emptyText="CHOOSE TAGS"
            allowCustom
            hint="Two or three read best on the card."
            sheetTitle="Vibe tags"
          />
          <Pressable onPress={() => remove(i)} style={styles.removeInline}>
            <Trash2 size={12} color="#A04A3C" strokeWidth={1.5} />
            <Text style={styles.removeInlineText}>Remove neighborhood</Text>
          </Pressable>
        </View>
      ))}
      <AddBtn label="Add neighborhood" onPress={add} />
    </View>
  );
}

function PulseSection({ draft, setBrand }: SectionProps) {
  const p = draft.marketPulse;
  const set = <K extends keyof Brand["marketPulse"]>(k: K, v: Brand["marketPulse"][K]) =>
    setBrand((d) => ({ ...d, marketPulse: { ...d.marketPulse, [k]: v } }));

  const updatePara = (i: number, v: string) => {
    const next = [...p.paragraphs];
    next[i] = v;
    set("paragraphs", next);
  };
  const addPara = () => set("paragraphs", [...p.paragraphs, ""]);
  const removePara = (i: number) => set("paragraphs", p.paragraphs.filter((_, idx) => idx !== i));

  return (
    <View>
      <SectionHeader title="Market pulse" hint="The opening commentary on the Neighborhoods screen." />
      <Field label="DATE / KICKER" value={p.date} onChange={(v) => set("date", v)} placeholder={ph.pulse.date} />
      <Field label="HEADLINE" value={p.headline} onChange={(v) => set("headline", v)} multiline placeholder={ph.pulse.headline} />
      <Text style={styles.subLabel}>PARAGRAPHS</Text>
      {p.paragraphs.map((para, i) => (
        <View key={`pp-${i}`} style={styles.repeatRow}>
          <View style={{ flex: 1 }}>
            <TextInput
              value={para}
              onChangeText={(v) => updatePara(i, v)}
              multiline
              style={styles.textarea}
              placeholder={i === 0 ? ph.pulse.paragraph : `Paragraph ${i + 1}…`}
              placeholderTextColor="rgba(46,42,32,0.4)"
            />
          </View>
          {p.paragraphs.length > 1 && (
            <Pressable onPress={() => removePara(i)} style={styles.repeatRemove} hitSlop={6}>
              <Trash2 size={14} color="#A04A3C" strokeWidth={1.5} />
            </Pressable>
          )}
        </View>
      ))}
      <AddBtn label="Add paragraph" onPress={addPara} />
      <Field label="SIGN-OFF" value={p.signoff} onChange={(v) => set("signoff", v)} placeholder={ph.pulse.signoff} />
    </View>
  );
}

function FooterSection({ draft, setBrand }: SectionProps) {
  return (
    <View>
      <SectionHeader title="Footer" hint="The fine print at the bottom of every screen." />
      <Field
        label="COPYRIGHT LINE"
        value={draft.copyright}
        onChange={(v) => setBrand((d) => ({ ...d, copyright: v }))}
        multiline
        placeholder={ph.copyright}
        hint="Year is added automatically."
      />
    </View>
  );
}

/* ------------------------------ Building blocks ------------------------------ */

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      <View style={styles.sectionRule} />
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  multiline,
  small,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "phone-pad" | "email-address";
  multiline?: boolean;
  small?: boolean;
  hint?: string;
}) {
  return (
    <View style={[styles.field, small && { flex: 1 }]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={brand.textOnDarkDim}
        keyboardType={keyboardType}
        multiline={multiline}
        style={multiline ? styles.textarea : styles.input}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function PortraitField({
  uri,
  onChange,
  label,
  hint,
  square = true,
}: {
  uri: string;
  onChange: (uri: string) => void;
  label: string;
  hint?: string;
  square?: boolean;
}) {
  const pick = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: square,
        aspect: square ? [1, 1] : undefined,
        quality: 0.92,
      });
      if (res.canceled || !res.assets[0]) return;
      const portable = await toPortableImage(res.assets[0].uri, square ? 800 : 1400);
      onChange(portable);
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    } catch (e) {
      console.log("[studio] pick error", e);
    }
  };

  return (
    <View style={styles.imageField}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <View style={styles.uploadRow}>
        <Pressable
          onPress={pick}
          style={({ pressed }) => [
            styles.uploadThumb,
            !square && styles.uploadThumbWide,
            pressed && { opacity: 0.85 },
          ]}
        >
          {uri ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <ImagePlus size={22} color="rgba(244,239,230,0.6)" strokeWidth={1.5} />
          )}
        </Pressable>
        <View style={styles.uploadActions}>
          <Pressable
            onPress={pick}
            style={({ pressed }) => [styles.uploadBtn, pressed && { opacity: 0.85 }]}
          >
            <ImagePlus size={14} color="#F4EFE6" strokeWidth={1.9} />
            <Text style={styles.uploadBtnText}>
              {uri ? "REPLACE PHOTO" : "UPLOAD PHOTO"}
            </Text>
          </Pressable>
          {uri ? null : (
            <Text style={styles.uploadEmpty}>Choose from your photo library.</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function AddBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
    >
      <Plus size={14} color={brand.goldLight} strokeWidth={2} />
      <Text style={styles.addBtnText}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.nightDeep },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,14,13,0.55)",
  },
  iconBtnLive: {
    borderColor: "rgba(198,161,91,0.55)",
    backgroundColor: "rgba(198,161,91,0.14)",
  },
  brandName: {
    fontFamily: fonts.sansSemi,
    color: brand.textOnDark,
    fontSize: 12,
    letterSpacing: 4,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  brandSub: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  tabsWrap: {
    backgroundColor: "transparent",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
    position: "relative",
  },
  tabsFade: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 12,
    width: 56,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tabsFadeChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.nightHi,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  tabs: { paddingHorizontal: 16, gap: 7, paddingVertical: 2 },
  /* Plinth the keycap sinks into. */
  keyBase: {
    borderRadius: 11,
    paddingBottom: KEY_TRAVEL,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  keyCap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    overflow: "hidden",
  },
  tab: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(20,23,21,0.92)",
  },
  /* Latched: sunk into the plinth, face in shadow, edge cooled. */
  tabOn: {
    backgroundColor: "rgba(9,11,10,0.97)",
    borderColor: "rgba(255,255,255,0.30)",
  },
  tabText: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 10,
    letterSpacing: 2,
  },
  tabTextOn: { color: brand.goldLight, fontFamily: fonts.sansSemi },
  confirmWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  confirmPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(14,17,15,0.96)",
    borderWidth: 1,
    borderColor: "rgba(198,161,91,0.45)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  confirmText: {
    fontFamily: fonts.sansMedium,
    color: brand.ivory,
    fontSize: 12.5,
    letterSpacing: 0.2,
  },
  sectionHead: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 6 },
  sectionTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 26,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  sectionHint: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 13, lineHeight: 18 },
  sectionRule: {
    height: 1,
    backgroundColor: brand.nightLine,
    marginTop: 16,
  },
  subLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.5,
    marginHorizontal: 24,
    marginTop: 22,
    marginBottom: 6,
  },
  field: { paddingHorizontal: 24, marginTop: 16 },
  label: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 6,
  },
  fieldHint: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  input: {
    fontFamily: fonts.sans,
    color: brand.textOnDark,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: brand.nightHi,
    borderWidth: 1,
    borderColor: brand.nightLine,
    borderRadius: 10,
  },
  textarea: {
    fontFamily: fonts.sans,
    color: brand.textOnDark,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 96,
    padding: 14,
    backgroundColor: brand.nightHi,
    borderWidth: 1,
    borderColor: brand.nightLine,
    borderRadius: 10,
    textAlignVertical: "top",
  },
  row2: { flexDirection: "row", gap: 14, paddingHorizontal: 24, marginTop: 16 },
  repeatRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 24,
    marginTop: 10,
    alignItems: "flex-start",
  },
  repeatRemove: {
    width: 32,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(160,74,60,0.35)",
  },
  cardBlock: {
    marginHorizontal: 16,
    marginTop: 14,
    paddingBottom: 18,
    backgroundColor: brand.nightHi,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  /* ── Credentials ── */
  credGroup: {
    marginTop: 26,
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: brand.nightLineSoft,
    paddingHorizontal: 24,
  },
  credChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  credChipOn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.42)",
    backgroundColor: "rgba(210,163,67,0.08)",
  },
  credChipOnText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10.5,
    letterSpacing: 1.6,
  },
  credPickToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 14,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightLo,
  },
  credPickToggleText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 1.8,
  },
  credList: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightLo,
  },
  credOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: brand.nightLineSoft,
  },
  credOptionOn: { backgroundColor: "rgba(210,163,67,0.07)" },
  credOptionMark: { width: 52 },
  credOptionMarkText: {
    fontFamily: fonts.sansSemi,
    color: brand.textOnDarkMuted,
    fontSize: 10.5,
    letterSpacing: 1.2,
  },
  credOptionName: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDark,
    fontSize: 12.5,
  },
  credOptionBlurb: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkDim,
    fontSize: 11,
    marginTop: 2,
  },
  removeInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  removeInlineText: {
    fontFamily: fonts.sansMedium,
    color: "#A04A3C",
    fontSize: 10,
    letterSpacing: 1.8,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 24,
    marginTop: 14,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightHi,
  },
  addBtnText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 11,
    letterSpacing: 2,
  },
  imageField: { paddingHorizontal: 24, marginTop: 16 },
  uploadRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 },
  uploadThumb: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: brand.nightHi,
    borderWidth: 1,
    borderColor: brand.nightLine,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  uploadThumbWide: { width: 132, height: 72 },
  uploadActions: { flex: 1, gap: 9 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  uploadBtnText: {
    fontFamily: fonts.sansSemi,
    color: "#F4EFE6",
    fontSize: 10.5,
    letterSpacing: 1.4,
  },
  uploadEmpty: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 11.5,
    textAlign: "center",
  },
  /* ── Theme: live preview ── */
  tpFrame: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  tpCanvas: { padding: 22, minHeight: 300 },
  tpBand: { height: 210, backgroundColor: "#141210" },
  tpBandInner: { flex: 1, padding: 18, justifyContent: "space-between" },
  tpBandFoot: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  tpPaper: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 20 },
  tpOnPhoto: {
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  tpNavRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  tpNavMarkCol: { flex: 1, minWidth: 0 },
  tpNavMark: {
    flex: 1, fontSize: 15, letterSpacing: 2.5, color: brand.ivory,
    textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 10,
  },
  tpNavSub: {
    fontFamily: fonts.sansMedium, color: "rgba(244,239,230,0.72)", fontSize: 8,
    letterSpacing: 2.6, marginTop: 3,
  },
  tpGhost: { color: "rgba(244,239,230,0.7)", fontStyle: "italic" },
  tpGhostInk: { color: "rgba(33,28,18,0.42)" },
  tpEyebrow: { fontFamily: fonts.sansMedium, fontSize: 9.5, letterSpacing: 2.8 },
  tpTitle: { fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
  tpSigRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  tpSigRule: { width: 26, height: 1.5 },
  tpSig: { fontSize: 15 },
  tpCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 6,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(12,12,12,0.42)",
  },
  tpCtaText: { fontFamily: fonts.sansSemi, color: "#FFFFFF", fontSize: 9.5, letterSpacing: 1.8 },
  tpCtaSpark: { position: "absolute", right: 7, bottom: 6, width: 4, height: 4, borderRadius: 2 },
  tpGrid: { flexDirection: "row", gap: 12, marginTop: 20 },
  tpTile: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 12 },
  tpTileImg: { height: 62, borderRadius: 4, marginBottom: 12, overflow: "hidden", backgroundColor: "#141210" },
  tpTileMeta: { fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1.6 },
  tpTileName: { fontSize: 18, marginTop: 4 },
  tpTileRule: { height: 1, marginTop: 10 },
  tpNoteCard: { marginTop: 14, borderWidth: 1, borderRadius: 8, padding: 20 },
  tpNoteDateRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  tpNoteDate: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 2.4 },
  tpNoteRule: { flex: 1, height: 1 },
  tpNoteBody: { fontSize: 17, lineHeight: 25 },
  tpNoteSign: { fontSize: 14, marginTop: 18 },
  tpNoteName: { fontFamily: fonts.sansMedium, fontSize: 10.5, letterSpacing: 1.8, marginTop: 3 },

  /* ── Theme: current look + target switcher ── */
  tpCurrentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 9,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexShrink: 1,
  },
  tpCurrentSwatches: { flexDirection: "row" },
  tpCurrentSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: -4,
    borderWidth: 1,
    borderColor: "rgba(10,12,11,0.85)",
  },
  tpCurrentValue: {
    fontFamily: fonts.sansMedium,
    color: brand.ivory,
    fontSize: 11,
    flexShrink: 1,
  },
  tpTargetRow: {
    flexDirection: "row",
    marginTop: 10,
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(10,12,11,0.66)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tpTargetBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
    overflow: "hidden",
  },
  tpTargetText: { fontFamily: fonts.sansMedium, color: brand.textOnDarkMuted, fontSize: 11.5 },
  tpTargetTextOn: { color: brand.ivory },

  /* ── Theme: editor panel ── */
  tpPanel: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: "rgba(10,12,11,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingBottom: 18,
    overflow: "hidden",
  },
  tpTabs: {
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  tpTabBase: { flex: 1, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.42)" },
  tpTab: {
    gap: 7,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(22,25,23,0.9)",
  },
  tpTabOn: {
    backgroundColor: "rgba(9,11,10,0.97)",
    borderColor: "rgba(255,255,255,0.26)",
  },
  tpTabText: { fontFamily: fonts.sansMedium, color: brand.textOnDarkMuted, fontSize: 12 },
  tpTabTextOn: { color: brand.goldLight, fontFamily: fonts.sansSemi },
  tpBlockHead: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 2 },
  tpBlockHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  tpBlockTitle: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 12,
    letterSpacing: 2,
  },
  tpBlockHint: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 5,
  },

  /* ── Theme: look cards ── */
  tpLooksRow: { paddingHorizontal: 18, paddingTop: 12, gap: LOOK_CARD_GAP },
  lookCard: {
    width: LOOK_CARD_W,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(20,23,21,0.9)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.10)",
  },
  lookThumb: { height: 68, backgroundColor: "#141713" },
  lookTick: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  lookBody: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  lookName: { color: brand.ivory, fontSize: 14, letterSpacing: -0.2 },
  lookFootRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 8,
  },
  lookMeta: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 9.5,
    flexShrink: 1,
  },
  lookSwatches: { flexDirection: "row", gap: 4 },
  lookSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  tpDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    marginTop: 16,
  },
  tpDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  tpDotOn: { backgroundColor: brand.gold, width: 7, height: 7, borderRadius: 4 },

  /* ── Theme: paper tiles ── */
  surfaceTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: "rgba(18,21,19,0.7)",
  },
  surfaceChip: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.18)",
  },
  surfaceChipInner: { width: 20, height: 20, borderRadius: 4 },
  surfaceName: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDark,
    fontSize: 14,
  },

  legibilityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(201,162,39,0.10)",
    borderWidth: 1,
    borderColor: "rgba(201,162,39,0.26)",
  },
  legibilityText: {
    flex: 1,
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.82)",
    fontSize: 12,
    lineHeight: 17,
  },

  accentGroup: { paddingHorizontal: 18, marginTop: 16 },
  accentGroupLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkDim,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 12,
  },
  swatchRow: {
    flexDirection: "row",
    gap: 12,
  },
  swatchCell: { alignItems: "center", width: 62, gap: 8 },
  swatch: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchOn: { borderColor: brand.ivory },
  swatchLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 9.5,
    letterSpacing: 0.3,
  },
  fontTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightHi,
    borderRadius: 12,
  },
  fontGlyph: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.nightLo,
  },
  fontGlyphText: { color: brand.textOnDarkMuted, fontSize: 22, lineHeight: 26 },
  fontSample: { color: brand.ivory, fontSize: 22, letterSpacing: -0.3 },
  fontMeta: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 9,
    letterSpacing: 1.6,
    marginTop: 5,
  },
  fontRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: brand.nightLine,
    alignItems: "center",
    justifyContent: "center",
  },
  fontRadioDot: { width: 10, height: 10, borderRadius: 5 },
  floorStrip: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.3)",
    backgroundColor: "rgba(28,22,8,0.96)",
  },
  floorText: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    color: brand.textOnDark,
    fontSize: 11.5,
    letterSpacing: 0.3,
  },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "rgba(8,10,9,0.86)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  resetBtn: {
    width: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    backgroundColor: "rgba(18,18,16,0.72)",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.55)",
    overflow: "hidden",
  },
  saveBtnReady: { backgroundColor: "#2E8B57", borderColor: "#70C58B" },
  saveText: {
    fontFamily: fonts.sansSemi,
    color: brand.textOnDark,
    fontSize: 12,
    letterSpacing: 2,
  },
});

/**
 * Edit Content's "Update URL": the Build Your App website field recreated here,
 * pre-filled with the saved website. It runs the existing import (replace the
 * primary website source → analyzeBuild → applyBuildDraft) into the editor
 * draft, so the refreshed information is reviewed here and published with Save.
 */
function UpdateUrlSection({ setBrand }: { setBrand: (mutator: (d: Brand) => Brand) => void }) {
  const { realtorId } = useAuth();
  const [url, setUrl] = useState("");
  const [urlFocused, setUrlFocused] = useState(false);
  const [sources, setSources] = useState<BuildSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void loadBuild().then(saved => {
      if (!alive || !saved) return;
      setSources(saved.sources);
      const primary = saved.sources.find(source => source.kind === "url");
      if (primary) setUrl(current => current || primary.uri);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  /** https:// is assumed when left off; a hostname needs a dot to count. */
  const normalizeUrl = (raw: string): string | null => {
    const value = raw.trim();
    if (!value) return null;
    try {
      const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (parsed.protocol !== "https:" || !/\.[a-z]{2,}$/i.test(parsed.hostname)) return null;
      return parsed.toString();
    } catch { return null; }
  };
  const websiteUri = normalizeUrl(url);
  // A well-formed address still has to exist: the checkmark waits for the domain lookup.
  const siteCheck = useSiteCheck(websiteUri);
  const websiteState: "empty" | "valid" | "invalid" | "checking" | "missing" = !url.trim() ? "empty" : !websiteUri ? "invalid"
    : siteCheck === "missing" ? "missing" : siteCheck === "found" || siteCheck === "unknown" ? "valid" : "checking";
  const primarySource = sources.find(source => source.kind === "url") ?? null;

  const update = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!websiteUri) throw new Error("Check your website address, then try again.");
      if (await checkSite(websiteUri) === "missing") throw new Error("We couldn’t find that website. Check the address and try again.");
      if (!realtorId) throw new Error("Sign in to save your sources.");
      // Same rule as Build Your App: the website in the field replaces the older primary one.
      if (primarySource?.uri !== websiteUri) {
        const fresh: BuildSource = { id: randomUUID(), kind: "url", label: new URL(websiteUri).hostname, uri: websiteUri, status: "queued" };
        const next = [fresh, ...sources.filter(source => source.id !== primarySource?.id)];
        await saveBuildSources(realtorId, next);
        setSources(next);
      }
      const saved = await analyzeBuild();
      setSources(saved.sources);
      const facts = resolveFacts(saved.evidence);
      setBrand(d => ({ ...applyBuildDraft(d, facts, saved.draft), layoutId: d.layoutId, theme: d.theme }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
      <View style={{ marginTop: 30, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#C2A276",
        backgroundColor: "rgba(194,162,118,0.08)" }}>
        <Text style={{ color: "white", fontSize: 20, fontWeight: "600" }}>Update URL</Text>
        <Text style={{ color: "#C8D0D0", lineHeight: 21, marginTop: 6 }}>
          Updating the URL will replace information previously generated from the previous URL. You may need to review or re-enter some fields afterward.
        </Text>
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1.5,
          borderColor: websiteState === "valid" ? "#3FB37F" : websiteState === "missing" || (websiteState === "invalid" && !urlFocused) ? "#FF9C85" : "#7B858C",
          backgroundColor: "#0C1014", paddingHorizontal: 14 }}>
          <TextInput value={url} onChangeText={setUrl} onFocus={() => setUrlFocused(true)} onBlur={() => setUrlFocused(false)}
            placeholder="yourwebsite.com" placeholderTextColor="#6F7A80" accessibilityLabel="Website or profile URL"
            autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="done"
            style={{ flex: 1, color: "white", fontSize: 18, paddingVertical: 16 }} />
          {websiteState === "valid" ? <View accessibilityLabel="Website looks good" style={{ width: 28, height: 28, borderRadius: 14,
            backgroundColor: "#3FB37F", alignItems: "center", justifyContent: "center" }}>
            <Check size={17} color="white" strokeWidth={3} />
          </View> : null}
        </View>
        {websiteState === "invalid" && !urlFocused
          ? <Text accessibilityRole="alert" style={{ color: "#FFBAA9", marginTop: 8 }}>That doesn’t look like a web address. Try something like yourname.com</Text>
          : websiteState === "missing"
            ? <Text accessibilityRole="alert" style={{ color: "#FFBAA9", marginTop: 8 }}>We couldn’t find that website. Check the address and try again.</Text>
          : websiteState === "checking" ? <Text style={{ color: "#9AA4AA", marginTop: 8 }}>Checking…</Text>
          : primarySource?.status === "failed" && primarySource.uri === websiteUri
            ? <Text style={{ color: "#FFBAA9", marginTop: 8 }}>We couldn’t read this site{primarySource.error ? ` — ${primarySource.error}` : ""}</Text>
            : websiteState === "valid" ? <Text style={{ color: "#8FD9B4", marginTop: 8 }}>Looks good</Text> : null}
        {error ? <Text accessibilityRole="alert" style={{ color: "#FFBAA9", marginTop: 12 }}>{error}</Text> : null}
        <PressableScale accessibilityRole="button" onPress={() => void update()} disabled={busy} haptic="medium" style={{ marginTop: 16 }}>
          <View style={{ minHeight: 52, borderRadius: 14, backgroundColor: "#C2A276", alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
            {busy ? <ActivityIndicator color="#172027" />
              : <Text style={{ color: "#172027", fontSize: 16, fontWeight: "700" }}>Update From URL</Text>}
          </View>
        </PressableScale>
        {busy ? <Text style={{ color: "#C8D0D0", marginTop: 10, textAlign: "center" }}>Reading your website and building your profile…</Text> : null}
      </View>
    </View>
  );
}
