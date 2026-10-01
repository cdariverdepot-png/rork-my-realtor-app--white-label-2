import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight, Move, X } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { THEME_CAROUSEL_ORDER, themeCandidate, themeDesign } from "@/constants/themeDesigns";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";
import FanCarousel from "./FanCarousel";
import ThemePreviewModal from "./ThemePreviewModal";
import ThemeFace, { themeCardHeight } from "./ThemeFace";
import PortraitPositioner from "./PortraitPositioner";
import { Image } from "expo-image";
import { THEME_REFERENCES } from "@/constants/themeReferences";
import { themePreview } from "@/constants/themeSamples";
import { withSamplePortrait } from "@/constants/themeSamplePortraits";

const tick = () => { if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {}); };

/**
 * Theme picker built on FanCarousel. `compact` is the Studio Themes editor:
 * one phone screen — fan + name/index + a single Preview / Use-or-Save row.
 * Demo / showcase keep the fuller chrome. FanCarousel gesture system is unchanged.
 */
export default function ThemeCarousel({ draft, listings, onChoose, demo = false, compact = false, onPersist }: {
  draft: Brand; listings: ManagedListing[]; onChoose: (next: Brand) => void; demo?: boolean;
  /** Studio Themes: no wasted chrome, fits typical phone height without scrolling. */
  compact?: boolean;
  /** When set, "Use this theme" also persists (choose + save in one tap). */
  onPersist?: (next: Brand) => void | Promise<void>;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const [initialIndex] = useState(() => draft.themeChosen && draft.layoutId
    ? Math.max(0, THEME_CAROUSEL_ORDER.indexOf(draft.layoutId)) : 0);
  const [index, setIndex] = useState(initialIndex);
  const stepRef = useRef<((delta: number) => void) | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [positioning, setPositioning] = useState(false);
  const [contentMode, setContentMode] = useState<"auto" | "sample" | "profile">("sample");
  const [persisting, setPersisting] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const count = THEME_CAROUSEL_ORDER.length;
  // Arrows and the comparison view move the same fan the finger does.
  const step = (delta: number) => stepRef.current?.(delta);
  const selectedId = THEME_CAROUSEL_ORDER[index];
  const candidate = themeCandidate(draft, selectedId);
  // Stable across parent re-renders so expanded preview / comparison do not remount portraits.
  const preview = useMemo(
    () => withSamplePortrait(themePreview(draft, listings, selectedId, demo, contentMode)),
    [draft, listings, selectedId, demo, contentMode],
  );
  const d = themeDesign(selectedId);
  // Compact: size the fan from width and remaining phone height so one screen fits
  // (top nav + fan + name/index + action row) with open air above/below the fan.
  const scale = compact
    ? (() => {
        const byWidth = Math.min(0.62, Math.max(0.46, containerWidth / 700));
        // Reserve ~110 top nav, ~100 action+home, ~70 name/chips, ~48 open air.
        const budget = Math.max(320, windowHeight - insets.top - insets.bottom - 330);
        const byHeight = budget / (390 * (844 / 390) + 12 * 3 + 12);
        return Math.min(byWidth, Math.max(0.42, byHeight));
      })()
    : Math.min(0.58, Math.max(0.42, containerWidth / 760));
  const cardWidth = 390 * scale;
  const gap = containerWidth > 650 ? Math.min(95, containerWidth / 10) : 46;
  // Faces render once per content change; dragging only moves them.
  const cards = useMemo(() => THEME_CAROUSEL_ORDER.map(id => {
    const face = withSamplePortrait(themePreview(draft, listings, id, demo, contentMode));
    return <ThemeFace key={id} id={id} brand={face.brand} listings={face.listings} portraitSource={face.portraitSource} width={cardWidth} radius={24} />;
  }), [draft, listings, demo, contentMode, cardWidth]);
  const heights = useMemo(() => THEME_CAROUSEL_ORDER.map(id => themeCardHeight(id, cardWidth)), [cardWidth]);
  const comparisonWidth = Math.min(390, Math.max(160, (windowWidth - 44) / 2));
  const reference = THEME_REFERENCES[selectedId];
  const canPosition = !demo && !preview.sample && !!draft.portraitUrl?.trim();
  const alreadyChosen = draft.layoutId === selectedId && draft.themeChosen;

  const openPreview = () => { tick(); scrollY.setValue(0); setExpanded(true); };

  const useTheme = async () => {
    if (persisting) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Persist path owns draft+save so a failed save can be retried from this same row.
    if (onPersist) {
      setPersisting(true);
      try { await onPersist(candidate); }
      finally { setPersisting(false); }
      return;
    }
    onChoose(candidate);
  };

  const primaryLabel = demo
    ? "Select in showcase"
    : persisting
      ? "Saving…"
      : alreadyChosen && onPersist
        ? "Saved · ready to share"
        : alreadyChosen
          ? "Selected ✓"
          : onPersist
            ? "Use this theme"
            : "Use this theme";

  const fanAndName = (
    <>
      <FanCarousel count={count} initialIndex={initialIndex} cards={cards} cardWidth={cardWidth} cardHeights={heights}
        gap={gap} rise={12} radius={24} onIndexChange={setIndex} stepRef={stepRef}
        onFrontPress={() => { if (canPosition) setPositioning(true); else openPreview(); }} />
      {/* Pull name/index up into the fan's reserved rise padding — keep FanCarousel math intact. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: compact ? -22 : 6 }}>
        <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Previous theme" hitSlop={8}
          style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.6 : 1 })}><ChevronLeft color="#E6CEAA" /></Pressable>
        <View style={{ flex: 1, maxWidth: 260 }}>
          <Text style={{ color: "#FFF8EC", fontSize: compact ? 17 : 19, textAlign: "center" }}>{d.name}</Text>
          <Text style={{ color: "#C5BDAF", textAlign: "center", marginTop: 2, fontSize: compact ? 13 : 14 }}>
            {index + 1} of {count}{alreadyChosen ? " · Your theme" : ""}
          </Text>
        </View>
        <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Next theme" hitSlop={8}
          style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.6 : 1 })}><ChevronRight color="#E6CEAA" /></Pressable>
      </View>
      {compact && !demo && (
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 4 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: preview.sample }} onPress={() => { tick(); setContentMode("sample"); }} hitSlop={6}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 4 })}>
            <Text style={{ color: preview.sample ? "#D4B989" : "#9A948A", fontSize: 12, textDecorationLine: preview.sample ? "underline" : "none" }}>Sample</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: !preview.sample }} onPress={() => { tick(); setContentMode("profile"); }} hitSlop={6}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 4 })}>
            <Text style={{ color: !preview.sample ? "#D4B989" : "#9A948A", fontSize: 12, textDecorationLine: !preview.sample ? "underline" : "none" }}>My info</Text>
          </Pressable>
        </View>
      )}
    </>
  );

  const actionRow = (
    <View style={{
      flexDirection: "row", gap: 10, paddingHorizontal: 16,
      paddingTop: compact ? 10 : 12,
      paddingBottom: compact ? Math.max(10, insets.bottom + 8) : 0,
    }}>
      <Pressable onPress={openPreview} accessibilityRole="button"
        style={({ pressed }) => ({ flex: 1, borderWidth: 1, borderColor: "#D4B989", borderRadius: 12, paddingVertical: compact ? 14 : 15, paddingHorizontal: 12, backgroundColor: pressed ? "#2A261E" : "transparent", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <Text style={{ color: "#F5EFE5", textAlign: "center" }}>Preview layout</Text></Pressable>
      <Pressable onPress={() => { void useTheme(); }} accessibilityRole="button" disabled={persisting}
        style={({ pressed }) => ({
          flex: 1, backgroundColor: alreadyChosen && onPersist ? "rgba(46,139,87,0.85)" : "#D4B989", borderRadius: 12,
          paddingVertical: compact ? 14 : 15, paddingHorizontal: 12,
          opacity: persisting ? 0.7 : pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }],
          borderWidth: alreadyChosen && onPersist ? 1 : 0, borderColor: "#70C58B",
        })}>
        <Text style={{ color: alreadyChosen && onPersist ? "#F5EFE5" : "#171713", textAlign: "center", fontWeight: "600" }}>{primaryLabel}</Text></Pressable>
    </View>
  );

  const extras = (
    <>
      {canPosition && !compact && <Pressable onPress={() => { tick(); setPositioning(true); }} accessibilityRole="button" hitSlop={6}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, opacity: pressed ? 0.6 : 1 })}>
        <Move size={15} color="#D4B989" /><Text style={{ color: "#D4B989" }}>Position your portrait (or tap the preview)</Text></Pressable>}
      {!compact && <Text style={{ color: "#C5BDAF", textAlign: "center", fontSize: 12 }}>{demo ? "Demo selections are temporary and never change a real profile." : "Theme selection is a draft until you save below."}</Text>}
      {!compact && <Pressable onPress={() => setComparing(true)} accessibilityRole="button" style={{ alignSelf: "center", padding: 14 }}><Text style={{ color: "#D4B989", textDecorationLine: "underline" }}>Compare with your original image</Text></Pressable>}
      <PortraitPositioner visible={positioning} brand={candidate} onCancel={() => setPositioning(false)}
        onDone={next => { setPositioning(false); onChoose({ ...draft, theme: { ...draft.theme, imagePositions: next.theme.imagePositions } }); }} />
      <Modal visible={comparing} animationType="none" onRequestClose={() => setComparing(false)}>
        <View style={{ flex: 1, backgroundColor: "#171A17", paddingTop: 24 }}>
          <View style={{ flexDirection: "row", padding: 16, alignItems: "center" }}><Text style={{ color: "#F5EFE5", flex: 1 }}>{d.name} · Reference comparison</Text><Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Previous comparison theme" style={{ padding: 12 }}><ChevronLeft color="#F5EFE5" /></Pressable><Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Next comparison theme" style={{ padding: 12 }}><ChevronRight color="#F5EFE5" /></Pressable><Pressable onPress={() => setComparing(false)} accessibilityRole="button" accessibilityLabel="Close reference comparison" style={{ padding: 12 }}><X color="#F5EFE5" /></Pressable></View>
          <Text style={{ color: "#D4C9B8", textAlign: "center", paddingHorizontal: 16, paddingBottom: 14 }}>Original at left. {preview.sample ? "Sample profile at right, using the supplied placeholder portraits and illustrative property photos." : "Your profile at right."}</Text>
          <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}><ScrollView key={selectedId} contentContainerStyle={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 }}>
            <Image source={reference.source} contentFit="contain" style={{ width: comparisonWidth, height: comparisonWidth / reference.aspect }} accessibilityLabel="Original uploaded theme reference" />
            <View style={{ width: comparisonWidth, height: comparisonWidth / reference.aspect, overflow: "hidden", backgroundColor: d.background }}>
              <ReferenceHome brand={preview.brand} portraitSource={preview.portraitSource} listings={preview.listings} width={comparisonWidth} miniature primaryOnly />
              {selectedId !== "eliza-editorial" && <View style={{ position: "absolute", bottom: 0, width: 390, transform: [{ scale: comparisonWidth / 390 }], transformOrigin: "bottom left" }}><ThemeNavigation brand={preview.brand} /></View>}
            </View>
          </ScrollView></ScrollView>
        </View>
      </Modal>
      <ThemePreviewModal visible={expanded} title={d.name}
        subtitle={preview.sample ? "Sample profile · illustrative photos" : "Your information · unsaved preview"}
        note={demo ? "Read-only demo preview. Client actions are disabled; no profile changes are saved." : "Read-only layout preview. Client actions are disabled; nothing here is saved until you choose the theme and save your draft."}
        brand={preview.brand} listings={preview.listings} portraitSource={preview.portraitSource} onClose={() => setExpanded(false)} />
    </>
  );

  if (compact) {
    return (
      <View onLayout={e => setContainerWidth(e.nativeEvent.layout.width)} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "center", paddingTop: 4 }}>
          {fanAndName}
        </View>
        {actionRow}
        {extras}
      </View>
    );
  }

  return <View onLayout={e => setContainerWidth(e.nativeEvent.layout.width)} style={{ marginVertical: 22 }}>
    <Text style={{ color: "#F5EFE5", fontSize: 24, fontFamily: "PlayfairDisplay_500Medium", textAlign: "center" }}>Find your signature</Text>
    <Text style={{ color: "#C5BDAF", textAlign: "center", lineHeight: 20, padding: 16 }}>
      {preview.sample ? "Sample profiles with supplied placeholder portraits and illustrative homes. Never saved to your account." : "Your profile and listings, shown across seven layouts. Browse without changing your saved app."}
    </Text>
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 16 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: preview.sample }} onPress={() => { tick(); setContentMode("sample"); }} style={{ padding: 12, borderWidth: 1, borderColor: preview.sample ? "#D4B989" : "#686158", borderRadius: 8 }}><Text style={{ color: "#F5EFE5" }}>Sample profiles</Text></Pressable>
      {!demo && <Pressable accessibilityRole="button" accessibilityState={{ selected: !preview.sample }} onPress={() => { tick(); setContentMode("profile"); }} style={{ padding: 12, borderWidth: 1, borderColor: !preview.sample ? "#D4B989" : "#686158", borderRadius: 8 }}><Text style={{ color: "#F5EFE5" }}>My information</Text></Pressable>}
    </View>
    {fanAndName}
    {/* Selection controls sit directly under the preview they affect. */}
    {actionRow}
    {extras}
  </View>;
}
