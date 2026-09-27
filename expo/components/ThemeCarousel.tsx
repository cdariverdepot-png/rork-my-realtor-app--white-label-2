import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { ChevronLeft, ChevronRight, Move, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { THEME_CAROUSEL_ORDER, themeCandidate, themeDesign } from "@/constants/themeDesigns";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";
import PortraitPositioner from "./PortraitPositioner";
import { Image } from "expo-image";
import { THEME_REFERENCES } from "@/constants/themeReferences";
import { themePreview } from "@/constants/themeSamples";
import { withSamplePortrait } from "@/constants/themeSamplePortraits";

const tick = () => { if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {}); };

export default function ThemeCarousel({ draft, listings, onChoose, demo = false }: {
  draft: Brand; listings: ManagedListing[]; onChoose: (next: Brand) => void; demo?: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const count = THEME_CAROUSEL_ORDER.length;
  const [index, setIndex] = useState(() => draft.themeChosen && draft.layoutId
    ? Math.max(0, THEME_CAROUSEL_ORDER.indexOf(draft.layoutId)) : 0);
  const [expanded, setExpanded] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [positioning, setPositioning] = useState(false);
  const [contentMode, setContentMode] = useState<"auto" | "sample" | "profile">("auto");
  const scrollY = useRef(new Animated.Value(0)).current;
  const selectedId = THEME_CAROUSEL_ORDER[index];
  const candidate = themeCandidate(draft, selectedId);
  const preview = withSamplePortrait(themePreview(draft, listings, selectedId, demo, contentMode));
  const d = themeDesign(selectedId);
  const reference = THEME_REFERENCES[selectedId];
  const comparisonWidth = Math.min(390, Math.max(160, (windowWidth - 44) / 2));

  // ── Snap carousel: centre card is the selection; neighbours peek either side.
  const cardWidth = Math.min(300, containerWidth * 0.58);
  const scale = cardWidth / 390;
  const gap = 14;
  const interval = cardWidth + gap;
  const sidePad = (containerWidth - cardWidth) / 2;
  const tallest = Math.max(...THEME_CAROUSEL_ORDER.map(id => (390 / THEME_REFERENCES[id].aspect) * scale));
  const scrollX = useRef(new Animated.Value(index * interval)).current;
  const listRef = useRef<ScrollView>(null);
  const indexRef = useRef(index);
  const positioned = useRef(false);

  useEffect(() => {
    // Land on the saved theme once the width is known, without animating.
    if (positioned.current || !containerWidth) return;
    positioned.current = true;
    requestAnimationFrame(() => listRef.current?.scrollTo({ x: indexRef.current * interval, animated: false }));
  }, [containerWidth, interval]);

  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: true,
    listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const next = Math.max(0, Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.x / interval)));
      if (next !== indexRef.current) {
        indexRef.current = next;
        tick(); // a light notch as each theme passes the centre
        setIndex(next);
      }
    },
  }), [scrollX, interval, count]);

  const goTo = (target: number) => {
    const next = (target + count) % count;
    listRef.current?.scrollTo({ x: next * interval, animated: true });
  };
  const canPosition = !demo && !preview.sample && !!draft.portraitUrl?.trim();

  return <View onLayout={e => setContainerWidth(e.nativeEvent.layout.width)} style={{ marginVertical: 22 }}>
    <Text style={{ color: "#F5EFE5", fontSize: 24, fontFamily: "PlayfairDisplay_500Medium", textAlign: "center" }}>Find your signature</Text>
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 14, marginBottom: 14 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: preview.sample }} onPress={() => { tick(); setContentMode("sample"); }}
        style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: preview.sample ? "#D4B989" : "#686158", borderRadius: 999, backgroundColor: preview.sample ? "#363126" : "transparent", transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        <Text style={{ color: "#F5EFE5" }}>Sample profiles</Text></Pressable>
      {!demo && <Pressable accessibilityRole="button" accessibilityState={{ selected: !preview.sample }} onPress={() => { tick(); setContentMode("profile"); }}
        style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: !preview.sample ? "#D4B989" : "#686158", borderRadius: 999, backgroundColor: !preview.sample ? "#363126" : "transparent", transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        <Text style={{ color: "#F5EFE5" }}>My information</Text></Pressable>}
    </View>

    <Animated.ScrollView ref={listRef} horizontal showsHorizontalScrollIndicator={false}
      snapToInterval={interval} decelerationRate="fast" disableIntervalMomentum={false}
      onScroll={onScroll} scrollEventThrottle={16}
      contentContainerStyle={{ paddingHorizontal: sidePad, gap, alignItems: "flex-start", paddingVertical: 8 }}
      style={{ height: tallest + 24 }}>
      {THEME_CAROUSEL_ORDER.map((id, i) => {
        const cardPreview = withSamplePortrait(themePreview(draft, listings, id, demo, contentMode));
        const referenceHeight = 390 / THEME_REFERENCES[id].aspect;
        const range = [(i - 1) * interval, i * interval, (i + 1) * interval];
        const cardScale = scrollX.interpolate({ inputRange: range, outputRange: [0.88, 1, 0.88], extrapolate: "clamp" });
        const opacity = scrollX.interpolate({ inputRange: range, outputRange: [0.55, 1, 0.55], extrapolate: "clamp" });
        const selected = i === index;
        return <Animated.View key={id} style={{ width: cardWidth, height: referenceHeight * scale, opacity, transform: [{ scale: cardScale }] }}>
          <Pressable onPress={() => {
            if (!selected) { goTo(i); return; }
            tick();
            if (canPosition) setPositioning(true); else { scrollY.setValue(0); setExpanded(true); }
          }} accessibilityRole="button"
            accessibilityLabel={selected ? (canPosition ? `${themeDesign(id).name}. Tap to position your portrait` : `${themeDesign(id).name}. Tap to preview`) : `Show ${themeDesign(id).name}`}
            accessibilityState={{ selected }}
            style={{ flex: 1, borderRadius: 22, borderWidth: selected ? 2 : 1, borderColor: selected ? "#D4B989" : "#686158",
              overflow: "hidden", backgroundColor: themeDesign(id).background }}>
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={{ width: 390, height: referenceHeight, backgroundColor: themeDesign(id).background, transform: [{ scale }], transformOrigin: "top left" }}>
              <ReferenceHome brand={cardPreview.brand} portraitSource={cardPreview.portraitSource} listings={cardPreview.listings} width={390} miniature primaryOnly />
            </View>
            {id !== "eliza-editorial" && <View pointerEvents="none" style={{ position: "absolute", bottom: 0, width: 390, transform: [{ scale }], transformOrigin: "bottom left" }}><ThemeNavigation brand={cardPreview.brand} /></View>}
          </Pressable>
        </Animated.View>;
      })}
    </Animated.ScrollView>

    {/* Selection controls sit directly under the preview they affect. */}
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 6 }}>
      <Pressable onPress={() => goTo(index - 1)} accessibilityRole="button" accessibilityLabel="Previous theme" hitSlop={8}
        style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.6 : 1 })}><ChevronLeft color="#E6CEAA" /></Pressable>
      <View style={{ flex: 1, maxWidth: 260 }}>
        <Text style={{ color: "#FFF8EC", fontSize: 19, textAlign: "center" }}>{d.name}</Text>
        <Text style={{ color: "#C5BDAF", textAlign: "center", marginTop: 4 }}>
          {index + 1} of {count}{draft.layoutId === selectedId && draft.themeChosen ? " · Your theme" : ""}
        </Text>
      </View>
      <Pressable onPress={() => goTo(index + 1)} accessibilityRole="button" accessibilityLabel="Next theme" hitSlop={8}
        style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.6 : 1 })}><ChevronRight color="#E6CEAA" /></Pressable>
    </View>
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
      <Pressable onPress={() => { tick(); scrollY.setValue(0); setExpanded(true); }} accessibilityRole="button"
        style={({ pressed }) => ({ flex: 1, borderWidth: 1, borderColor: "#D4B989", borderRadius: 12, padding: 15, backgroundColor: pressed ? "#2A261E" : "transparent", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <Text style={{ color: "#F5EFE5", textAlign: "center" }}>Preview layout</Text></Pressable>
      <Pressable onPress={() => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onChoose(candidate); }} accessibilityRole="button"
        style={({ pressed }) => ({ flex: 1, backgroundColor: "#D4B989", borderRadius: 12, padding: 15, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <Text style={{ color: "#171713", textAlign: "center", fontWeight: "600" }}>{demo ? "Select in showcase" : draft.layoutId === selectedId && draft.themeChosen ? "Selected ✓" : "Use this theme"}</Text></Pressable>
    </View>
    {canPosition && <Pressable onPress={() => { tick(); setPositioning(true); }} accessibilityRole="button" hitSlop={6}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, opacity: pressed ? 0.6 : 1 })}>
      <Move size={15} color="#D4B989" /><Text style={{ color: "#D4B989" }}>Position your portrait (or tap the preview)</Text></Pressable>}
    <Text style={{ color: "#C5BDAF", textAlign: "center", fontSize: 12, paddingHorizontal: 16 }}>
      {preview.sample ? "Sample profiles with placeholder portraits and illustrative homes. Never saved to your account."
        : demo ? "Demo selections are temporary and never change a real profile." : "Your information in each theme. Theme selection is a draft until you save below."}
    </Text>
    <Pressable onPress={() => setComparing(true)} accessibilityRole="button" style={{ alignSelf: "center", padding: 14 }}><Text style={{ color: "#D4B989", textDecorationLine: "underline" }}>Compare with the original design</Text></Pressable>
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
    <Modal visible={expanded} animationType="none" onRequestClose={() => setExpanded(false)}>
      <View style={{ flex: 1, backgroundColor: "#111713" }}>
        <View style={{ paddingTop: 48, paddingHorizontal: 18, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ color: "#F5EFE5", flex: 1 }}>{d.name} · {preview.sample ? "Sample profile · illustrative photos" : "Your information · unsaved preview"}</Text>
          <Pressable onPress={() => setExpanded(false)} accessibilityRole="button" accessibilityLabel="Close theme preview" style={{ padding: 12 }}><X color="#F5EFE5" /></Pressable>
        </View>
        <Animated.ScrollView onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })} scrollEventThrottle={16}>
          <View style={{ maxWidth: 390, width: "100%", alignSelf: "center" }}>
            <ReferenceHome brand={preview.brand} portraitSource={preview.portraitSource} listings={preview.listings} width={Math.min(windowWidth, 390)} scrollY={scrollY} />
          </View>
          <Text style={{ color: "#C5BDAF", padding: 24, textAlign: "center", lineHeight: 21 }}>
            {demo ? "Read-only demo preview. Client actions are disabled; no profile changes are saved." : "Read-only layout preview. Client actions are disabled; nothing here is saved until you choose the theme and save your draft."}
          </Text>
        </Animated.ScrollView>
        <View style={{ width: "100%", maxWidth: 390, alignSelf: "center" }}><ThemeNavigation brand={preview.brand} /></View>
      </View>
    </Modal>
  </View>;
}
