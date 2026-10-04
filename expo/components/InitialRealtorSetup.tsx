import { useSetupDraft } from "@/hooks/useSetupDraft";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Check, FileText, ImageIcon, Link2, Users, X } from "lucide-react-native";
import { Image } from "expo-image";
import PortraitImage from "./PortraitImage";
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBrand, type Brand } from "@/contexts/BrandContext";
import { REQUIRED_FIELDS, requiredStatus } from "@/constants/sections";
import { toPortableImage } from "@/lib/portableImage";
import { usePortraitPicker } from "@/hooks/usePortraitPicker";
import { useAuth } from "@/contexts/AuthContext";
import { CLIENT_LAYOUTS, DEFAULT_CLIENT_LAYOUT } from "@/constants/clientLayouts";
import { themeCandidate } from "@/constants/themeDesigns";

import BuildUrlEntry from "./BuildUrlEntry";
import OnboardingThemePreview from "./OnboardingThemePreview";
import {liveThemeDesign} from "@/constants/liveThemeDesigns";
import { analyzeBuild, appendBuildSources, BUILDER_AUTH_MESSAGE, hasVerifiedBuilderAuth, loadBuild, markBuildComplete, regenerateBuildCopy, saveBuildSources, uploadBuildFile, type SavedBuild } from "@/lib/appBuilder/buildService";
import ListingSourceImporter from "./ListingSourceImporter";
import { connectListingSource } from "@/lib/listingSourceService";
import { mergeDiscoveredListings, saveDiscoveredListings } from "@/lib/appBuilder/importDiscoveredListings";
import { applyBuildDraft } from "@/lib/appBuilder/applyDraft";
import { resolveFacts, type BuildSource } from "@/lib/appBuilder/sourceModel";
import { sniffContactFile, parseCsvContacts, parseVCard } from "@/lib/parseContacts";
import { useClients } from "@/contexts/ClientsContext";
import { useListings } from "@/contexts/ListingsContext";
import PressableScale from "@/components/PressableScale";
import { checkSite, useSiteCheck } from "@/lib/siteCheck";

type Phase = "collect" | "building" | "review";
type ErrorPlace = "sources" | "review" | "hero" | "intro" | "listings";
type AskId = "name" | "city" | "phone" | "email" | "heroLine";
type ConfirmField = "realtor.name" | "realtor.title" | "realtor.city" | "realtor.phone" | "realtor.email" | "realtor.brandName";

const CONFIRM_LABELS: Record<ConfirmField, string> = {
  "realtor.name": "Your name",
  "realtor.title": "Title",
  "realtor.city": "City or region",
  "realtor.phone": "Phone",
  "realtor.email": "Email",
  "realtor.brandName": "Business or team name",
};
const ASK_FOR_FIELD: Partial<Record<ConfirmField, AskId>> = {
  "realtor.name": "name", "realtor.city": "city", "realtor.phone": "phone", "realtor.email": "email",
};

