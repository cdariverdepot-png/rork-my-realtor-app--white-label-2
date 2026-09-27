import React, { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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
  const localImages = useRef<Record<string, string>>({});
  const facts = result ? resolveFacts(result.evidence) : [];
  const questions = facts.filter(fact => fact.needsClarification);

  useEffect(() => {
    let alive = true;
    void loadBuild().then(saved => {
      if (!alive) return;
      if (saved) {
        setSources(saved.sources);
        setResult(saved);
        if (saved.evidence.length) setDraft(applyBuildDraft(brand, resolveFacts(saved.evidence), saved.draft));
      }
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : "Could not load your app build."); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const addSource = async (source: BuildSource): Promise<BuildSource[]> => {
    if (!auth.realtorId) throw new Error("Sign in to save your sources.");
    const next = [...sources, source];
    await saveBuildSources(auth.realtorId, next);
    setSources(next);
    setResult(null);
    setDraft(null);
    return next;
  };
  /** A link typed in the box counts even if "Add link" wasn't tapped. */
  const urlSource = (raw: string): BuildSource => {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (parsed.protocol !== "https:") throw new Error("Use a public HTTPS link.");
    return { id: randomUUID(), kind: "url", label: parsed.hostname, uri: parsed.toString(), status: "queued" };
  };
  const act = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); setActivity(""); }
  };
  const addUrl = () => void act(async () => {
    if (!url.trim()) throw new Error("Enter a website or profile link first.");
    await addSource(urlSource(url.trim()));
    setUrl("");
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
    const typed = url.trim();
    if (typed && !sources.some(source => source.kind === "url" && source.uri.replace(/\/$/, "") === urlSource(typed).uri.replace(/\/$/, ""))) {
      current = await addSource(urlSource(typed));
      setUrl("");
    }
    if (!current.some(source => source.kind !== "contacts")) throw new Error("Add a website, document, or image first.");
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

  if (manual) return <ManualSetup />;
  return <ScrollView style={{ flex: 1, backgroundColor: "#101419" }}
    contentContainerStyle={{ padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 36 }}
    keyboardShouldPersistTaps="handled">
    <Text style={{ color: "white", fontSize: 30, fontWeight: "600" }}>Build my app</Text>
    <Text style={{ color: "#C8D0D0", marginTop: 12, lineHeight: 23 }}>
      Add your website, bio, documents, and photos. We’ll use them together to create a draft app, then ask only about details we can’t confirm.
    </Text>
    {!loaded && <Text style={{ color: "#C8D0D0", marginTop: 20 }}>Loading your build…</Text>}
    {error ? <Text accessibilityRole="alert" style={{ color: "#FFBAA9", marginTop: 15 }}>{error}</Text> : null}
    {loaded && <>
      {field("Website or profile URL", url, setUrl)}
      {button("Add link", addUrl)}
      {button("Upload PDF, Word, or text", () => addFile("document"))}
      {button("Upload image", () => addFile("image"))}
      {button("Import contacts (CSV or vCard)", addContacts)}
      {pendingContacts && <View style={{ marginTop: 10 }}>
        <Text style={{ color: "#C8D0D0" }}>{pendingContacts.contacts.length} contacts found. Add them to your private roster?</Text>
        {button("Add contacts", confirmContacts, true)}
        {button("Cancel", () => setPendingContacts(null))}
      </View>}
      {contactCount > 0 && <Text style={{ color: "#C8D0D0", marginTop: 8 }}>{contactCount} contacts added to your private roster.</Text>}
      <Text style={{ color: "white", fontSize: 20, marginTop: 30 }}>Your sources</Text>
      {sources.length ? sources.map(source => <Text key={source.id} style={{ color: source.status === "failed" ? "#FFBAA9" : "#C8D0D0", marginTop: 8 }}>
        {source.status === "failed" ? "Couldn’t read" : "Added"} · {source.label}{source.error ? ` — ${source.error}` : ""}
      </Text>) : <Text style={{ color: "#B8C0C4", marginTop: 8 }}>Add at least one link or file to begin.</Text>}
      {button(busy ? "Working…" : "Build my draft app", analyze, true)}
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
      {button("Enter details myself", () => setManual(true))}
    </>}
  </ScrollView>;
}
