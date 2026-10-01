import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ArrowLeft, Check, FileText, ImageIcon, Link2, Users, X } from "lucide-react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBrand, type Brand } from "@/contexts/BrandContext";
import { PROFILE_FIELDS, RECOMMENDED_FIELDS, REQUIRED_FIELDS, requiredStatus } from "@/constants/sections";
import { toPortableImage } from "@/lib/portableImage";
import { useAuth } from "@/contexts/AuthContext";
import { CLIENT_LAYOUTS } from "@/constants/clientLayouts";
import { analyzeBuild, BUILDER_AUTH_MESSAGE, hasVerifiedBuilderAuth, loadBuild, markBuildComplete, regenerateBuildCopy, saveBuildSources, uploadBuildFile, type SavedBuild } from "@/lib/appBuilder/buildService";
import EmailCodeSignIn from "@/components/EmailCodeSignIn";
import { applyBuildDraft } from "@/lib/appBuilder/applyDraft";
import { resolveFacts, type BuildSource } from "@/lib/appBuilder/sourceModel";
import { sniffContactFile, parseCsvContacts, parseVCard } from "@/lib/parseContacts";
import { useClients } from "@/contexts/ClientsContext";
import PressableScale from "@/components/PressableScale";
import { checkSite, useSiteCheck } from "@/lib/siteCheck";

