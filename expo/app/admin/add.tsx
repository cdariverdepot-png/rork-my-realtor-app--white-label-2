import React, { useMemo, useRef, useState } from "react";
import { backOr } from "@/lib/navIntent";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  FileText,
  Globe,
  Link2,
  Pencil,
  Sparkles,
  Lock,
  RefreshCw,
  ShieldAlert,
  Zap,
} from "lucide-react-native";
import { generateText } from "@rork-ai/toolkit-sdk";
import { dark, fonts } from "@/constants/colors";
import { useListings, type ManagedListing } from "@/contexts/ListingsContext";
import { useBrand } from "@/contexts/BrandContext";
import { inspectListingUrl, scrapeListing, type LinkProblem, type ScrapedListing } from "@/lib/scrapeListing";

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);

type StepKey = "import" | "details" | "photos" | "review";

const STEPS: { key: StepKey; label: string; Icon: typeof Link2 }[] = [
  { key: "import", label: "Import", Icon: Link2 },
  { key: "details", label: "Details", Icon: Pencil },
  { key: "photos", label: "Photos", Icon: Camera },
  { key: "review", label: "Review", Icon: Check },
];

const EXAMPLES: { label: string; Icon: typeof Globe }[] = [
  { label: "Brokerage Site", Icon: Globe },
  { label: "Property Page", Icon: Building2 },
];