export default function InitialRealtorSetup() {
  const auth = useAuth();
  const { importMany } = useClients();
  const { all: existingListings, saveListings, hydrated: listingsHydrated } = useListings();
  const { brand, saveBrand, publishBrand, isPublished } = useBrand();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { editPortrait, cropper } = usePortraitPicker({ maxWidth: 1600, cropOutputSize: 1200 });
  const scrollRef = useRef<ScrollView>(null);
  const authPanelY = useRef(0);
  const [url, setUrl] = useState("");
  const [sources, setSources] = useState<BuildSource[]>([]);
  const [result, setResult] = useState<SavedBuild | null>(null);
  const [draft, setDraft] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);
  const publicationInProgress = useRef(false);
  const [error, setError] = useState<{ place: ErrorPlace; message: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** null = still checking; false = need portal sign-in (never invent signup here); true = unlocked. */
  const [builderReady, setBuilderReady] = useState<boolean | null>(null);
  const [contactCount, setContactCount] = useState(0);
  const [pendingContacts, setPendingContacts] = useState<{ contacts: ReturnType<typeof parseCsvContacts>; format: "csv" | "vcard" } | null>(null);
  const [activity, setActivity] = useState("");
  /** The website in the main field, once saved as a source. */
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [urlFocused, setUrlFocused] = useState(false);
  const [extraUrl, setExtraUrl] = useState("");
  const [showExtraUrl, setShowExtraUrl] = useState(false);
  const [building, setBuilding] = useState(false);
  const [editingSources, setEditingSources] = useState(false);
  const [regenerating, setRegenerating] = useState<"heroMessage" | "aboutParagraph" | null>(null);
  const [showLicense, setShowLicense] = useState(false);
  const [importedListingCount, setImportedListingCount] = useState(0);
  const [hasConnectedSource, setHasConnectedSource] = useState(false);
  /**
   * Which inputs the review asks for, fixed when the draft is created. Rendering
   * from live values made a field vanish after its first keystroke (it stopped
   * being "missing") and shifted the inputs after it, dropping focus.
   */
  const [askFor, setAskFor] = useState<AskId[]>([]);
  const [confirmList, setConfirmList] = useState<{ field: ConfirmField; also: string[] }[]>([]);
  const localImages = useRef<Record<string, string>>({});
  const listingsSnapshot = useRef(existingListings);
  useEffect(() => { listingsSnapshot.current = existingListings; }, [existingListings]);

  const phase: Phase = building ? "building" : result && draft && !editingSources ? "review" : "collect";
  const isGuestAccess = !!auth.isGuestAccess;
  const authHydrated = !!auth.hydrated;
  // Guest REALTOR access codes: never gate. Edge (non-guest, no cloud auth): send to portal —
  // build must never invent signup/sign-in forms.
  const needsBuilderAuth = authHydrated && !isGuestAccess && builderReady === false;

  // Moving to the next stage brings it into view — no hunting for new content.
  useEffect(() => {
    if (phase !== "collect") scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [phase]);

  /** Start the review from a draft and freeze what we'll ask about. */
  const startReview = (saved: SavedBuild, next: Brand) => {
    const facts = resolveFacts(saved.evidence);
    const confirms = facts
      .filter(fact => fact.needsClarification && fact.value && fact.field in CONFIRM_LABELS)
      .map(fact => ({ field: fact.field as ConfirmField, also: fact.conflictingValues }));
    const confirmed = new Set(confirms.map(item => ASK_FOR_FIELD[item.field]).filter(Boolean));
    setConfirmList(confirms);
    // Phone and email are asked for separately: finding one must never hide the other.
    const ask: AskId[] = [];
    for (const item of REQUIRED_FIELDS) {
      if (item.met(next)) continue;
      if (item.id === "contact") {
        if (!next.realtor.phone.trim() && !confirmed.has("phone")) ask.push("phone");
        if (!next.realtor.email.trim() && !confirmed.has("email")) ask.push("email");
      } else if (!confirmed.has(item.id as AskId)) ask.push(item.id as AskId);
    }
    setAskFor(ask);
    setShowLicense(false);
    setDraft(next);
  };

  /** Seamlessly fold multi-hop discoveries into the realtor's listing collection. */
  const applyDiscoveredListings = async (saved: SavedBuild) => {
    const found = saved.draft.discoveredListings ?? [];
    if (!found.length) {
      setImportedListingCount(0);
      return 0;
    }
    const merged = await saveDiscoveredListings(listingsSnapshot.current, found, saveListings);
    listingsSnapshot.current = merged;
    setImportedListingCount(found.length);
    return found.length;
  };

  const loadSavedBuild = useCallback(async () => {
    if (publicationInProgress.current) return;
    const saved = await loadBuild();
    if (publicationInProgress.current) return;
    if (!saved) return;
    // Restore the actual collection, not just the count displayed in the draft.
    await applyDiscoveredListings(saved);
    // Historical onboarding URLs must not reopen a completed build. URL refresh
    // remains available in Studio and can still reuse this completed source.
    if (saved.status === 'complete') { router.dismissTo('/admin'); return; }
    setSources(saved.sources);
    const primary = saved.sources.find(source => source.kind === "url");
    if (primary) { setUrl(primary.uri); setPrimaryId(primary.id); }
    setResult(saved);
    if (saved.evidence.length) {
      startReview(saved, applyBuildDraft(brand, resolveFacts(saved.evidence), saved.draft));
      const found = saved.draft.discoveredListings ?? [];
      setImportedListingCount(found.length);
    }
  }, [brand, router, saveListings]);

  // Product model: real users sign up/in BEFORE /admin/build. Guest REALTOR codes
  // are owner-test only and use the local builder — never an account panel.
  // Wait for auth hydrate so guest sessions are not briefly treated as "need email".
  useEffect(() => {
    if (!authHydrated || !listingsHydrated) return;
    let alive = true;
    void (async () => {
      try {
        if (isGuestAccess) {
          if (!alive) return;
          setBuilderReady(true);
          try { await loadSavedBuild(); }
          catch (e) {
            if (!alive) return;
            const message = e instanceof Error ? e.message : "Could not load your app build.";
            if (message !== BUILDER_AUTH_MESSAGE) setError({ place: "sources", message });
          }
          return;
        }
        const ready = await hasVerifiedBuilderAuth();
        if (!alive) return;
        setBuilderReady(ready);
        if (ready) {
          try { await loadSavedBuild(); }
          catch (e) {
            if (!alive) return;
            const message = e instanceof Error ? e.message : "Could not load your app build.";
            if (message === BUILDER_AUTH_MESSAGE) setBuilderReady(false);
            else setError({ place: "sources", message });
          }
        }
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [loadSavedBuild, isGuestAccess, authHydrated, listingsHydrated]);

  const progressDraft = useSetupDraft(
    "myrealtor.build-draft.v1:" + auth.realtorId,
    { url, draft, result, askFor, confirmList, editingSources },
    saved => {
      setUrl(saved.url); setDraft(saved.draft); setResult(saved.result);
      setAskFor(saved.askFor); setConfirmList(saved.confirmList); setEditingSources(saved.editingSources);
    }, loaded && !!auth.realtorId);

  const leaveBuild = async () => {
    if (busy || building) return;
    try {
      await progressDraft.flush();
      if (auth.realtorRecord?.client_code_enabled === true) { router.replace("/admin"); return; }
      const message = auth.isGuestAccess
        ? "Leave this owner-test session? Entering the test code again starts a new test account."
        : "Your progress is saved on this device. Sign out and return later to finish setup?";
      const exit = async () => { await auth.logout(); router.replace("/portal"); };
      if (Platform.OS === "web") { if (window.confirm(message)) await exit(); }
      else Alert.alert("Sign out?", message, [{ text: "Keep building", style: "cancel" },
        { text: "Sign out", onPress: () => { void exit(); } }]);
    } catch { setError({ place: phase === "review" ? "review" : "sources", message: "Couldn't save progress. Please retry before leaving." }); }
  };
  const leaveBuildRef = useRef(leaveBuild);
  leaveBuildRef.current = leaveBuild;
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { void leaveBuildRef.current(); return true; });
    return () => subscription.remove();
  }, []));

  /** Edge case only: non-guest without cloud auth — send to portal (never invent signup here). */
  const goPortalAuth = useCallback(() => {
    setError(null);
    router.replace({ pathname: "/portal", params: { entry: "realtor" } });
  }, [router]);

  const act = async (place: ErrorPlace, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await work(); }
    catch (e) {
      const message = e instanceof Error ? e.message : "Please try again.";
      if (!isGuestAccess && (message === BUILDER_AUTH_MESSAGE || message.includes("Sign in to save"))) {
        setBuilderReady(false);
        setError(null);
        goPortalAuth();
      } else {
        setError({ place, message });
      }
    }
    finally { setBusy(false); setActivity(""); }
  };
  const errorFor = (place: ErrorPlace) => {
    if (!error || error.place !== place) return null;
    if (error.message === BUILDER_AUTH_MESSAGE) return null;
    return <Text accessibilityRole="alert" style={{ color: "#FFBAA9", marginTop: 12 }}>{error.message}</Text>;
  };

  const saveSources = async (next: BuildSource[]): Promise<BuildSource[]> => {
    if (!auth.realtorId) throw new Error("Sign in to save your sources.");
    await saveBuildSources(auth.realtorId, next);
    setSources(next);
    setResult(null);
    setDraft(null);
    return next;
  };
  const addSource = (source: BuildSource) => saveSources([...sources, source]);
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
  const urlSource = (uri: string): BuildSource =>
    ({ id: randomUUID(), kind: "url", label: new URL(uri).hostname, uri, status: "queued" });
  const websiteUri = normalizeUrl(url);
  // A well-formed address still has to exist: the checkmark waits for the domain lookup.
  const siteCheck = useSiteCheck(websiteUri);
  const websiteState: "empty" | "valid" | "invalid" | "checking" | "missing" = !url.trim() ? "empty" : !websiteUri ? "invalid"
    : siteCheck === "missing" ? "missing" : siteCheck === "found" || siteCheck === "unknown" ? "valid" : "checking";
  const primarySource = sources.find(source => source.id === primaryId) ?? null;
  const extraLinks = sources.filter(source => source.kind === "url" && source.id !== primaryId);
  const documents = sources.filter(source => source.kind === "document");
  const images = sources.filter(source => source.kind === "image");

  const addUrl = () => void act("sources", async () => {
    const uri = normalizeUrl(extraUrl);
    if (!uri) throw new Error("That link doesn't look right. Check it and try again.");
    await addSource(urlSource(uri));
    setExtraUrl("");
    setShowExtraUrl(false);
  });
  const addFile = (kind: "document" | "image") => void act("sources", async () => {
    if (kind === "image") {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const source = await uploadBuildFile({ uri: asset.uri, name: asset.fileName || "realtor-image.jpg",
        mimeType: asset.mimeType, size: asset.fileSize }, "image");
      localImages.current[source.id] = asset.uri;
      await addSource(source);
    } else {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"], copyToCacheDirectory: true });
      if (picked.canceled) return;
      await addSource(await uploadBuildFile(picked.assets[0], "document"));
    }
  });
  const analyze = () => {
    if (!isGuestAccess && builderReady === false) { goPortalAuth(); return; }
    void act("sources", async () => {
    let current = sources;
    if (url.trim() && !websiteUri) throw new Error("Check your website address, then try again.");
    if (websiteUri && await checkSite(websiteUri) === "missing") throw new Error("We couldn’t find that website. Check the address and try again.");
    // Lock in the website from the main field, replacing an older one if it changed.
    if (websiteUri && primarySource?.uri !== websiteUri) {
      const fresh = urlSource(websiteUri);
      current = await saveSources([fresh, ...sources.filter(source => source.id !== primaryId)]);
      setPrimaryId(fresh.id);
    }
    if (!current.some(source => source.kind !== "contacts")) throw new Error("Paste the public page where your listings live.");
    setEditingSources(false);
    setBuilding(true);
    try {
      setActivity("Reading your website and building your profile…");
      const saved = await analyzeBuild();
      setSources(saved.sources);
      setResult(saved);
      const next = applyBuildDraft(brand, resolveFacts(saved.evidence), saved.draft);
      const portraitUri = saved.draft.portraitSourceId && localImages.current[saved.draft.portraitSourceId];
      if (portraitUri) next.portraitUrl = await toPortableImage(portraitUri, 1600);
      startReview(saved, next);
      setActivity(saved.draft.discoveredListings?.length
        ? `Importing ${saved.draft.discoveredListings.length} listing${saved.draft.discoveredListings.length === 1 ? "" : "s"}…`
        : "Finishing your profile…");
      await applyDiscoveredListings(saved);
    } finally {
      setBuilding(false);
    }
  });
  };
  const addContacts = () => void act("sources", async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/vcard", "text/x-vcard", "text/plain", "*/*"],
      copyToCacheDirectory: true });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    const text = Platform.OS === "web" ? await (await fetch(asset.uri)).text()
      : await FileSystem.readAsStringAsync(asset.uri, { encoding: "utf8" });
    const format = sniffContactFile(text);
    const contacts = format === "vcard" ? parseVCard(text) : parseCsvContacts(text);
    if (!contacts.length) throw new Error("No contacts were found in that file.");
    setPendingContacts({ contacts, format: format === "vcard" ? "vcard" : "csv" });
  });
  const confirmContacts = () => void act("sources", async () => {
    if (!pendingContacts) return;
    const summary = importMany(pendingContacts.contacts, pendingContacts.format);
    setContactCount(count => count + summary.added + summary.merged);
    setPendingContacts(null);
  });
  /** New wording for one piece of copy; everything else in the draft is kept. */
  const regenerate = (target: "heroMessage" | "aboutParagraph") => {
    if (busy || regenerating) return;
    const place: ErrorPlace = target === "heroMessage" ? "hero" : "intro";
    setRegenerating(target);
    setError(null);
    void (async () => {
      try {
        const saved = await regenerateBuildCopy(target);
        const value = (saved.draft[target] ?? "").trim();
        if (!value) throw new Error("No new version came back. Please try again.");
        setResult(saved);
        setDraft(current => current && (target === "heroMessage"
          ? { ...current, realtor: { ...current.realtor, heroMessage: value } }
          : { ...current, note: { ...current.note, body: [value] } }));
      } catch (e) {
        setError({ place, message: e instanceof Error ? e.message : "Couldn't write a new version. Please try again." });
      } finally {
        setRegenerating(null);
      }
    })();
  };

  const missingLabels = draft ? requiredStatus(draft).missing.map(item => item.label) : [];
  const finish = () => void act("review", async () => {
    publicationInProgress.current = true;
    const firstPublication = !isPublished;
    try {
    if (!draft) throw new Error("Build your app first.");
    // Same rule set the rest of the app uses — REQUIRED_FIELDS is the only source of truth.
    const missing = requiredStatus(draft).missing;
    if (missing.length) throw new Error(`Please add: ${missing.map(item => item.label.toLowerCase()).join(", ")}.`);
    if (result) await applyDiscoveredListings(result);
    // Guarantee the published brand uses the real themed canvas for the AI-picked layout.
    const layoutId = draft.layoutId && CLIENT_LAYOUTS.some(l => l.id === draft.layoutId)
      ? draft.layoutId : DEFAULT_CLIENT_LAYOUT;
    const publish = draft.presentation === 'website' ? draft : themeCandidate(draft, layoutId);
    if (!isGuestAccess && importedListingCount > 0 && !hasConnectedSource) {
      const listingSources = result?.sources.filter(source => source.kind === "listing" || source.kind === "url") ?? [];
      const candidate = listingSources.findLast(source => source.kind === "listing") ?? listingSources[0];
      if (candidate) {
        setActivity("Connecting your listings for automatic updates…");
        await connectListingSource(candidate.uri);
        setHasConnectedSource(true);
      }
    }
    await saveBrand(publish);
    await publishBrand(publish);
    await markBuildComplete();
    await progressDraft.clear();
    router.replace(firstPublication ? "/admin/ready" : "/admin");
    } catch (error) { publicationInProgress.current = false; throw error; }
  });
  const setProfile = (key: keyof Brand["realtor"], value: string) =>
    setDraft(current => current && ({ ...current, realtor: { ...current.realtor, [key]: value } }));
  const setLicense = (key: "number" | "state" | "brokerage", value: string) =>
    setDraft(current => current && ({ ...current, credentials: { ...current.credentials,
      license: { ...current.credentials.license, [key]: value } } }));
  const selectPortrait = () => void act("review", async () => {
    const uri = await editPortrait(draft?.portraitUrl);
    if (!uri) return;
    setDraft(current => current && ({ ...current, portraitUrl: uri }));
  });

  // ── Building blocks ──
  const input = (key: string, label: string, value: string, change: (value: string) => void, keyboardType: "default" | "email-address" | "phone-pad" = "default") =>
    <View key={key} style={{ marginTop: 12 }}>
      <Text style={{ color: "#D7D8D3", marginBottom: 6 }}>{label}</Text>
      <TextInput value={value} onChangeText={change} accessibilityLabel={label} keyboardType={keyboardType}
        autoCapitalize={keyboardType === "default" ? "words" : "none"} autoCorrect={false}
        style={{ color: "white", borderColor: "#646C70", borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 }} />
    </View>;
  const button = (label: string, onPress: () => void, primary = false, disabled = busy) =>
    <PressableScale accessibilityRole="button" onPress={onPress} disabled={disabled} haptic={disabled ? "none" : "selection"} style={{ marginTop: 10 }}>
      <View style={{ padding: 14, borderRadius: 11, borderWidth: 1, borderColor: primary ? "#C2A276" : "#657079",
        backgroundColor: primary ? "#C2A276" : "#171D22", opacity: disabled ? 0.55 : 1 }}>
        <Text style={{ color: primary ? "#172027" : "white", textAlign: "center", fontWeight: "600" }}>{label}</Text>
      </View>
    </PressableScale>;
  /** Secondary, clearly optional control; whatever it added is listed right inside it. */
  const optional = (Icon: typeof Link2, label: string, onPress: () => void, added: React.ReactNode) =>
    <View key={label} style={{ borderRadius: 12, borderWidth: 1, borderColor: "#3A444B", paddingHorizontal: 14, paddingVertical: 12 }}>
      <Pressable accessibilityRole="button" onPress={onPress} disabled={busy} hitSlop={6}
        style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon size={18} color="#C2A276" strokeWidth={1.8} />
        <Text style={{ color: "#E6E9EA", fontSize: 15 }}>{label}</Text>
      </Pressable>
      {added}
    </View>;
  const sourceLine = (source: BuildSource) =>
    <Text key={source.id} style={{ color: source.status === "failed" ? "#FFBAA9" : "#8FD9B4", marginTop: 6 }} numberOfLines={2}>
      {source.status === "failed" ? "✕ Couldn’t read" : "✓"} {source.kind === "url" ? source.uri.replace(/^https:\/\//, "").replace(/\/$/, "") : source.label}
      {source.status === "failed" && source.error ? ` — ${source.error}` : ""}
    </Text>;
  const readValue = (field: ConfirmField) => draft ? String(draft.realtor[field.split(".")[1] as keyof Brand["realtor"]] ?? "") : "";

  if (loaded && !progressDraft.ready) return <View style={{ flex: 1, backgroundColor: "#101419", justifyContent: "center" }}><ActivityIndicator color="white" /></View>;

  const sourceSummary = [
    primarySource ? primarySource.uri.replace(/^https:\/\//, "").replace(/\/$/, "") : websiteUri ? websiteUri.replace(/^https:\/\//, "").replace(/\/$/, "") : "",
    extraLinks.length ? `${extraLinks.length} more link${extraLinks.length > 1 ? "s" : ""}` : "",
    documents.length ? `${documents.length} document${documents.length > 1 ? "s" : ""}` : "",
    images.length ? `${images.length} image${images.length > 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(" · ");

  // Build never invents signup — edge case only points realtors back to the portal.
  const builderAuthPanel = needsBuilderAuth ? (
    <View
      onLayout={e => { authPanelY.current = e.nativeEvent.layout.y; }}
      style={{ marginTop: 24, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#C2A276", backgroundColor: "rgba(194,162,118,0.10)" }}
    >
      <Text style={{ color: "#C2A276", fontSize: 12, fontWeight: "700", letterSpacing: 1.6 }}>SIGN IN REQUIRED</Text>
      <Text style={{ color: "white", fontSize: 18, fontWeight: "600", marginTop: 6 }}>Finish account setup in the portal</Text>
      <Text style={{ color: "#C8D0D0", marginTop: 8, lineHeight: 22 }}>
        Real realtor accounts sign up or sign in before building. Continue at the portal — this page does not create accounts.
      </Text>
      <PressableScale accessibilityRole="button" onPress={goPortalAuth} haptic="medium" style={{ marginTop: 16 }}>
        <View style={{ minHeight: 52, borderRadius: 12, backgroundColor: "#C2A276", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#172027", fontSize: 16, fontWeight: "700" }}>Go to realtor sign-in</Text>
        </View>
      </PressableScale>
    </View>
  ) : null;

  if (phase === 'collect') return <BuildUrlEntry url={url} onChange={setUrl} busy={!loaded || busy || builderReady===null || !authHydrated} onSubmit={needsBuilderAuth ? goPortalAuth : analyze} onExit={()=>void leaveBuild()} error={error?.place==='sources'?error.message:undefined}/>;
  return <View style={{ flex: 1 }}>
  {cropper}
  <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: "#101419" }}
    contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 36 }}
    keyboardShouldPersistTaps="handled">
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => phase === "review" ? setEditingSources(true) : void leaveBuild()} hitSlop={12}
        style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#555C64", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "white", fontSize: 11 }}>{phase === "review" ? "Back" : "Exit"}</Text>
      </Pressable>
      <Text style={{ color: "#9AA4AA", fontSize: 12, letterSpacing: 1.4 }}>APP BUILDER</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => void leaveBuild()} hitSlop={12}
        style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#555C64", alignItems: "center", justifyContent: "center" }}>
        <X size={18} color="white" strokeWidth={1.8} />
      </Pressable>
    </View>
    {progressDraft.error ? <Text accessibilityRole="alert" style={{ color: "#FFBAA9" }}>{progressDraft.error}</Text> : null}
    {!loaded && <Text style={{ color: "#C8D0D0", marginTop: 20 }}>Loading…</Text>}

    {/* After submitting, the inputs collapse to a one-line summary. */}
    {loaded && <View style={{ marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: "#1A2127",
      flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#3FB37F", alignItems: "center", justifyContent: "center" }}>
        <Check size={15} color="white" strokeWidth={3} />
      </View>
      <Text style={{ color: "#C8D0D0", flex: 1 }} numberOfLines={2}>{sourceSummary || "Your information"}</Text>
      {phase === "review" && <Pressable accessibilityRole="button" onPress={() => setEditingSources(true)} hitSlop={8}>
        <Text style={{ color: "#C2A276", fontWeight: "600" }}>Change</Text>
      </Pressable>}
    </View>}

    {loaded && phase === "building" && <View style={{ marginTop: 28, padding: 24, borderRadius: 16, backgroundColor: "#1A2127", alignItems: "center" }}>
      <ActivityIndicator color="#C2A276" size="large" />
      <Text style={{ color: "white", fontSize: 18, fontWeight: "600", marginTop: 16, textAlign: "center" }}>Building your app…</Text>
      <Text style={{ color: "#9AA4AA", marginTop: 6, textAlign: "center" }}>{activity || "Reading your website and building your profile…"} This usually takes under a minute.</Text>
    </View>}

    {loaded && phase === "review" && result && draft && <>
      <Text style={{ color: "white", fontSize: 24, fontWeight: "600", marginTop: 28 }}>Here’s your app</Text>
      <Text style={{ color: "#C8D0D0", lineHeight: 22, marginTop: 8 }}>
        {draft.presentation === 'website' ? 'Your website’s branding and content are ready in a native app. You can compare Original and Optimized from Edit Theme.' : `We used ${CLIENT_LAYOUTS.find(layout => layout.id === draft.layoutId)?.name ?? 'a starting layout'} for your style — you can switch later from Edit My App.`}
      </Text>

      {/* Real themed canvas — never a flat brown/charcoal stub. The same full client renderer is used here and after publishing. */}
      {(() => {
        const layoutId = draft.layoutId && CLIENT_LAYOUTS.some(l => l.id === draft.layoutId)
          ? draft.layoutId : DEFAULT_CLIENT_LAYOUT;
        const previewBrand = draft.presentation === 'website' ? draft : themeCandidate(draft, layoutId);
        const design = liveThemeDesign(layoutId, previewBrand.theme);
        const width = Math.min(Math.max(260, windowWidth - 48), 360);
        return <>
          <View style={{ marginTop: 18, alignItems: "center" }}>
            <View style={{ opacity: regenerating === "heroMessage" ? 0.55 : 1, width }}>
              <OnboardingThemePreview brand={previewBrand} listings={mergeDiscoveredListings(existingListings,result?.draft.discoveredListings??[])} width={width}/>
            </View>
            <Text style={{ color: "#9AA4AA", marginTop: 10, textAlign: "center", fontSize: 13 }}>
              {design.name} · how your clients will see the opening screen
            </Text>
          </View>
          {/* Opening line under the real theme so regenerate still has a clear target. */}
          <View style={{ marginTop: 14, padding: 14, borderRadius: 12, backgroundColor: design.panel, borderWidth: 1, borderColor: design.accent + "44" }}>
            <Text style={{ color: design.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>OPENING LINE</Text>
            <Text style={{ color: design.ink, marginTop: 8, fontSize: 18, fontFamily: "PlayfairDisplay_500Medium",
              opacity: regenerating === "heroMessage" ? 0.4 : 1 }} numberOfLines={4}>
              {draft.realtor.heroMessage || draft.realtor.tagline || draft.realtor.brandName || "Your opening line"}
            </Text>
          </View>
        </>;
      })()}
      {button(regenerating === "heroMessage" ? "Writing a new opening line…" : "Try another opening line",
        () => regenerate("heroMessage"), false, busy || !!regenerating)}
      {errorFor("hero")}

      {(() => {
        const layoutId = draft.layoutId && CLIENT_LAYOUTS.some(l => l.id === draft.layoutId)
          ? draft.layoutId : DEFAULT_CLIENT_LAYOUT;
        const design = liveThemeDesign(layoutId, draft.presentation === 'website' ? draft.theme : themeCandidate(draft, layoutId).theme);
        return <View style={{ marginTop: 18, padding: 16, borderRadius: 14, backgroundColor: design.panel, borderWidth: 1, borderColor: design.accent + "33" }}>
          <Text style={{ color: design.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1.4 }}>YOUR INTRODUCTION</Text>
          <Text style={{ color: design.ink, marginTop: 8, lineHeight: 22, opacity: regenerating === "aboutParagraph" ? 0.4 : 1 }}>
            {draft.note.body[0] || "Your introduction will appear here."}
          </Text>
        </View>;
      })()}
      {button(regenerating === "aboutParagraph" ? "Writing a new introduction…" : "Try another introduction",
        () => regenerate("aboutParagraph"), false, busy || !!regenerating)}
      {errorFor("intro")}

      {/* Listings imported via multi-hop crawl — or a soft ask for a better URL. */}
      <View style={{ marginTop: 26, padding: 18, borderRadius: 14, backgroundColor: "#171D22" }}>
        {importedListingCount>0 ? <View style={{flexDirection:"row",alignItems:"center",gap:12}}><Check size={20} color="#CDE1D9"/><Text style={{color:"#E8EFE9",fontSize:15,lineHeight:23}}>{importedListingCount} listings imported from your website.</Text></View> : <ListingSourceImporter initialUrl={url} onImported={count => { setImportedListingCount(count); setHasConnectedSource(true); }} />}
      </View>

      {/* Portrait — recommended and prominent, never blocking. */}
      <View style={{ marginTop: 26, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: draft.portraitUrl ? "#2E3A40" : "#C2A276",
        flexDirection: "row", alignItems: "center", gap: 14 }}>
        {draft.portraitUrl
          ? <PortraitImage uri={draft.portraitUrl} style={{ width: 64, height: 64, borderRadius: 32 }} contentFit="cover" />
          : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#2A3238", alignItems: "center", justifyContent: "center" }}>
            <ImageIcon size={24} color="#C2A276" /></View>}
        <View style={{ flex: 1 }}>
          <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>{draft.portraitUrl ? "Your portrait" : "Add your portrait"}</Text>
          <Text style={{ color: "#9AA4AA", marginTop: 2 }}>{draft.portraitUrl ? "Shown on your app’s first screen." : "Recommended — your app opens on your photo."}</Text>
          <Pressable accessibilityRole="button" onPress={selectPortrait} disabled={busy} hitSlop={6} style={{ marginTop: 8 }}>
            <Text style={{ color: "#C2A276", fontWeight: "600" }}>{draft.portraitUrl ? "Adjust or replace photo" : "Choose a photo"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Values we found but aren't sure about — prefilled, just confirm. */}
      {confirmList.length > 0 && <View style={{ marginTop: 26 }}>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>Please confirm</Text>
        <Text style={{ color: "#9AA4AA", marginTop: 4 }}>We found these — fix anything that’s wrong.</Text>
        {confirmList.map(item => <View key={`confirm-${item.field}`}>
          {input(`confirm-input-${item.field}`, CONFIRM_LABELS[item.field], readValue(item.field),
            value => setProfile(item.field.split(".")[1] as keyof Brand["realtor"], value),
            item.field === "realtor.email" ? "email-address" : item.field === "realtor.phone" ? "phone-pad" : "default")}
          {item.also.length ? <Text style={{ color: "#D6BA91", marginTop: 4 }}>Also found: {item.also.join(", ")}</Text> : null}
        </View>)}
      </View>}

      {/* Only essentials we couldn't find. The list is fixed when the draft is
          made, so an input never disappears while you type in it. */}
      {askFor.length > 0 && <View style={{ marginTop: 26 }}>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>Just a few more details</Text>
        <Text style={{ color: "#9AA4AA", marginTop: 4 }}>We couldn’t find these on your website.</Text>
        {askFor.includes("name") && input("ask-name", "Your name", draft.realtor.name, value => setProfile("name", value))}
        {askFor.includes("city") && input("ask-city", "City or region (e.g. Coeur d’Alene, ID)", draft.realtor.city, value => setProfile("city", value))}
        {(askFor.includes("phone") || askFor.includes("email")) && <Text key="ask-contact-hint" style={{ color: "#9AA4AA", marginTop: 12 }}>Your business contact details — this is how clients reach you from the app.</Text>}
        {askFor.includes("phone") && input("ask-phone", "Phone number — where would you like clients to call or text you?", draft.realtor.phone, value => setProfile("phone", value), "phone-pad")}
        {askFor.includes("email") && input("ask-email", "Email address — where would you like clients to email you?", draft.realtor.email, value => setProfile("email", value), "email-address")}
        {askFor.includes("heroLine") && input("ask-hero", "Opening line", draft.realtor.heroMessage, value => setProfile("heroMessage", value))}
      </View>}

      {/* Optional professional details — never block setup. */}
      <View style={{ marginTop: 26, borderRadius: 12, borderWidth: 1, borderColor: "#3A444B", padding: 14 }}>
        <Pressable accessibilityRole="button" onPress={() => setShowLicense(open => !open)} hitSlop={6}>
          <Text style={{ color: "#E6E9EA", fontSize: 15 }}>
            {showLicense ? "▾" : "▸"} Brokerage & license <Text style={{ color: "#9AA4AA" }}>(optional)</Text>
          </Text>
          {!showLicense && (draft.credentials.license.brokerage || draft.credentials.license.number) ? <Text style={{ color: "#8FD9B4", marginTop: 4 }}>
            ✓ {[draft.credentials.license.brokerage, draft.credentials.license.number, draft.credentials.license.state].filter(Boolean).join(" · ")}
          </Text> : null}
        </Pressable>
        {showLicense && <>
          {input("lic-brokerage", "Brokerage", draft.credentials.license.brokerage, value => setLicense("brokerage", value))}
          {input("lic-number", "License number", draft.credentials.license.number, value => setLicense("number", value))}
          {input("lic-state", "License state", draft.credentials.license.state, value => setLicense("state", value))}
          <Text style={{ color: "#9AA4AA", marginTop: 8 }}>Many states require these on advertising — you can add them any time.</Text>
        </>}
      </View>

      {errorFor("review")}
      {missingLabels.length > 0 && error?.place !== "review"
        ? <Text style={{ color: "#D6BA91", marginTop: 16 }}>Still needed: {missingLabels.join(", ")}</Text> : null}
      <PressableScale accessibilityRole="button" onPress={finish} disabled={busy || !!regenerating} haptic="medium" style={{ marginTop: 16 }}>
        <View style={{ minHeight: 58, borderRadius: 14, backgroundColor: missingLabels.length ? "#3D444C" : "#C2A276",
          alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
          <Text style={{ color: missingLabels.length ? "#C8D0D0" : "#172027", fontSize: 17, fontWeight: "700" }}>
            {busy ? "Publishing…" : isPublished ? "Publish Changes" : "Publish My App"}
          </Text>
        </View>
      </PressableScale>
    </>}
  </ScrollView>
  </View>;
}