function ManualSetup({ onBack }: { onBack: () => void }) {
  const { brand, hydrated, saveBrand } = useBrand();
  const [draft, setDraft] = useState(brand);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useEffect(() => { if (!dirty) setDraft(brand); }, [brand, dirty]);
  const change = (mut: (b: Brand) => Brand) => { setDirty(true); setDraft(mut); };
  const identity = (key: keyof Brand["realtor"], value: string) =>
    change(b => ({ ...b, realtor: { ...b.realtor, [key]: value } }));
  const license = (key: "number" | "state" | "brokerage", value: string) =>
    change(b => ({ ...b, credentials: { ...b.credentials, license: { ...b.credentials.license, [key]: value } } }));
  const field = (label: string, value: string, onChangeText: (value: string) => void) =>
    <View key={label} style={{ gap: 8, marginTop: 12 }}>
      <Text style={{ color: "#CBD0D6" }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} autoCorrect={false}
        style={{ minHeight: 48, borderWidth: 1, borderColor: "#555C64", borderRadius: 8, padding: 12, color: "white" }} />
    </View>;
  const pick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.92 });
      if (result.canceled) return;
      const uri = await toPortableImage(result.assets[0].uri, 1600);
      change(b => ({ ...b, portraitUrl: uri }));
    } catch { Alert.alert("Couldn’t load image", "Please try another image."); }
  };
  const complete = requiredStatus(draft).complete;
  const save = async (continueToApp: boolean) => {
    if (saving || (continueToApp && !complete)) return;
    setSaving(true);
    try {
      await saveBrand(draft);
      setDirty(false);
      if (continueToApp) router.replace("/admin/ready");
      else Alert.alert("Progress saved", "Your setup will be here when you return.");
    } catch { Alert.alert("Couldn’t save", "Your edits are still here. Please try again."); }
    finally { setSaving(false); }
  };
  if (!hydrated) return null;
  return <ScrollView style={{ flex: 1, backgroundColor: "#101419" }} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}
        style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#555C64", alignItems: "center", justifyContent: "center" }}>
        <ArrowLeft size={18} color="white" strokeWidth={1.8} />
      </Pressable>
      <Text style={{ color: "#9AA4AA", fontSize: 12, letterSpacing: 1.4 }}>MANUAL SETUP</Text>
      <View style={{ width: 40 }} />
    </View>
    <Text style={{ color: "white", fontSize: 30 }}>Let’s create your app.</Text>
    <Text style={{ color: "#CBD0D6", marginTop: 12, lineHeight: 23 }}>Fill in the essentials below. Your portrait and license details are optional and can be added any time. Your sharing credentials become available after setup; you choose when to share them.</Text>
    {PROFILE_FIELDS.map((item, index) => <View key={item.id} style={{ marginTop: 24, padding: 18, borderRadius: 14, backgroundColor: "#20262D" }}>
      <Text style={{ color: "white", fontSize: 19 }}>{index + 1}. {item.label}{RECOMMENDED_FIELDS.includes(item) ? <Text style={{ color: "#9AA4AA", fontSize: 15 }}> (optional)</Text> : null}{item.met(draft) ? " ✓" : ""}</Text>
      {item.id === "name" && field("Full name", draft.realtor.name, v => identity("name", v))}
      {item.id === "portrait" && <Pressable onPress={pick} accessibilityRole="button" style={{ paddingVertical: 16 }}>
        {draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }} style={{ height: 180, borderRadius: 8 }} contentFit="contain" /> : null}
        <Text style={{ color: "#9ECFFF", marginTop: 12 }}>Choose portrait</Text>
      </Pressable>}
      {item.id === "city" && field("City or region", draft.realtor.city, v => identity("city", v))}
      {item.id === "contact" && <><Text style={{ color: "#CBD0D6", marginTop: 8 }}>Your business contact details — this is how clients reach you from the app.</Text>{field("Phone number — where would you like clients to call or text you?", draft.realtor.phone, v => identity("phone", v))}{field("Email address — where would you like clients to email you?", draft.realtor.email, v => identity("email", v))}</>}
      {item.id === "heroLine" && field("Opening line", draft.realtor.heroMessage || draft.realtor.tagline, v => identity("heroMessage", v))}
      {item.id === "license" && <>{field("Brokerage", draft.credentials.license.brokerage, v => license("brokerage", v))}{field("License number", draft.credentials.license.number, v => license("number", v))}{field("License state or jurisdiction", draft.credentials.license.state, v => license("state", v))}</>}
    </View>)}
    <Pressable accessibilityRole="button" disabled={!complete || saving} onPress={() => void save(true)}
      style={{ marginTop: 24, minHeight: 54, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: complete ? "#287D4D" : "#3D444C", opacity: saving ? 0.6 : 1 }}>
      <Text style={{ color: "white", fontSize: 17 }}>{saving ? "Saving…" : "Save & Continue"}</Text>
    </Pressable>
    <Pressable disabled={saving || !dirty} onPress={() => void save(false)} style={{ minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={{ color: "#CBD0D6" }}>Save progress for later</Text></Pressable>
  </ScrollView>;
}

type Phase = "collect" | "building" | "review";
type ErrorPlace = "sources" | "review" | "hero" | "intro";
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
  const { brand, saveBrand } = useBrand();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const authPanelY = useRef(0);
  const [url, setUrl] = useState("");
  const [sources, setSources] = useState<BuildSource[]>([]);
  const [result, setResult] = useState<SavedBuild | null>(null);
  const [draft, setDraft] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ place: ErrorPlace; message: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** null = still checking; false = need email/sign-in on this page; true = builder unlocked. */
  const [builderReady, setBuilderReady] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [verificationPending, setVerificationPending] = useState(false);
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
  /**
   * Which inputs the review asks for, fixed when the draft is created. Rendering
   * from live values made a field vanish after its first keystroke (it stopped
   * being "missing") and shifted the inputs after it, dropping focus.
   */
  const [askFor, setAskFor] = useState<AskId[]>([]);
  const [confirmList, setConfirmList] = useState<{ field: ConfirmField; also: string[] }[]>([]);
  const localImages = useRef<Record<string, string>>({});

  const phase: Phase = building ? "building" : result && draft && !editingSources ? "review" : "collect";
  const needsBuilderAuth = builderReady === false;

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

  const loadSavedBuild = useCallback(async () => {
    const saved = await loadBuild();
    if (!saved) return;
    setSources(saved.sources);
    const primary = saved.sources.find(source => source.kind === "url");
    if (primary) { setUrl(primary.uri); setPrimaryId(primary.id); }
    setResult(saved);
    if (saved.evidence.length) startReview(saved, applyBuildDraft(brand, resolveFacts(saved.evidence), saved.draft));
  }, [brand]);

  // Guest REALTOR (and any unverified session) must see email fields — never loadBuild
  // first, which only threw an orphan red "confirm email" with nowhere to type.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
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
  }, [loadSavedBuild]);

  const leaveBuild = useCallback(async () => {
    // Incomplete setup is forced onto this screen — escape by signing out to the portal.
    if (auth.realtorRecord?.client_code_enabled !== true) {
      await auth.logout();
      router.replace("/portal");
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/admin");
  }, [auth, router]);

  const focusAuthPanel = () => {
    setError(null);
    setAuthMessage(BUILDER_AUTH_MESSAGE);
    scrollRef.current?.scrollTo({ y: Math.max(0, authPanelY.current - 24), animated: true });
  };

  const submitBuilderAuth = () => void (async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const result = authMode === "signup"
        ? await auth.realtorSignup({ name: authName, email: authEmail, password: authPassword })
        : await auth.realtorLogin(authEmail, authPassword);
      if (!result.ok) {
        if (result.verificationRequired) {
          setVerificationPending(true);
          setAuthMessage(result.error ?? "Check your email to confirm your account, then sign in here.");
          return;
        }
        setAuthMessage(result.error ?? "Couldn’t complete sign-in. Please try again.");
        return;
      }
      setVerificationPending(false);
      setBuilderReady(true);
      setAuthMessage("You’re signed in. Continue building your app below.");
      setError(null);
      try { await loadSavedBuild(); } catch {}
    } catch {
      setAuthMessage("Couldn’t complete sign-in. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  })();

  const act = async (place: ErrorPlace, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await work(); }
    catch (e) {
      const message = e instanceof Error ? e.message : "Please try again.";
      // Auth gate: show fields, never an orphan red prompt with nowhere to type.
      if (message === BUILDER_AUTH_MESSAGE || message.includes("Sign in to save")) {
        setBuilderReady(false);
        setAuthMessage(BUILDER_AUTH_MESSAGE);
        setError(null);
        focusAuthPanel();
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
    if (builderReady === false) { focusAuthPanel(); return; }
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
    if (!current.some(source => source.kind !== "contacts")) throw new Error("Enter your website to get started, or add a document or image.");
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
    if (!draft) throw new Error("Build your app first.");
    // Same rule set the rest of the app uses — REQUIRED_FIELDS is the only source of truth.
    const missing = requiredStatus(draft).missing;
    if (missing.length) throw new Error(`Please add: ${missing.map(item => item.label.toLowerCase()).join(", ")}.`);
    await saveBrand(draft);
    await markBuildComplete();
    router.replace("/admin/ready");
  });
  const setProfile = (key: keyof Brand["realtor"], value: string) =>
    setDraft(current => current && ({ ...current, realtor: { ...current.realtor, [key]: value } }));
  const setLicense = (key: "number" | "state" | "brokerage", value: string) =>
    setDraft(current => current && ({ ...current, credentials: { ...current.credentials,
      license: { ...current.credentials.license, [key]: value } } }));
  const selectPortrait = () => void act("review", async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false });
    if (picked.canceled) return;
    const uri = await toPortableImage(picked.assets[0].uri, 1600);
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

  if (manual) return <ManualSetup onBack={() => setManual(false)} />;

  const sourceSummary = [
    primarySource ? primarySource.uri.replace(/^https:\/\//, "").replace(/\/$/, "") : websiteUri ? websiteUri.replace(/^https:\/\//, "").replace(/\/$/, "") : "",
    extraLinks.length ? `${extraLinks.length} more link${extraLinks.length > 1 ? "s" : ""}` : "",
    documents.length ? `${documents.length} document${documents.length > 1 ? "s" : ""}` : "",
    images.length ? `${images.length} image${images.length > 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(" · ");

  const authField = (label: string, value: string, onChange: (v: string) => void, opts?: { keyboard?: "default" | "email-address"; secure?: boolean; autoCap?: "none" | "words" }) =>
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: "#D7D8D3", marginBottom: 6 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} accessibilityLabel={label}
        keyboardType={opts?.keyboard ?? "default"} secureTextEntry={!!opts?.secure}
        autoCapitalize={opts?.autoCap ?? (opts?.keyboard === "email-address" ? "none" : "words")}
        autoCorrect={false} autoComplete={opts?.secure ? "password" : opts?.keyboard === "email-address" ? "email" : "name"}
        style={{ color: "white", borderColor: "#646C70", borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, minHeight: 48 }} />
    </View>;

  const builderAuthPanel = needsBuilderAuth ? (
    <View
      onLayout={e => { authPanelY.current = e.nativeEvent.layout.y; }}
      style={{ marginTop: 24, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#C2A276", backgroundColor: "rgba(194,162,118,0.10)" }}
    >
      <Text style={{ color: "#C2A276", fontSize: 12, fontWeight: "700", letterSpacing: 1.6 }}>ACCOUNT REQUIRED</Text>
      <Text style={{ color: "white", fontSize: 18, fontWeight: "600", marginTop: 6 }}>Confirm your realtor email</Text>
      <Text style={{ color: "#C8D0D0", marginTop: 8, lineHeight: 22 }}>
        Sign in or create your builder account to save your website import and build your app. Guest access codes bring you here for a tour — your email unlocks the builder.
      </Text>
      {authMode === "signup" && authField("Your name", authName, setAuthName, { autoCap: "words" })}
      {authField("Realtor email", authEmail, setAuthEmail, { keyboard: "email-address", autoCap: "none" })}
      {authField("Password", authPassword, setAuthPassword, { secure: true, autoCap: "none" })}
      <PressableScale accessibilityRole="button" onPress={submitBuilderAuth} disabled={authBusy} haptic="medium" style={{ marginTop: 16 }}>
        <View style={{ minHeight: 52, borderRadius: 12, backgroundColor: "#C2A276", alignItems: "center", justifyContent: "center", opacity: authBusy ? 0.6 : 1 }}>
          <Text style={{ color: "#172027", fontSize: 16, fontWeight: "700" }}>
            {authBusy ? "Please wait…" : authMode === "signup" ? "Create account & continue" : "Sign in & continue"}
          </Text>
        </View>
      </PressableScale>
      <Pressable accessibilityRole="button" onPress={() => { setAuthMode(m => m === "signup" ? "signin" : "signup"); setAuthMessage(""); }}
        hitSlop={8} style={{ marginTop: 14, minHeight: 44, justifyContent: "center" }}>
        <Text style={{ color: "#C2A276", textAlign: "center", fontWeight: "600" }}>
          {authMode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
        </Text>
      </Pressable>
      {(verificationPending || authMode === "signin") && !!authEmail.trim() && (
        <EmailCodeSignIn email={authEmail.trim()} confirmation={verificationPending || authMode === "signup"} />
      )}
      {!!authMessage && (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
          style={{ color: verificationPending || builderReady ? "#D6BA91" : "#FFBAA9", marginTop: 12, lineHeight: 20 }}>
          {authMessage}
        </Text>
      )}
    </View>
  ) : null;

  return <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: "#101419" }}
    contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 36 }}
    keyboardShouldPersistTaps="handled">
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => void leaveBuild()} hitSlop={12}
        style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#555C64", alignItems: "center", justifyContent: "center" }}>
        <ArrowLeft size={18} color="white" strokeWidth={1.8} />
      </Pressable>
      <Text style={{ color: "#9AA4AA", fontSize: 12, letterSpacing: 1.4 }}>APP BUILDER</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => void leaveBuild()} hitSlop={12}
        style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#555C64", alignItems: "center", justifyContent: "center" }}>
        <X size={18} color="white" strokeWidth={1.8} />
      </Pressable>
    </View>
    <Text style={{ color: "white", fontSize: 32, fontWeight: "600" }}>Build Your App</Text>
    {phase === "collect" && <Text style={{ color: "#C8D0D0", marginTop: 10, fontSize: 16, lineHeight: 24 }}>
      {needsBuilderAuth
        ? "Enter your website below, then confirm your realtor email so we can save and build your app."
        : "Start with your website. We’ll use it to gather most of the information needed to build your app."}
    </Text>}
    {!loaded && <Text style={{ color: "#C8D0D0", marginTop: 20 }}>Loading…</Text>}

    {/* After submitting, the inputs collapse to a one-line summary. */}
    {loaded && phase !== "collect" && <View style={{ marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: "#1A2127",
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

    {loaded && phase === "collect" && <>
      {/* Step 1 — the website is the starting point. */}
      <View style={{ marginTop: 30, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#C2A276",
        backgroundColor: "rgba(194,162,118,0.08)" }}>
        <Text style={{ color: "#C2A276", fontSize: 12, fontWeight: "700", letterSpacing: 1.6 }}>STEP 1</Text>
        <Text style={{ color: "white", fontSize: 20, fontWeight: "600", marginTop: 4 }}>Your website or profile link</Text>
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
      </View>

      {/* Optional supporting information — each item stays with its own control. */}
      <Text style={{ color: "white", fontSize: 17, fontWeight: "600", marginTop: 30 }}>Optional — add more information</Text>
      <Text style={{ color: "#9AA4AA", marginTop: 4 }}>Anything else that describes you or your business.</Text>
      <View style={{ marginTop: 12, gap: 10 }}>
        {optional(Link2, extraLinks.length ? "Add another link" : "Add link", () => setShowExtraUrl(true),
          <>
            {extraLinks.map(source => sourceLine(source))}
            {showExtraUrl && <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput value={extraUrl} onChangeText={setExtraUrl} placeholder="another-link.com" placeholderTextColor="#6F7A80"
                autoCapitalize="none" autoCorrect={false} keyboardType="url" autoFocus accessibilityLabel="Another link"
                onSubmitEditing={addUrl}
                style={{ flex: 1, color: "white", borderWidth: 1, borderColor: "#657079", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }} />
              <Pressable accessibilityRole="button" onPress={addUrl} disabled={busy}
                style={{ paddingHorizontal: 16, justifyContent: "center", borderRadius: 10, backgroundColor: "#C2A276" }}>
                <Text style={{ color: "#172027", fontWeight: "600" }}>Add</Text>
              </Pressable>
            </View>}
          </>)}
        {optional(FileText, documents.length ? "Add another document" : "Upload PDF, Word, or text", () => addFile("document"),
          <>{documents.map(source => sourceLine(source))}</>)}
        {optional(ImageIcon, images.length ? "Add another image" : "Upload image", () => addFile("image"),
          <>{images.map(source => sourceLine(source))}</>)}
        {optional(Users, contactCount ? "Import more contacts" : "Import contacts — CSV or vCard", addContacts,
          <>
            {contactCount > 0 && <Text style={{ color: "#8FD9B4", marginTop: 6 }}>✓ {contactCount} contacts added to your private roster</Text>}
            {pendingContacts && <View style={{ marginTop: 8 }}>
              <Text style={{ color: "#C8D0D0" }}>{pendingContacts.contacts.length} contacts found. Add them to your private roster?</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Pressable accessibilityRole="button" onPress={confirmContacts} disabled={busy}
                  style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: "#C2A276" }}>
                  <Text style={{ color: "#172027", textAlign: "center", fontWeight: "600" }}>Add contacts</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setPendingContacts(null)}
                  style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#657079" }}>
                  <Text style={{ color: "white", textAlign: "center" }}>Cancel</Text>
                </Pressable>
              </View>
            </View>}
          </>)}
      </View>

      {builderAuthPanel}
      {errorFor("sources")}
      <PressableScale accessibilityRole="button" onPress={analyze} disabled={busy || builderReady === null} haptic="medium" style={{ marginTop: 26 }}>
        <View style={{ minHeight: 60, borderRadius: 14, backgroundColor: "#C2A276", alignItems: "center", justifyContent: "center",
          opacity: (busy || builderReady === null) ? 0.6 : 1 }}>
          <Text style={{ color: "#172027", fontSize: 18, fontWeight: "700" }}>
            {needsBuilderAuth ? "Sign in above, then build" : "Let’s Build My App!"}
          </Text>
        </View>
      </PressableScale>
      {editingSources && result && draft && button("Back to my app", () => setEditingSources(false))}

      {/* Separate alternative path. */}
      <View style={{ marginTop: 40, paddingTop: 24, borderTopWidth: 1, borderTopColor: "#2A3238" }}>
        <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>Prefer to enter everything yourself?</Text>
        <Text style={{ color: "#9AA4AA", marginTop: 4 }}>Skip the website import and add your information manually.</Text>
        {button("Enter Details Manually", () => setManual(true))}
      </View>
    </>}

    {loaded && phase === "review" && result && draft && <>
      <Text style={{ color: "white", fontSize: 24, fontWeight: "600", marginTop: 28 }}>Here’s your app</Text>
      <Text style={{ color: "#C8D0D0", lineHeight: 22, marginTop: 8 }}>
        We used {CLIENT_LAYOUTS.find(layout => layout.id === draft.layoutId)?.name ?? "a starting layout"} for your style — you can switch later from Edit My App.
      </Text>

      {/* Live preview of the copy the realtor can regenerate. */}
      <View style={{ marginTop: 18, borderRadius: 16, overflow: "hidden", minHeight: 185,
        backgroundColor: draft.layoutId === "coastal-personal" ? "#F8F4EF" : "#29231F",
        flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, padding: 20 }}>
          <Text style={{ color: draft.layoutId === "coastal-personal" ? "#1D2526" : "#F7F1EA",
            fontSize: 23, fontFamily: "PlayfairDisplay_500Medium", opacity: regenerating === "heroMessage" ? 0.4 : 1 }} numberOfLines={4}>
            {draft.realtor.heroMessage || draft.realtor.tagline || draft.realtor.name}
          </Text>
          <Text style={{ color: "#B7956E", marginTop: 13 }}>{draft.realtor.name}{draft.realtor.city ? ` · ${draft.realtor.city}` : ""}</Text>
        </View>
        {draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }}
          style={{ width: "38%", height: 185 }} contentFit="cover" /> : null}
      </View>
      {button(regenerating === "heroMessage" ? "Writing a new opening line…" : "Try another opening line",
        () => regenerate("heroMessage"), false, busy || !!regenerating)}
      {errorFor("hero")}

      <View style={{ marginTop: 18, padding: 16, borderRadius: 14, backgroundColor: "#1A2127" }}>
        <Text style={{ color: "#C2A276", fontSize: 12, fontWeight: "700", letterSpacing: 1.4 }}>YOUR INTRODUCTION</Text>
        <Text style={{ color: "#E6E9EA", marginTop: 8, lineHeight: 22, opacity: regenerating === "aboutParagraph" ? 0.4 : 1 }}>
          {draft.note.body[0] || "Your introduction will appear here."}
        </Text>
      </View>
      {button(regenerating === "aboutParagraph" ? "Writing a new introduction…" : "Try another introduction",
        () => regenerate("aboutParagraph"), false, busy || !!regenerating)}
      {errorFor("intro")}

      {/* Portrait — recommended and prominent, never blocking. */}
      <View style={{ marginTop: 26, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: draft.portraitUrl ? "#2E3A40" : "#C2A276",
        flexDirection: "row", alignItems: "center", gap: 14 }}>
        {draft.portraitUrl
          ? <Image source={{ uri: draft.portraitUrl }} style={{ width: 64, height: 64, borderRadius: 32 }} contentFit="cover" />
          : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#2A3238", alignItems: "center", justifyContent: "center" }}>
            <ImageIcon size={24} color="#C2A276" /></View>}
        <View style={{ flex: 1 }}>
          <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>{draft.portraitUrl ? "Your portrait" : "Add your portrait"}</Text>
          <Text style={{ color: "#9AA4AA", marginTop: 2 }}>{draft.portraitUrl ? "Shown on your app’s first screen." : "Recommended — your app opens on your photo."}</Text>
          <Pressable accessibilityRole="button" onPress={selectPortrait} disabled={busy} hitSlop={6} style={{ marginTop: 8 }}>
            <Text style={{ color: "#C2A276", fontWeight: "600" }}>{draft.portraitUrl ? "Choose a different photo" : "Choose a photo"}</Text>
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
            {busy ? "Saving…" : "Complete Setup"}
          </Text>
        </View>
      </PressableScale>
    </>}
  </ScrollView>;
}