function Stepper({ active }: { active: number }) {
  void active;
  return (
    <View style={styles.stepper}>
      {STEPS.map((s, i) => {
        const isActive = i === active;
        const isDone = i < active;
        const { Icon } = s;
        return (
          <React.Fragment key={s.key}>
            <View style={styles.stepCol}>
              <View
                style={[
                  styles.stepDot,
                  isActive && styles.stepDotActive,
                  isDone && styles.stepDotDone,
                ]}
              >
                <Icon
                  size={17}
                  color={isActive || isDone ? dark.gold : dark.textDim}
                  strokeWidth={1.7}
                />
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                {s.label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={styles.stepConnector}>
                {Array.from({ length: 5 }).map((_, d) => (
                  <View
                    key={d}
                    style={[styles.dash, i < active && styles.dashDone]}
                  />
                ))}
              </View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

export default function AddListing() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { upsert } = useListings();
  const { brand: b } = useBrand();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const { sourceUrl } = useLocalSearchParams<{ sourceUrl?: string }>();
  const [url, setUrl] = useState<string>(sourceUrl ?? "");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scraped, setScraped] = useState<ScrapedListing | null>(null);
  const [polishing, setPolishing] = useState<boolean>(false);
  const [polishedDesc, setPolishedDesc] = useState<string | null>(null);

  const activeStep = scraped ? 1 : 0;

  /**
   * Live check on the pasted link. Only shown once the realtor has typed enough
   * to be meaningful, so it advises rather than nags mid-keystroke.
   */
  const linkProblem: LinkProblem | null = useMemo(
    () => (url.trim().length > 12 ? inspectListingUrl(url) : null),
    [url]
  );
  const canImport = !busy && url.trim().length > 0 && !linkProblem;

  const fetchUrl = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const data = await scrapeListing(url);
      setScraped(data);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const polishDescription = async () => {
    if (!scraped || polishing) return;
    setPolishing(true);
    try {
      const voiceSample = [b.note.opener, ...b.note.body, b.note.signoff].join("\n");
      const prompt = `You are ghost-writing in the voice of ${b.realtor.name}, a private luxury realtor in ${b.realtor.city}.\n\nHER VOICE — study the cadence, restraint, warmth:\n"""\n${voiceSample}\n"""\n\nRewrite the raw listing copy below as a short personal note (2–3 sentences). Specific, sensory, never salesy. No exclamation points. No real-estate clichés ("stunning", "must-see", "oasis"). Speak like she's leaning across a small table, telling a friend.\n\nProperty: ${scraped.title} — ${scraped.price || "Price on request"}\nRaw copy:\n"""\n${scraped.description || "(no description provided)"}\n"""\n\nReturn only the rewritten note. No quotes around it.`;
      const out = await generateText(prompt);
      const cleaned = out.replace(/^[\"'""]+|[\"'""]+$/g, "").trim();
      if (cleaned) setPolishedDesc(cleaned);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.log("[add] polish error", e);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPolishing(false);
    }
  };

  const FALLBACK_COVER =
    "https://r2-pub.rork.com/generated-images/5fb2bc37-b818-417d-b0d2-13522cb9cd43.png";

  const save = () => {
    if (!scraped) return;
    const id = `${slug(scraped.title)}-${Date.now().toString(36).slice(-4)}`;
    const cover = scraped.images[0] ?? FALLBACK_COVER;
    const take = polishedDesc ?? (scraped.description.slice(0, 280) || "A note from me, coming soon.");
    const listing: ManagedListing = {
      id,
      title: scraped.title,
      neighborhood: scraped.neighborhood || "—",
      price: scraped.price || "Price on request",
      beds: scraped.beds,
      baths: scraped.baths,
      sqft: scraped.sqft || "—",
      image: cover,
      images: scraped.images.length ? scraped.images : [cover],
      tag: "New",
      elizaTake: take,
      hidden: false,
      sourceUrl: scraped.sourceUrl,
      description: scraped.description || undefined,
    };
    upsert(listing);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace(`/admin/edit/${id}`);
  };

  const addManually = () => {
    const id = `listing-${Date.now().toString(36).slice(-5)}`;
    const listing: ManagedListing = {
      id,
      title: "Untitled listing",
      neighborhood: "—",
      price: "Price on request",
      beds: 0,
      baths: 0,
      sqft: "—",
      image: FALLBACK_COVER,
      images: [FALLBACK_COVER],
      tag: "New",
      elizaTake: "A note from me, coming soon.",
      hidden: true,
    };
    upsert(listing);
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.replace(`/admin/edit/${id}`);
  };

  const focusInput = () => {
    inputRef.current?.focus();
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 140,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable hitSlop={12} onPress={() => backOr(router)} style={styles.backBtn}>
              <ArrowLeft size={18} color={dark.gold} strokeWidth={1.7} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Add a Listing</Text>
              <Text style={styles.headerSub}>Get your property in front of serious buyers.</Text>
            </View>
          </View>

          {/* Stepper */}
          <Stepper active={activeStep} />

          {/* Hero / Import card */}
          <View style={styles.card}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>STEP 1 OF 4</Text>
            </View>

            <View style={styles.heroRow}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>Import your listing</Text>
                <View style={styles.heroRule} />
                <Text style={styles.heroSub}>
                  Paste a public listing link from your brokerage, a property page, or anywhere a
                  listing lives online. We'll bring in the details and photos for you.
                </Text>
              </View>
              <View style={styles.heroArt}>
                <View style={styles.artWindow}>
                  <View style={styles.artDots}>
                    <View style={styles.artDot} />
                    <View style={styles.artDot} />
                    <View style={styles.artDot} />
                  </View>
                  <View style={[styles.artLine, { width: "70%" }]} />
                  <View style={[styles.artLine, { width: "52%" }]} />
                  <View style={[styles.artLine, { width: "60%" }]} />
                </View>
                <View style={styles.artPhoto}>
                  <Image
                    source={{ uri: "https://r2-pub.rork.com/generated-images/5fb2bc37-b818-417d-b0d2-13522cb9cd43.png" }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                </View>
                <View style={styles.artBadge}>
                  <Link2 size={20} color={dark.gold} strokeWidth={1.8} />
                </View>
              </View>
            </View>

            {/* Why the link has to be public. This isn't a warning — it's the
                reason the listing stays current on its own. */}
            <View style={styles.publicNote}>
              <View style={styles.publicNoteIcon}>
                <RefreshCw size={15} color={dark.gold} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.publicNoteTitle}>The link has to be public</Text>
                <Text style={styles.publicNoteBody}>
                  Your app re-checks this page on its own, so price drops and new photos reach
                  your clients without you lifting a finger. That only works if the page opens
                  without a login — no password, no agent portal, no MLS sign-in.
                </Text>
                <View style={styles.publicNoteTestRow}>
                  <Lock size={11} color={dark.textDim} strokeWidth={2} />
                  <Text style={styles.publicNoteTest}>
                    Quick test: open the link in a private browser window. If it loads, we can read it.
                  </Text>
                </View>
              </View>
            </View>

            {/* Input */}
            <Text style={styles.fieldLabel}>PASTE PROPERTY LINK</Text>
            <Pressable
              onPress={focusInput}
              style={[styles.inputRow, linkProblem && styles.inputRowFlagged]}
            >
              <Link2 size={17} color={dark.gold} strokeWidth={1.6} />
              <TextInput
                ref={inputRef}
                value={url}
                onChangeText={setUrl}
                placeholder="https://yourbrokerage.com/listing/..."
                placeholderTextColor={dark.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
                onSubmitEditing={fetchUrl}
                returnKeyType="go"
              />
            </Pressable>

            {linkProblem ? (
              <View style={styles.flagRow}>
                <ShieldAlert size={14} color={dark.gold} strokeWidth={1.9} />
                <Text style={styles.flagText}>{linkProblem.message}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={fetchUrl}
              disabled={!canImport}
              style={({ pressed }) => [
                styles.importBtn,
                !canImport && { opacity: 0.45 },
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={dark.bg} />
              ) : (
                <>
                  <Sparkles size={16} color={dark.bg} strokeWidth={2} />
                  <Text style={styles.importText}>Import Listing</Text>
                </>
              )}
            </Pressable>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.error}>{error}</Text>
                <Pressable
                  onPress={addManually}
                  style={({ pressed }) => [styles.errorAction, pressed && { opacity: 0.7 }]}
                  hitSlop={6}
                >
                  <Pencil size={12} color={dark.gold} strokeWidth={2} />
                  <Text style={styles.errorActionText}>ENTER THE DETAILS MYSELF INSTEAD</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Supported sources */}
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>WORKS WITH PUBLIC LINKS FROM</Text>
              <View style={styles.orLine} />
            </View>

            <View style={styles.sourceRow}>
              {EXAMPLES.map(({ label, Icon }) => (
                <View key={label} style={styles.sourceChip}>
                  <Icon size={16} color={dark.gold} strokeWidth={1.6} />
                  <Text style={styles.sourceText}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Manual fallback */}
            <Pressable
              onPress={addManually}
              style={({ pressed }) => [styles.manualBtn, pressed && { opacity: 0.7 }]}
            >
              <Pencil size={14} color={dark.textMuted} strokeWidth={1.7} />
              <Text style={styles.manualText}>No link? Add the details manually</Text>
            </Pressable>

            {/* Heavy lifting */}
            <View style={styles.liftCard}>
              <View style={styles.liftIcon}>
                <Zap size={20} color={dark.gold} strokeWidth={1.8} fill={dark.goldGlow} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.liftTitle}>We'll handle the heavy lifting</Text>
                <Text style={styles.liftBody}>
                  We'll automatically extract key details like title, neighborhood, beds, and more
                  so you don't have to.
                </Text>
              </View>
            </View>
          </View>

          {/* Confirm step (after scrape) */}
          {scraped && (
            <View style={styles.card}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>STEP 2 · CONFIRM</Text>
              </View>
              <Text style={styles.previewTitle}>{scraped.title}</Text>
              {scraped.price ? <Text style={styles.previewPrice}>{scraped.price}</Text> : null}

              {(scraped.beds > 0 || scraped.baths > 0 || scraped.sqft || scraped.neighborhood) && (
                <View style={styles.specRow}>
                  {scraped.neighborhood ? (
                    <View style={styles.specChip}>
                      <Text style={styles.specText}>{scraped.neighborhood}</Text>
                    </View>
                  ) : null}
                  {scraped.beds > 0 ? (
                    <View style={styles.specChip}>
                      <Text style={styles.specText}>{scraped.beds} bd</Text>
                    </View>
                  ) : null}
                  {scraped.baths > 0 ? (
                    <View style={styles.specChip}>
                      <Text style={styles.specText}>{scraped.baths} ba</Text>
                    </View>
                  ) : null}
                  {scraped.sqft ? (
                    <View style={styles.specChip}>
                      <Text style={styles.specText}>{scraped.sqft} sqft</Text>
                    </View>
                  ) : null}
                </View>
              )}
              {scraped.description ? (
                <Text style={styles.previewDesc} numberOfLines={4}>
                  {scraped.description}
                </Text>
              ) : null}

              <Pressable
                onPress={polishDescription}
                disabled={polishing}
                style={({ pressed }) => [
                  styles.polishBtn,
                  polishing && { opacity: 0.7 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {polishing ? (
                  <ActivityIndicator size="small" color={dark.gold} />
                ) : (
                  <>
                    <Sparkles size={12} color={dark.gold} strokeWidth={2} />
                    <Text style={styles.polishBtnText}>
                      {polishedDesc ? "POLISH AGAIN" : "POLISH IN YOUR VOICE"}
                    </Text>
                  </>
                )}
              </Pressable>

              {polishedDesc && (
                <View style={styles.polishedBox}>
                  <Text style={styles.polishedKicker}>YOUR VOICE</Text>
                  <Text style={styles.polishedBody}>{polishedDesc}</Text>
                </View>
              )}

              <Text style={styles.galleryLabel}>
                {scraped.images.length} {scraped.images.length === 1 ? "image" : "images"} found
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingRight: 22 }}
                style={{ marginHorizontal: -22, paddingHorizontal: 22 }}
              >
                {scraped.images.map((src, i) => (
                  <View key={src + i} style={styles.thumb}>
                    <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  </View>
                ))}
                {scraped.images.length === 0 && (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Text style={styles.thumbEmptyText}>No images found</Text>
                  </View>
                )}
              </ScrollView>

              <Pressable
                onPress={save}
                style={({ pressed }) => [
                  styles.importBtn,
                  { marginTop: 20 },
                  pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
                ]}
              >
                <Text style={styles.importText}>Create & edit details</Text>
                <ArrowRight size={16} color={dark.bg} strokeWidth={2} />
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: dark.borderGold,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: dark.bgSurface,
  },
  headerTitle: {
    fontFamily: fonts.serifBold,
    color: dark.text,
    fontSize: 30,
    letterSpacing: -0.6,
  },
  headerSub: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 13.5,
    marginTop: 3,
  },

  // Stepper
  stepper: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 22,
    paddingBottom: 26,
  },
  stepCol: { alignItems: "center", width: 64 },
  stepDot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: dark.bgSurface,
  },
  stepDotActive: {
    borderColor: dark.gold,
    backgroundColor: dark.goldSoft,
    shadowColor: dark.gold,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  stepDotDone: { borderColor: dark.borderGold },
  stepLabel: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 12,
    marginTop: 9,
  },
  stepLabelActive: { color: dark.gold, fontFamily: fonts.sansSemi },
  stepConnector: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 25,
  },
  dash: { width: 7, height: 1.5, borderRadius: 1, backgroundColor: dark.border },
  dashDone: { backgroundColor: dark.borderGold },

  // Card
  card: {
    marginHorizontal: 18,
    marginBottom: 18,
    padding: 22,
    borderRadius: 22,
    backgroundColor: dark.bgSurface,
    borderWidth: 1,
    borderColor: dark.border,
  },
  stepBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: dark.borderGold,
    backgroundColor: dark.goldSoft,
    marginBottom: 20,
  },
  stepBadgeText: {
    fontFamily: fonts.sansSemi,
    color: dark.gold,
    fontSize: 10.5,
    letterSpacing: 1.8,
  },

  heroRow: { flexDirection: "row", gap: 12 },
  heroCopy: { flex: 1.4 },
  heroTitle: {
    fontFamily: fonts.serifBold,
    color: dark.text,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.8,
  },
  heroRule: {
    width: 36,
    height: 2,
    borderRadius: 1,
    backgroundColor: dark.gold,
    marginVertical: 16,
  },
  heroSub: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 13.5,
    lineHeight: 21,
  },
  heroArt: {
    flex: 1,
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
  },
  artWindow: {
    position: "absolute",
    top: 6,
    right: 0,
    width: 120,
    height: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: dark.borderGoldSoft,
    backgroundColor: dark.bg,
    padding: 11,
    gap: 7,
  },
  artDots: { flexDirection: "row", gap: 5, marginBottom: 4 },
  artDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: dark.borderGold },
  artLine: { height: 5, borderRadius: 3, backgroundColor: dark.border },
  artPhoto: {
    position: "absolute",
    top: 44,
    left: 6,
    width: 104,
    height: 104,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: dark.borderGoldSoft,
    overflow: "hidden",
    backgroundColor: dark.bgCard,
  },
  artBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: dark.borderGold,
    backgroundColor: dark.bg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: dark.gold,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },

  fieldLabel: {
    fontFamily: fonts.sansSemi,
    color: dark.gold,
    fontSize: 11,
    letterSpacing: 1.6,
    marginTop: 26,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.borderGoldSoft,
    backgroundColor: dark.bg,
  },
  inputRowFlagged: { borderColor: dark.gold },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    color: dark.text,
    fontSize: 15,
    padding: 0,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 14,
    height: 56,
    borderRadius: 14,
    backgroundColor: dark.gold,
    shadowColor: dark.gold,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  importText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  error: {
    fontFamily: fonts.sans,
    color: dark.red,
    fontSize: 12.5,
    lineHeight: 18,
  },
  errorBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(190,92,80,0.35)",
    backgroundColor: "rgba(190,92,80,0.08)",
    gap: 10,
  },
  errorAction: { flexDirection: "row", alignItems: "center", gap: 7 },
  errorActionText: {
    fontFamily: fonts.sansSemi,
    color: dark.gold,
    fontSize: 10,
    letterSpacing: 1.3,
  },

  publicNote: {
    flexDirection: "row",
    gap: 13,
    marginTop: 22,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.borderGoldSoft,
    backgroundColor: "rgba(198,161,91,0.06)",
  },
  publicNoteIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: dark.borderGoldSoft,
    backgroundColor: "rgba(198,161,91,0.1)",
  },
  publicNoteTitle: {
    fontFamily: fonts.sansSemi,
    color: dark.text,
    fontSize: 13.5,
    letterSpacing: 0.1,
    marginBottom: 5,
  },
  publicNoteBody: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 12.5,
    lineHeight: 19,
  },
  publicNoteTestRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(198,161,91,0.16)",
  },
  publicNoteTest: {
    flex: 1,
    fontFamily: fonts.sans,
    color: dark.textDim,
    fontSize: 11.5,
    lineHeight: 17,
  },

  flagRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
  },
  flagText: {
    flex: 1,
    fontFamily: fonts.sans,
    color: dark.gold,
    fontSize: 12,
    lineHeight: 18,
  },

  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 28,
    marginBottom: 18,
  },
  orLine: { flex: 1, height: 1, backgroundColor: dark.border },
  orText: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10.5,
    letterSpacing: 1.8,
  },
  sourceRow: { flexDirection: "row", gap: 10 },
  sourceChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.bg,
    paddingHorizontal: 6,
  },
  sourceText: {
    fontFamily: fonts.sansMedium,
    color: dark.text,
    fontSize: 12,
  },
  manualBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
  },
  manualText: {
    fontFamily: fonts.sansMedium,
    color: dark.textMuted,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  specRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  specChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.bg,
  },
  specText: {
    fontFamily: fonts.sansMedium,
    color: dark.textMuted,
    fontSize: 12,
  },

  liftCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 22,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: dark.borderGoldSoft,
    backgroundColor: dark.goldSoft,
  },
  liftIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: dark.borderGold,
    backgroundColor: dark.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  liftTitle: {
    fontFamily: fonts.sansSemi,
    color: dark.text,
    fontSize: 16,
    marginBottom: 6,
  },
  liftBody: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },

  // Confirm preview
  previewTitle: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  previewPrice: {
    fontFamily: fonts.serif,
    color: dark.gold,
    fontSize: 18,
    marginBottom: 12,
  },
  previewDesc: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  polishBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: dark.borderGold,
    backgroundColor: dark.goldSoft,
    marginBottom: 16,
  },
  polishBtnText: {
    fontFamily: fonts.sansSemi,
    color: dark.gold,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  polishedBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: dark.bg,
    borderWidth: 1,
    borderColor: dark.border,
    marginBottom: 18,
  },
  polishedKicker: {
    fontFamily: fonts.sansMedium,
    color: dark.gold,
    fontSize: 9,
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  polishedBody: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 14,
    lineHeight: 22,
  },
  galleryLabel: {
    fontFamily: fonts.sansMedium,
    color: dark.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 10,
  },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: dark.bgCard,
    borderWidth: 1,
    borderColor: dark.border,
    overflow: "hidden",
  },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  thumbEmptyText: { fontFamily: fonts.sans, color: dark.textMuted, fontSize: 11 },
});
