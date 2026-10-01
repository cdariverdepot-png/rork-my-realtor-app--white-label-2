import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import { FlatList, ScrollView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight, Move, X } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import type { ClientLayoutId } from "@/constants/clientLayouts";
import { THEME_CAROUSEL_ORDER, themeCandidate, themeDesign } from "@/constants/themeDesigns";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";
import ThemePreviewModal, { type ThemePreviewSlide } from "./ThemePreviewModal";
import PortraitPositioner from "./PortraitPositioner";
import { Image } from "expo-image";
import { THEME_REFERENCES } from "@/constants/themeReferences";
import { themePreview } from "@/constants/themeSamples";
import { withSamplePortrait } from "@/constants/themeSamplePortraits";

const tick = () => { if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {}); };

/**
 * Theme editor main carousel: full-width horizontal pager of themes. Each page
 * is a nested vertical ScrollView of the live layout so users can scroll the
 * current theme normally while a horizontal swipe still changes slides
 * (directional lock via gesture-handler FlatList + ScrollView).
 */
export default function ThemeCarousel({ draft, listings, onChoose, demo = false }: {
  draft: Brand; listings: ManagedListing[]; onChoose: (next: Brand) => void; demo?: boolean;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const [initialIndex] = useState(() => draft.themeChosen && draft.layoutId
    ? Math.max(0, THEME_CAROUSEL_ORDER.indexOf(draft.layoutId)) : 0);
  const [index, setIndex] = useState(initialIndex);
  const indexRef = useRef(initialIndex);
  const listRef = useRef<FlatList<ClientLayoutId>>(null);
  const [expanded, setExpanded] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [positioning, setPositioning] = useState(false);
  const [contentMode, setContentMode] = useState<"auto" | "sample" | "profile">("sample");
  const count = THEME_CAROUSEL_ORDER.length;
  const pageWidth = Math.max(1, containerWidth);
  // Tall viewport so each theme reads as a full-page slide inside the editor.
  const pageHeight = Math.min(Math.max(420, windowHeight * 0.62), 740);
  const previewWidth = Math.min(390, pageWidth);

  const selectedId = THEME_CAROUSEL_ORDER[index];
  const candidate = themeCandidate(draft, selectedId);
  const preview = withSamplePortrait(themePreview(draft, listings, selectedId, demo, contentMode));
  const d = themeDesign(selectedId);
  const comparisonWidth = Math.min(390, Math.max(160, (windowWidth - 44) / 2));
  const reference = THEME_REFERENCES[selectedId];
  const canPosition = !demo && !preview.sample && !!draft.portraitUrl?.trim();

  const slides: ThemePreviewSlide[] = useMemo(
    () =>
      THEME_CAROUSEL_ORDER.map(id => {
        const face = withSamplePortrait(themePreview(draft, listings, id, demo, contentMode));
        return {
          id,
          title: themeDesign(id).name,
          brand: face.brand,
          listings: face.listings,
          portraitSource: face.portraitSource,
        };
      }),
    [draft, listings, demo, contentMode],
  );

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const commitIndex = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(count - 1, next));
    if (clamped === indexRef.current) return;
    indexRef.current = clamped;
    tick();
    setIndex(clamped);
  }, [count]);

  const goTo = useCallback((target: number) => {
    const clamped = ((target % count) + count) % count;
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
    commitIndex(clamped);
  }, [count, commitIndex]);

  const step = (delta: number) => goTo(indexRef.current + delta);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pageWidth) return;
    commitIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
  };

  // Land on the saved theme once width is known (no animation).
  const positioned = useRef(false);
  useEffect(() => {
    if (positioned.current || !containerWidth) return;
    positioned.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    });
  }, [containerWidth, initialIndex]);

  const renderPage = ({ item: id }: ListRenderItemInfo<ClientLayoutId>) => {
    const face = withSamplePortrait(themePreview(draft, listings, id, demo, contentMode));
    return (
      <View style={{ width: pageWidth, height: pageHeight, backgroundColor: themeDesign(id).background }}>
        <ScrollView
          style={{ flex: 1 }}
          nestedScrollEnabled
          directionalLockEnabled
          showsVerticalScrollIndicator
          bounces
          contentContainerStyle={{ paddingBottom: 56 }}
        >
            <View style={{ maxWidth: 390, width: "100%", alignSelf: "center" }} accessibilityLabel={`${themeDesign(id).name} theme preview`}>
              <ReferenceHome
                brand={face.brand}
                portraitSource={face.portraitSource}
                listings={face.listings}
                width={previewWidth}
              />
            </View>
        </ScrollView>
        {id !== "eliza-editorial" ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <View style={{ width: previewWidth }}>
              <ThemeNavigation brand={face.brand} />
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View onLayout={e => setContainerWidth(e.nativeEvent.layout.width)} style={{ marginVertical: 22 }}>
      <Text style={{ color: "#F5EFE5", fontSize: 24, fontFamily: "PlayfairDisplay_500Medium", textAlign: "center" }}>
        Find your signature
      </Text>
      <Text style={{ color: "#C5BDAF", textAlign: "center", lineHeight: 20, padding: 16 }}>
        {preview.sample
          ? "Sample profiles with supplied placeholder portraits and illustrative homes. Never saved to your account."
          : "Your profile and listings, shown across seven layouts. Browse without changing your saved app."}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: preview.sample }}
          onPress={() => { tick(); setContentMode("sample"); }}
          style={{ padding: 12, borderWidth: 1, borderColor: preview.sample ? "#D4B989" : "#686158", borderRadius: 8 }}
        >
          <Text style={{ color: "#F5EFE5" }}>Sample profiles</Text>
        </Pressable>
        {!demo && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !preview.sample }}
            onPress={() => { tick(); setContentMode("profile"); }}
            style={{ padding: 12, borderWidth: 1, borderColor: !preview.sample ? "#D4B989" : "#686158", borderRadius: 8 }}
          >
            <Text style={{ color: "#F5EFE5" }}>My information</Text>
          </Pressable>
        )}
      </View>

      <View
        style={{
          height: pageHeight,
          borderRadius: 18,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "#686158",
          backgroundColor: "#111713",
        }}
      >
        {containerWidth > 0 ? (
          <FlatList
            ref={listRef}
            data={[...THEME_CAROUSEL_ORDER]}
            keyExtractor={id => id}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            disableIntervalMomentum
            onMomentumScrollEnd={onMomentumEnd}
            getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
            onScrollToIndexFailed={({ index: failed }) => {
              requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: failed, animated: false }));
            }}
            renderItem={renderPage}
            windowSize={3}
            initialScrollIndex={initialIndex}
            extraData={{ contentMode, draft, listings, demo, previewWidth }}
          />
        ) : null}
      </View>

      {/* Selection controls sit directly under the preview they affect. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 6 }}>
        <Pressable
          onPress={() => step(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous theme"
          hitSlop={8}
          style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.6 : 1 })}
        >
          <ChevronLeft color="#E6CEAA" />
        </Pressable>
        <View style={{ flex: 1, maxWidth: 260 }}>
          <Text style={{ color: "#FFF8EC", fontSize: 19, textAlign: "center" }}>{d.name}</Text>
          <Text style={{ color: "#C5BDAF", textAlign: "center", marginTop: 4 }}>
            {index + 1} of {count}
            {draft.layoutId === selectedId && draft.themeChosen ? " · Your theme" : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => step(1)}
          accessibilityRole="button"
          accessibilityLabel="Next theme"
          hitSlop={8}
          style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.6 : 1 })}
        >
          <ChevronRight color="#E6CEAA" />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
        <Pressable
          onPress={() => { tick(); setExpanded(true); }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            borderWidth: 1,
            borderColor: "#D4B989",
            borderRadius: 12,
            padding: 15,
            backgroundColor: pressed ? "#2A261E" : "transparent",
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <Text style={{ color: "#F5EFE5", textAlign: "center" }}>Preview layout</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onChoose(candidate);
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: "#D4B989",
            borderRadius: 12,
            padding: 15,
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <Text style={{ color: "#171713", textAlign: "center", fontWeight: "600" }}>
            {demo
              ? "Select in showcase"
              : draft.layoutId === selectedId && draft.themeChosen
                ? "Selected ✓"
                : "Use this theme"}
          </Text>
        </Pressable>
      </View>
      {canPosition && (
        <Pressable
          onPress={() => { tick(); setPositioning(true); }}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 12,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Move size={15} color="#D4B989" />
          <Text style={{ color: "#D4B989" }}>Position your portrait (or tap the preview)</Text>
        </Pressable>
      )}
      <Text style={{ color: "#C5BDAF", textAlign: "center", fontSize: 12 }}>
        {demo
          ? "Demo selections are temporary and never change a real profile."
          : "Theme selection is a draft until you save below."}
      </Text>
      <Text style={{ color: "#9A948A", textAlign: "center", fontSize: 11, paddingHorizontal: 20, marginTop: 4 }}>
        Swipe left or right to change themes · scroll up and down inside a theme
      </Text>
      <Pressable
        onPress={() => setComparing(true)}
        accessibilityRole="button"
        style={{ alignSelf: "center", padding: 14 }}
      >
        <Text style={{ color: "#D4B989", textDecorationLine: "underline" }}>Compare with your original image</Text>
      </Pressable>
      <PortraitPositioner
        visible={positioning}
        brand={candidate}
        onCancel={() => setPositioning(false)}
        onDone={next => {
          setPositioning(false);
          onChoose({ ...draft, theme: { ...draft.theme, imagePositions: next.theme.imagePositions } });
        }}
      />
      <Modal visible={comparing} animationType="none" onRequestClose={() => setComparing(false)}>
        <View style={{ flex: 1, backgroundColor: "#171A17", paddingTop: 24 }}>
          <View style={{ flexDirection: "row", padding: 16, alignItems: "center" }}>
            <Text style={{ color: "#F5EFE5", flex: 1 }}>{d.name} · Reference comparison</Text>
            <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Previous comparison theme" style={{ padding: 12 }}>
              <ChevronLeft color="#F5EFE5" />
            </Pressable>
            <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Next comparison theme" style={{ padding: 12 }}>
              <ChevronRight color="#F5EFE5" />
            </Pressable>
            <Pressable onPress={() => setComparing(false)} accessibilityRole="button" accessibilityLabel="Close reference comparison" style={{ padding: 12 }}>
              <X color="#F5EFE5" />
            </Pressable>
          </View>
          <Text style={{ color: "#D4C9B8", textAlign: "center", paddingHorizontal: 16, paddingBottom: 14 }}>
            Original at left.{" "}
            {preview.sample
              ? "Sample profile at right, using the supplied placeholder portraits and illustrative property photos."
              : "Your profile at right."}
          </Text>
          <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <ScrollView key={selectedId} contentContainerStyle={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 }}>
              <Image
                source={reference.source}
                contentFit="contain"
                style={{ width: comparisonWidth, height: comparisonWidth / reference.aspect }}
                accessibilityLabel="Original uploaded theme reference"
              />
              <View
                style={{
                  width: comparisonWidth,
                  height: comparisonWidth / reference.aspect,
                  overflow: "hidden",
                  backgroundColor: d.background,
                }}
              >
                <ReferenceHome
                  brand={preview.brand}
                  portraitSource={preview.portraitSource}
                  listings={preview.listings}
                  width={comparisonWidth}
                  miniature
                  primaryOnly
                />
                {selectedId !== "eliza-editorial" && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      width: 390,
                      transform: [{ scale: comparisonWidth / 390 }],
                      transformOrigin: "bottom left",
                    }}
                  >
                    <ThemeNavigation brand={preview.brand} />
                  </View>
                )}
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      </Modal>
      <ThemePreviewModal
        visible={expanded}
        slides={slides}
        index={index}
        onIndexChange={next => {
          commitIndex(next);
          listRef.current?.scrollToIndex({ index: next, animated: false });
        }}
        subtitle={preview.sample ? "Sample profile · illustrative photos" : "Your information · unsaved preview"}
        note={
          demo
            ? "Read-only demo preview. Client actions are disabled; no profile changes are saved."
            : "Read-only layout preview. Client actions are disabled; nothing here is saved until you choose the theme and save your draft."
        }
        onClose={() => setExpanded(false)}
      />
    </View>
  );
}
