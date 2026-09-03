import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as ImagePicker from "expo-image-picker";
import { toPortableImages } from "@/lib/portableImage";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react-native";
import { generateText } from "@rork-ai/toolkit-sdk";
import { brand, dark, fonts } from "@/constants/colors";
import { useListings, type ManagedListing } from "@/contexts/ListingsContext";
import { useBrand } from "@/contexts/BrandContext";

type Tag = ManagedListing["tag"];
const TAGS: Tag[] = ["Off-market", "Quiet listing", "New", "Just reduced"];

export default function EditListing() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById, upsert, remove } = useListings();
  const { brand: b } = useBrand();
  const [polishing, setPolishing] = useState<boolean>(false);
  const [headlining, setHeadlining] = useState<boolean>(false);
  const original = useMemo(() => (id ? getById(id) : undefined), [id, getById]);

  const [draft, setDraft] = useState<ManagedListing | null>(original ?? null);

  useEffect(() => {
    if (!original) return;
    setDraft(original);
  }, [original]);

  if (!draft) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontFamily: fonts.serif, color: brand.textOnDarkMuted }}>Listing not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: fonts.sansSemi, color: brand.gold, letterSpacing: 1.5 }}>
            GO BACK
          </Text>
        </Pressable>
      </View>
    );
  }

  const set = <K extends keyof ManagedListing>(key: K, value: ManagedListing[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const save = () => {
    if (!draft) return;
    const cover = draft.images[0] ?? draft.image;
    upsert({ ...draft, image: cover });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const moveImage = (idx: number, dir: -1 | 1) => {
    const next = [...draft.images];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    set("images", next);
  };

  const removeImage = (idx: number) => {
    set("images", draft.images.filter((_, i) => i !== idx));
  };

  const setCover = (idx: number) => {
    if (idx === 0) return;
    const next = [...draft.images];
    const [it] = next.splice(idx, 1);
    next.unshift(it);
    set("images", next);
  };

  const addImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
      });
      if (res.canceled) return;
      const uris = res.assets.map((a) => a.uri);
      const portable = await toPortableImages(uris, 1400);
      set("images", [...draft.images, ...portable]);
    } catch (e) {
      console.log("[edit] picker error", e);
    }
  };

  const polishTake = async () => {
    if (!draft || polishing) return;
    setPolishing(true);
    try {
      const voiceSample = [b.note.opener, ...b.note.body, b.note.signoff].join("\n");
      const prompt = `You are ghost-writing in the voice of ${b.realtor.name}, a private luxury realtor in ${b.realtor.city}.\n\nHER VOICE — study the cadence, restraint, and warmth:\n"""\n${voiceSample}\n"""\n\nRewrite the following note about a property she's representing. Keep it short (2–3 sentences), specific, sensory, never salesy. No exclamation points. No real-estate clichés ("stunning", "must-see", "oasis"). Speak like she's leaning across a small table, telling a friend.\n\nProperty: ${draft.title} — ${draft.neighborhood}, ${draft.price}\nCurrent note:\n"""\n${draft.elizaTake || "(empty)"}\n"""\n\nReturn only the rewritten note. No quotes around it.`;
      const out = await generateText(prompt);
      const cleaned = out.replace(/^[\"'“”]+|[\"'“”]+$/g, "").trim();
      if (cleaned) set("elizaTake", cleaned);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.log("[edit] polish error", e);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPolishing(false);
    }
  };

  const suggestTitle = async () => {
    if (!draft || headlining) return;
    setHeadlining(true);
    try {
      const prompt = `Write a single elegant 2–5 word title for this private real-estate listing. No clichés, no "stunning", no exclamation. Editorial, restrained, evocative.\n\nNeighborhood: ${draft.neighborhood}\nPrice: ${draft.price}\nNote: ${draft.elizaTake}\nCurrent title: ${draft.title}\n\nReturn only the title.`;
      const out = await generateText(prompt);
      const cleaned = out.replace(/^[\"'“”]+|[\"'“”]+$/g, "").split("\n")[0].trim();
      if (cleaned) set("title", cleaned);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.log("[edit] title error", e);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setHeadlining(false);
    }
  };

  const confirmDelete = () => {
    const proceed = () => {
      remove(draft.id);
      router.back();
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Delete this listing?")) proceed();
      return;
    }
    Alert.alert("Delete listing", `"${draft.title}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: proceed },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={18} color={brand.ivory} strokeWidth={1.5} />
        </Pressable>
        <Text style={styles.topTitle}>EDIT</Text>
        <Pressable hitSlop={12} onPress={save} style={[styles.iconBtn, { backgroundColor: brand.ivory, borderColor: brand.ivory }]}>
          <Check size={16} color={dark.bg} strokeWidth={2} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        >
          {/* Images */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>GALLERY</Text>
            <Text style={styles.sectionHint}>
              First image is the cover. Tap the star to set, arrows to reorder.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 24 }}
              style={{ marginHorizontal: -24, paddingHorizontal: 24, marginTop: 14 }}
            >
              {draft.images.map((src, i) => (
                <View key={src + i} style={styles.imgCard}>
                  <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {i === 0 && (
                    <View style={styles.coverBadge}>
                      <Star size={10} color={dark.bg} strokeWidth={2} fill={brand.gold} />
                      <Text style={styles.coverBadgeText}>COVER</Text>
                    </View>
                  )}
                  <View style={styles.imgActions}>
                    <Pressable onPress={() => moveImage(i, -1)} style={styles.imgBtn} hitSlop={4}>
                      <ChevronLeft size={14} color={brand.ivory} strokeWidth={1.5} />
                    </Pressable>
                    <Pressable onPress={() => setCover(i)} style={styles.imgBtn} hitSlop={4}>
                      <Star size={14} color={brand.ivory} strokeWidth={1.5} />
                    </Pressable>
                    <Pressable onPress={() => moveImage(i, 1)} style={styles.imgBtn} hitSlop={4}>
                      <ChevronRight size={14} color={brand.ivory} strokeWidth={1.5} />
                    </Pressable>
                    <Pressable onPress={() => removeImage(i)} style={styles.imgBtn} hitSlop={4}>
                      <Trash2 size={14} color="#E8B7A6" strokeWidth={1.5} />
                    </Pressable>
                  </View>
                </View>
              ))}
              <Pressable onPress={addImage} style={[styles.imgCard, styles.imgAdd]}>
                <ImagePlus size={20} color={brand.gold} strokeWidth={1.5} />
                <Text style={styles.imgAddText}>ADD PHOTOS</Text>
              </Pressable>
            </ScrollView>
          </View>

          {/* Title + Neighborhood */}
          <View style={styles.section}>
            <View style={styles.fieldHeader}>
              <Text style={styles.label}>TITLE</Text>
              <Pressable onPress={suggestTitle} disabled={headlining} hitSlop={6} style={styles.aiChip}>
                {headlining ? (
                  <ActivityIndicator size="small" color={brand.goldDeep} />
                ) : (
                  <>
                    <Sparkles size={11} color={brand.goldDeep} strokeWidth={2} />
                    <Text style={styles.aiChipText}>SUGGEST</Text>
                  </>
                )}
              </Pressable>
            </View>
            <TextInput
              value={draft.title}
              onChangeText={(v) => set("title", v)}
              placeholder="Penthouse on the Park"
              placeholderTextColor="rgba(46,42,32,0.4)"
              style={[styles.input, { marginBottom: 18 }]}
            />
            <Field
              label="NEIGHBORHOOD"
              value={draft.neighborhood}
              onChange={(v) => set("neighborhood", v)}
              placeholder="Upper West Side"
            />
            <Field
              label="PRICE"
              value={draft.price}
              onChange={(v) => set("price", v)}
              placeholder="$12.4M"
            />
          </View>

          {/* Beds / baths / sqft */}
          <View style={styles.section}>
            <View style={styles.row3}>
              <Field
                small
                label="BEDS"
                value={String(draft.beds)}
                onChange={(v) => set("beds", Number(v.replace(/[^\d.]/g, "")) || 0)}
                placeholder="4"
                keyboardType="numeric"
              />
              <Field
                small
                label="BATHS"
                value={String(draft.baths)}
                onChange={(v) => set("baths", Number(v.replace(/[^\d.]/g, "")) || 0)}
                placeholder="4.5"
                keyboardType="numeric"
              />
              <Field
                small
                label="SQFT"
                value={draft.sqft}
                onChange={(v) => set("sqft", v)}
                placeholder="4,820 sqft"
              />
            </View>
          </View>

          {/* Tag */}
          <View style={styles.section}>
            <Text style={styles.label}>STATUS</Text>
            <View style={styles.tagRow}>
              {TAGS.map((t) => {
                const active = draft.tag === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => set("tag", t)}
                    style={[styles.tagChip, active && styles.tagChipActive]}
                  >
                    <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Take */}
          <View style={styles.section}>
            <View style={styles.fieldHeader}>
              <Text style={styles.label}>YOUR TAKE</Text>
              <Pressable onPress={polishTake} disabled={polishing} hitSlop={6} style={styles.aiChip}>
                {polishing ? (
                  <ActivityIndicator size="small" color={brand.goldDeep} />
                ) : (
                  <>
                    <Sparkles size={11} color={brand.goldDeep} strokeWidth={2} />
                    <Text style={styles.aiChipText}>POLISH IN YOUR VOICE</Text>
                  </>
                )}
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>What clients should know — in your voice. Tap polish to mirror your personal note's cadence.</Text>
            <TextInput
              value={draft.elizaTake}
              onChangeText={(v) => set("elizaTake", v)}
              multiline
              style={styles.textarea}
              placeholder="The light at five in the afternoon is something you have to feel in person..."
              placeholderTextColor="rgba(46,42,32,0.4)"
            />
          </View>

          {/* Visibility + delete */}
          <View style={styles.section}>
            <Pressable
              onPress={() => set("hidden", !draft.hidden)}
              style={styles.toggleRow}
            >
              <View>
                <Text style={styles.toggleTitle}>
                  {draft.hidden ? "Hidden from homepage" : "Visible on homepage"}
                </Text>
                <Text style={styles.toggleSub}>
                  {draft.hidden
                    ? "Only you can see this listing right now."
                    : "Currently shown in your curated set."}
                </Text>
              </View>
              <View style={[styles.switch, draft.hidden && styles.switchOff]}>
                <View style={[styles.switchKnob, draft.hidden && styles.switchKnobOff]} />
              </View>
            </Pressable>

            <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
              <Trash2 size={14} color="#A04A3C" strokeWidth={1.5} />
              <Text style={styles.deleteText}>Delete listing</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={save}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
        >
          <Check size={16} color={dark.bg} strokeWidth={2} />
          <Text style={styles.saveText}>Save changes</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  small,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
  small?: boolean;
}) {
  return (
    <View style={[styles.field, small && { flex: 1 }]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(46,42,32,0.4)"
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.nightDeep },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: dark.bg,
    borderBottomWidth: 1,
    borderBottomColor: brand.nightLine,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: brand.nightLine,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.nightHi,
  },
  topTitle: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 11, letterSpacing: 3 },
  section: {
    paddingHorizontal: 24,
    paddingTop: 26,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairline,
    paddingBottom: 26,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 6,
  },
  sectionHint: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  imgCard: {
    width: 160,
    height: 200,
    backgroundColor: dark.gold,
    overflow: "hidden",
  },
  coverBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: brand.ivory,
  },
  coverBadgeText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 8,
    letterSpacing: 1.5,
  },
  imgActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: "rgba(8,26,21,0.7)",
  },
  imgBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  imgAdd: {
    backgroundColor: brand.nightHi,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  imgAddText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2,
  },
  field: { marginBottom: 18 },
  row3: { flexDirection: "row", gap: 14 },
  label: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  aiChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.45)",
    backgroundColor: "rgba(244,239,230,0.6)",
  },
  aiChipText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  input: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairline,
  },
  textarea: {
    marginTop: 12,
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 110,
    padding: 14,
    backgroundColor: brand.night,
    borderWidth: 1,
    borderColor: brand.nightLine,
    textAlignVertical: "top",
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: brand.nightLine,
    backgroundColor: brand.night,
  },
  tagChipActive: { backgroundColor: dark.gold, borderColor: dark.gold },
  tagChipText: {
    fontFamily: fonts.sansMedium,
    color: brand.ivory,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  tagChipTextActive: { color: brand.ivory },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  toggleTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 16 },
  toggleSub: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 12, marginTop: 4 },
  switch: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: dark.gold,
    padding: 3,
    justifyContent: "center",
  },
  switchOff: { backgroundColor: brand.nightLine },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: brand.ivory,
    alignSelf: "flex-end",
  },
  switchKnobOff: { alignSelf: "flex-start" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(160,74,60,0.35)",
  },
  deleteText: { fontFamily: fonts.sansSemi, color: "#A04A3C", fontSize: 11, letterSpacing: 2 },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: dark.bg,
    borderTopWidth: 1,
    borderTopColor: brand.nightLine,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    backgroundColor: brand.ivory,
  },
  saveText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 12,
    letterSpacing: 2,
  },
});
