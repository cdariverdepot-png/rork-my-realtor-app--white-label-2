import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, PanResponder, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { THEME_CAROUSEL_ORDER, themeCandidate, themeDesign } from "@/constants/themeDesigns";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";
import { useReducedMotion } from "@/hooks/useThemeMotion";
import { Image } from "expo-image";
import { THEME_REFERENCES } from "@/constants/themeReferences";
import { themePreview } from "@/constants/themeSamples";
import { withSamplePortrait } from "@/constants/themeSamplePortraits";

function SlidingCard({ children, x, left, width, height, depth }: {
  children: React.ReactNode; x: number; left: number; width: number; height: number; depth: number;
}) {
  const value = useRef(new Animated.Value(x)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { value.setValue(x); return; }
    const animation = Animated.spring(value, { toValue: x, damping: 24, stiffness: 180, mass: 1, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [value, x, reduced]);
  return <Animated.View style={{ position: "absolute", left, top: depth * 12, width, height,
    zIndex: 10 - depth, transform: [{ translateX: value }] }}>{children}</Animated.View>;
}

export default function ThemeCarousel({ draft, listings, onChoose, demo = false }: {
  draft: Brand; listings: ManagedListing[]; onChoose: (next: Brand) => void; demo?: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const [index, setIndex] = useState(() => draft.themeChosen && draft.layoutId
    ? Math.max(0, THEME_CAROUSEL_ORDER.indexOf(draft.layoutId)) : 0);
  const [expanded, setExpanded] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [contentMode, setContentMode] = useState<"auto" | "sample" | "profile">("auto");
  const scrollY = useRef(new Animated.Value(0)).current;
  const count = THEME_CAROUSEL_ORDER.length;
  const step = (delta: number) => setIndex(current => (current + delta + count) % count);
  const gesture = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 35) setIndex(current => (current + (g.dx < 0 ? 1 : -1) + count) % count); },
  })).current;
  const selectedId = THEME_CAROUSEL_ORDER[index];
  const candidate = themeCandidate(draft, selectedId);
  const preview = withSamplePortrait(themePreview(draft, listings, selectedId, demo, contentMode));
  const d = themeDesign(selectedId);
  const scale = Math.min(0.58, Math.max(0.42, containerWidth / 760));
  const cardWidth = 390 * scale;
  const cardHeight = 844 * scale;
  const gap = containerWidth > 650 ? Math.min(95, containerWidth / 10) : 46;
  const comparisonWidth = Math.min(390, Math.max(160, (windowWidth - 44) / 2));
  const reference = THEME_REFERENCES[selectedId];
  return <View onLayout={e => setContainerWidth(e.nativeEvent.layout.width)} style={{ marginVertical: 22 }}>
    <Text style={{ color: "#F5EFE5", fontSize: 24, fontFamily: "PlayfairDisplay_500Medium", textAlign: "center" }}>Find your signature</Text>
    <Text style={{ color: "#C5BDAF", textAlign: "center", lineHeight: 20, padding: 16 }}>
      {preview.sample ? "Sample profiles with supplied placeholder portraits and illustrative homes. Never saved to your account." : "Your profile and listings, shown across seven layouts. Browse without changing your saved app."}
    </Text>
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 16 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: preview.sample }} onPress={() => setContentMode("sample")} style={{ padding: 12, borderWidth: 1, borderColor: preview.sample ? "#D4B989" : "#686158", borderRadius: 8 }}><Text style={{ color: "#F5EFE5" }}>Sample profiles</Text></Pressable>
      {!demo && <Pressable accessibilityRole="button" accessibilityState={{ selected: !preview.sample }} onPress={() => setContentMode("profile")} style={{ padding: 12, borderWidth: 1, borderColor: !preview.sample ? "#D4B989" : "#686158", borderRadius: 8 }}><Text style={{ color: "#F5EFE5" }}>My information</Text></Pressable>}
    </View>
    <View {...gesture.panHandlers} style={{ height: cardHeight + 42, overflow: "hidden" }}>
      {[-3, -2, -1, 0, 1, 2, 3].map(offset => {
        const id = THEME_CAROUSEL_ORDER[(index + offset + count) % count];
        const cardPreview = withSamplePortrait(themePreview(draft, listings, id, demo, contentMode));
        const shown = cardPreview.brand;
        const referenceHeight = 390 / THEME_REFERENCES[id].aspect;
        const phoneHeight = referenceHeight * scale;
        const depthScale = 1 - Math.abs(offset) * 0.09;
        return <SlidingCard key={id} x={offset * gap} left={(containerWidth - cardWidth) / 2} width={cardWidth} height={phoneHeight} depth={Math.abs(offset)}>
          <Pressable onPress={() => setIndex(THEME_CAROUSEL_ORDER.indexOf(id))} accessibilityRole="button"
          accessibilityLabel={themeDesign(id).name} accessibilityState={{ selected: offset === 0 }}
          style={{ width: cardWidth, height: phoneHeight, borderRadius: 24,
            borderWidth: offset === 0 ? 2 : 1, borderColor: offset === 0 ? "#D4B989" : "#686158",
            overflow: "hidden", backgroundColor: themeDesign(id).background,
            zIndex: 10 - Math.abs(offset), opacity: 1,
            transform: [{ scale: depthScale }, { rotate: `${offset * 2}deg` }] }}>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden={true}
            style={{ width: 390, height: referenceHeight, backgroundColor: themeDesign(id).background, transform: [{ scale }], transformOrigin: "top left" }}>
            <ReferenceHome brand={shown} portraitSource={cardPreview.portraitSource} listings={cardPreview.listings} width={390} miniature primaryOnly />
          </View>
          {id !== "eliza-editorial" && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden={true} style={{ position: "absolute", bottom: 0, width: 390, transform: [{ scale }], transformOrigin: "bottom left" }}><ThemeNavigation brand={shown} /></View>}
        </Pressable></SlidingCard>;
      })}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, padding: 12 }}>
      {THEME_CAROUSEL_ORDER.map((id, themeIndex) => <Pressable key={id} onPress={() => setIndex(themeIndex)} accessibilityRole="button" accessibilityLabel={`Select ${themeDesign(id).name}`} accessibilityState={{ selected: selectedId === id }} style={{ padding: 12, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: selectedId === id ? "#D4B989" : "#686158", backgroundColor: selectedId === id ? "#363126" : "transparent" }}><Text style={{ color: "#F5EFE5" }}>{themeDesign(id).name}</Text></Pressable>)}
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Previous theme" style={{ padding: 14 }}><ChevronLeft color="#E6CEAA" /></Pressable>
      <View style={{ flex: 1, maxWidth: 300 }}>
        <Text style={{ color: "#FFF8EC", fontSize: 19, textAlign: "center" }}>{d.name}</Text>
        <Text style={{ color: "#C5BDAF", textAlign: "center", marginTop: 5 }}>{index + 1} of {count}{draft.layoutId === selectedId ? " · Selected in draft" : ""}</Text>
      </View>
      <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Next theme" style={{ padding: 14 }}><ChevronRight color="#E6CEAA" /></Pressable>
    </View>
    <View style={{ flexDirection: "row", gap: 10, padding: 16 }}>
      <Pressable onPress={() => { scrollY.setValue(0); setExpanded(true); }} accessibilityRole="button"
        style={{ flex: 1, borderWidth: 1, borderColor: "#D4B989", borderRadius: 12, padding: 16 }}><Text style={{ color: "#F5EFE5", textAlign: "center" }}>Preview layout</Text></Pressable>
      <Pressable onPress={() => onChoose(candidate)} accessibilityRole="button"
        style={{ flex: 1, backgroundColor: "#D4B989", borderRadius: 12, padding: 16 }}><Text style={{ color: "#171713", textAlign: "center", fontWeight: "600" }}>{demo ? "Select in showcase" : "Use this theme"}</Text></Pressable>
    </View>
    <Text style={{ color: "#C5BDAF", textAlign: "center", fontSize: 12 }}>{demo ? "Demo selections are temporary and never change a real profile." : "Theme selection is a draft until you save below."}</Text>
    <Pressable onPress={() => setComparing(true)} accessibilityRole="button" style={{ alignSelf: "center", padding: 16 }}><Text style={{ color: "#D4B989", textDecorationLine: "underline" }}>Compare with your original image</Text></Pressable>
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
