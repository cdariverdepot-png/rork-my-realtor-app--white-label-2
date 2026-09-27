import React, { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Check, FileText, ImageIcon, Link2, Users } from "lucide-react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBrand, type Brand } from "@/contexts/BrandContext";
import { REQUIRED_FIELDS, requiredStatus } from "@/constants/sections";
import { toPortableImage } from "@/lib/portableImage";
import { useAuth } from "@/contexts/AuthContext";
import { CLIENT_LAYOUTS } from "@/constants/clientLayouts";
import { analyzeBuild, loadBuild, markBuildComplete, regenerateBuildCopy, saveBuildSources, uploadBuildFile, type SavedBuild } from "@/lib/appBuilder/buildService";
import { applyBuildDraft } from "@/lib/appBuilder/applyDraft";
import { resolveFacts, type BuildSource } from "@/lib/appBuilder/sourceModel";
import { sniffContactFile, parseCsvContacts, parseVCard } from "@/lib/parseContacts";
import { useClients } from "@/contexts/ClientsContext";

function ManualSetup() {
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
  return <ScrollView style={{ flex: 1, backgroundColor: "#101419" }} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
    <Text style={{ color: "white", fontSize: 30 }}>Let’s create your app.</Text>
    <Text style={{ color: "#CBD0D6", marginTop: 12, lineHeight: 23 }}>Complete these six sections. Your sharing credentials become available after setup; you choose when to share them.</Text>
    {REQUIRED_FIELDS.map((item, index) => <View key={item.id} style={{ marginTop: 24, padding: 18, borderRadius: 14, backgroundColor: "#20262D" }}>
      <Text style={{ color: "white", fontSize: 19 }}>{index + 1}. {item.label}{item.met(draft) ? " ✓" : ""}</Text>
      {item.id === "name" && field("Full name", draft.realtor.name, v => identity("name", v))}
      {item.id === "portrait" && <Pressable onPress={pick} accessibilityRole="button" style={{ paddingVertical: 16 }}>
        {draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }} style={{ height: 180, borderRadius: 8 }} contentFit="contain" /> : null}
        <Text style={{ color: "#9ECFFF", marginTop: 12 }}>Choose portrait</Text>
      </Pressable>}
      {item.id === "city" && field("City or region", draft.realtor.city, v => identity("city", v))}
      {item.id === "contact" && <>{field("Phone", draft.realtor.phone, v => identity("phone", v))}{field("Email", draft.realtor.email, v => identity("email", v))}<Text style={{ color: "#CBD0D6", marginTop: 8 }}>Provide at least one contact method.</Text></>}
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

export default function InitialRealtorSetup() {
  const auth = useAuth();
  const { importMany } = useClients();
  const { brand, saveBrand } = useBrand();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState("");
  const [sources, setSources] = useState<BuildSource[]>([]);
  const [result, setResult] = useState<SavedBuild | null>(null);
  const [draft, setDraft] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [contactCount, setContactCount] = useState(0);
  const [pendingContacts, setPendingContacts] = useState<{ contacts: ReturnType<typeof parseCsvContacts>; format: "csv" | "vcard" } | null>(null);
  const [activity, setActivity] = useState("");
  /** The website in the main field, once saved as a source. */
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [urlFocused, setUrlFocused] = useState(false);
  const [extraUrl, setExtraUrl] = useState("");
  const [showExtraUrl, setShowExtraUrl] = useState(false);
  const localImages = useRef<Record<string, string>>({});
  const facts = result ? resolveFacts(result.evidence) : [];
  const questions = facts.filter(fact => fact.needsClarification);

  useEffect(() => {
    let alive = true;
    void loadBuild().then(saved => {
      if (!alive) return;
      if (saved) {
        setSources(saved.sources);
        const primary = saved.sources.find(source => source.kind === "url");
        if (primary) { setUrl(primary.uri); setPrimaryId(primary.id); }
        setResult(saved);
        if (saved.evidence.length) setDraft(applyBuildDraft(brand, resolveFacts(saved.evidence), saved.draft));
      }
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : "Could not load your app build."); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

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
  const websiteState: "empty" | "valid" | "invalid" = !url.trim() ? "empty" : websiteUri ? "valid" : "invalid";
  const primarySource = sources.find(source => source.id === primaryId) ?? null;
  const extraLinks = sources.filter(source => source.kind === "url" && source.id !== primaryId);
  const documents = sources.filter(source => source.kind === "document");
  const images = sources.filter(source => source.kind === "image");

  const act = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); setActivity(""); }
  };
  const addUrl = () => void act(async () => {
    const uri = normalizeUrl(extraUrl);
    if (!uri) throw new Error("That link doesn't look right. Check it and try again.");
    await addSource(urlSource(uri));
    setExtraUrl("");
    setShowExtraUrl(false);
  });
  const addFile = (kind: "document" | "image") => void act(async () => {
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
  const analyze = () => void act(async () => {
    let current = sources;
    if (url.trim() && !websiteUri) throw new Error("Check your website address, then try again.");
    // Lock in the website from the main field, replacing an older one if it changed.
    if (websiteUri && primarySource?.uri !== websiteUri) {
      const fresh = urlSource(websiteUri);
      current = await saveSources([fresh, ...sources.filter(source => source.id !== primaryId)]);
      setPrimaryId(fresh.id);
    }
    if (!current.some(source => source.kind !== "contacts")) throw new Error("Enter your website to get started, or add a document or image.");
    setActivity("Reading your sources and building a profile…");
    const saved = await analyzeBuild();
    setSources(saved.sources);
    setResult(saved);
    const next = applyBuildDraft(brand, resolveFacts(saved.evidence), saved.draft);
    const portraitUri = saved.draft.portraitSourceId && localImages.current[saved.draft.portraitSourceId];
    if (portraitUri) next.portraitUrl = await toPortableImage(portraitUri, 1600);
    setDraft(next);
    setActivity("");
  });
  const addContacts = () => void act(async () => {
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
  const confirmContacts = () => void act(async () => {
    if (!pendingContacts) return;
    const summary = importMany(pendingContacts.contacts, pendingContacts.format);
    setContactCount(count => count + summary.added + summary.merged);
    setPendingContacts(null);
  });
  const regenerate = (target: "heroMessage" | "aboutParagraph") => void act(async () => {
    setActivity("Writing another version…");
    const saved = await regenerateBuildCopy(target);
    setResult(saved);
    setDraft(current => current && (target === "heroMessage"
      ? { ...current, realtor: { ...current.realtor, heroMessage: saved.draft.heroMessage || current.realtor.heroMessage } }
      : { ...current, note: { ...current.note, body: [saved.draft.aboutParagraph || current.note.body[0] || ""] } }));
    setActivity("");
  });
  const finish = () => void act(async () => {
    if (!draft || !requiredStatus(draft).complete) {
      throw new Error("Please complete the essential details before finishing.");
    }
    await saveBrand(draft);
    await markBuildComplete();
    router.replace("/admin/ready");
  });
  const field = (label: string, value: string, change: (value: string) => void) =>
    <View style={{ marginTop: 12 }}><Text style={{ color: "#D7D8D3", marginBottom: 6 }}>{label}</Text>
      <TextInput value={value} onChangeText={change} accessibilityLabel={label}
        style={{ color: "white", borderColor: "#646C70", borderWidth: 1, borderRadius: 10, padding: 12 }} /></View>;
  const setProfile = (key: keyof Brand["realtor"], value: string) =>
    setDraft(current => current && ({ ...current, realtor: { ...current.realtor, [key]: value } }));
  const setLicense = (key: "number" | "state" | "brokerage", value: string) =>
    setDraft(current => current && ({ ...current, credentials: { ...current.credentials,
      license: { ...current.credentials.license, [key]: value } } }));
  const selectPortrait = () => void act(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false });
    if (picked.canceled) return;
    const uri = await toPortableImage(picked.assets[0].uri, 1600);
    setDraft(current => current && ({ ...current, portraitUrl: uri }));
  });
  const button = (label: string, onPress: () => void, primary = false) =>
    <Pressable accessibilityRole="button" onPress={onPress} disabled={busy}
      style={{ padding: 14, borderRadius: 11, borderWidth: 1, borderColor: primary ? "#C2A276" : "#657079",
        backgroundColor: primary ? "#C2A276" : "transparent", marginTop: 10 }}>
      <Text style={{ color: primary ? "#172027" : "white", textAlign: "center", fontWeight: "600" }}>{label}</Text>
    </Pressable>;

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

  if (manual) return <ManualSetup />;
  return <ScrollView style={{ flex: 1, backgroundColor: "#101419" }}
    contentContainerStyle={{ padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 36 }}
    keyboardShouldPersistTaps="handled">
    <Text style={{ color: "white", fontSize: 32, fontWeight: "600" }}>Build Your App</Text>
    <Text style={{ color: "#C8D0D0", marginTop: 10, fontSize: 16, lineHeight: 24 }}>
      Start with your website. We’ll use it to gather most of the information needed to build your app.
    </Text>
    {!loaded && <Text style={{ color: "#C8D0D0", marginTop: 20 }}>Loading…</Text>}
    {loaded && <>
      {/* Step 1 — the website is the starting point. */}
      <View style={{ marginTop: 30, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#C2A276",
        backgroundColor: "rgba(194,162,118,0.08)" }}>
        <Text style={{ color: "#C2A276", fontSize: 12, fontWeight: "700", letterSpacing: 1.6 }}>STEP 1</Text>
        <Text style={{ color: "white", fontSize: 20, fontWeight: "600", marginTop: 4 }}>Your website or profile link</Text>
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1.5,
          borderColor: websiteState === "valid" ? "#3FB37F" : websiteState === "invalid" && !urlFocused ? "#FF9C85" : "#7B858C",
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

      {error ? <Text accessibilityRole="alert" style={{ color: "#FFBAA9", marginTop: 20 }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={analyze} disabled={busy}
        style={({ pressed }) => ({ marginTop: 26, minHeight: 60, borderRadius: 14, backgroundColor: "#C2A276",
          alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : pressed ? 0.85 : 1 })}>
        <Text style={{ color: "#172027", fontSize: 18, fontWeight: "700" }}>{busy && activity ? "Building…" : "Let’s Build My App!"}</Text>
      </Pressable>
      {busy && activity ? <Text accessibilityLiveRegion="polite" style={{ color: "#C8D0D0", marginTop: 10 }}>{activity}</Text> : null}
      {result && draft && <>
        <Text style={{ color: "white", fontSize: 24, marginTop: 32 }}>We built your app</Text>
        <Text style={{ color: "#C8D0D0", lineHeight: 22, marginTop: 8 }}>
          {result.draft.layoutId ? "We chose" : "We started with"} {CLIENT_LAYOUTS.find(layout => layout.id === draft.layoutId)?.name ?? "a starting layout"} for your style. You can switch layouts from Edit My App after setup.
        </Text>
        <View style={{ marginTop: 18, borderRadius: 16, overflow: "hidden", minHeight: 185,
          backgroundColor: draft.layoutId === "coastal-personal" ? "#F8F4EF" : "#29231F",
          flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, padding: 20 }}>
            <Text style={{ color: draft.layoutId === "coastal-personal" ? "#1D2526" : "#F7F1EA",
              fontSize: 23, fontFamily: "PlayfairDisplay_500Medium" }} numberOfLines={3}>
              {draft.realtor.heroMessage || draft.realtor.tagline || draft.realtor.name}
            </Text>
            <Text style={{ color: "#B7956E", marginTop: 13 }}>{draft.realtor.name}</Text>
          </View>
          {draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }}
            style={{ width: "38%", height: 185 }} contentFit="cover" /> : null}
        </View>
        {button("Try another opening line", () => regenerate("heroMessage"))}
        {button("Try another introduction", () => regenerate("aboutParagraph"))}
        {questions.length ? <View style={{ marginTop: 18 }}>
          <Text style={{ color: "white", fontSize: 18 }}>Please confirm</Text>
          {questions.map(fact => <View key={fact.field}>
            {field(fact.field.replace(/\./g, " · "), fact.field.startsWith("credentials.license.")
              ? draft.credentials.license[fact.field.split(".")[2] as "number" | "state" | "brokerage"]
              : fact.field === "portraitUrl" ? draft.portraitUrl
              : draft.realtor[fact.field.split(".")[1] as keyof Brand["realtor"]] as string,
              value => {
                if (fact.field.startsWith("credentials.license.")) setLicense(fact.field.split(".")[2] as "number" | "state" | "brokerage", value);
                else if (fact.field === "portraitUrl") setDraft(current => current && ({ ...current, portraitUrl: value }));
                else setProfile(fact.field.split(".")[1] as keyof Brand["realtor"], value);
              })}
            {fact.conflictingValues.length ? <Text style={{ color: "#D6BA91" }}>Also found: {fact.conflictingValues.join(", ")}</Text> : null}
          </View>)}
        </View> : null}
        {!requiredStatus(draft).complete && <View style={{ marginTop: 20 }}>
          <Text style={{ color: "white", fontSize: 18 }}>A few essentials are missing</Text>
          {!draft.realtor.name && field("Your name", draft.realtor.name, value => setProfile("name", value))}
          {!draft.realtor.city && field("City or region", draft.realtor.city, value => setProfile("city", value))}
          {!draft.realtor.phone && !draft.realtor.email && field("Phone", draft.realtor.phone, value => setProfile("phone", value))}
          {!draft.realtor.heroMessage && !draft.realtor.tagline && field("Opening line", draft.realtor.heroMessage, value => setProfile("heroMessage", value))}
          {!draft.credentials.license.brokerage && field("Brokerage", draft.credentials.license.brokerage, value => setLicense("brokerage", value))}
          {!draft.credentials.license.number && field("License number", draft.credentials.license.number, value => setLicense("number", value))}
          {!draft.credentials.license.state && field("License state", draft.credentials.license.state, value => setLicense("state", value))}
          {!draft.portraitUrl && button("Choose your portrait", selectPortrait)}
        </View>}
        {button("Complete setup", finish, true)}
      </>}
      {/* Separate alternative path. */}
      <View style={{ marginTop: 40, paddingTop: 24, borderTopWidth: 1, borderTopColor: "#2A3238" }}>
        <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>Prefer to enter everything yourself?</Text>
        <Text style={{ color: "#9AA4AA", marginTop: 4 }}>Skip the website import and add your information manually.</Text>
        {button("Enter Details Manually", () => setManual(true))}
      </View>
    </>}
  </ScrollView>;
}
