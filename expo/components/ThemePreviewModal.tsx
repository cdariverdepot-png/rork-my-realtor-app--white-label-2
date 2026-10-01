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
import { FlatList, GestureHandlerRootView, ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";

export type ThemePreviewSlide = {
  id: string;
  title: string;
  brand: Brand;
  listings: ManagedListing[];
  portraitSource?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  subtitle?: string;
  note?: string;
  /** Multi-theme full-page pager. When set, horizontal swipe changes themes. */
  slides?: ThemePreviewSlide[];
  index?: number;
  onIndexChange?: (index: number) => void;
  /** Single-theme fallback (dashboard showcase). */
  title?: string;
  brand?: Brand;
  listings?: ManagedListing[];
  portraitSource?: number;
};

/**
 * Full-screen theme preview as a nested pager: horizontal FlatList pages
 * between themes; each page is a vertical ScrollView of the layout. Gesture-
 * handler list + scroll views give directional lock so vertical content scroll
 * and horizontal theme swipe both work.
 */
export default function ThemePreviewModal({
  visible,
  onClose,
  subtitle,
  note,
  slides: slidesProp,
  index = 0,
  onIndexChange,
  title,
  brand,
  listings,
  portraitSource,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ThemePreviewSlide>>(null);
  const indexRef = useRef(index);
  const [listHeight, setListHeight] = useState(0);

  const slides = useMemo<ThemePreviewSlide[]>(() => {
    if (slidesProp?.length) return slidesProp;
    if (brand && listings) {
      return [{ id: "single", title: title ?? "Preview", brand, listings, portraitSource }];
    }
    return [];
  }, [slidesProp, brand, listings, portraitSource, title]);

  const pageWidth = windowWidth;
  const contentWidth = Math.min(windowWidth, 390);
  const multi = slides.length > 1;
  const safeIndex = Math.max(0, Math.min(slides.length - 1, index));
  const current = slides[safeIndex];

  useEffect(() => {
    indexRef.current = safeIndex;
  }, [safeIndex]);

  useEffect(() => {
    if (!visible || !slides.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
    });
  }, [visible, safeIndex, slides.length, pageWidth]);

  const close = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    onClose();
  };

  const goTo = useCallback(
    (next: number) => {
      if (!slides.length) return;
      const clamped = Math.max(0, Math.min(slides.length - 1, next));
      listRef.current?.scrollToIndex({ index: clamped, animated: true });
      if (clamped !== indexRef.current) {
        indexRef.current = clamped;
        if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
        onIndexChange?.(clamped);
      }
    },
    [slides.length, onIndexChange],
  );

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pageWidth) return;
    const next = Math.max(
      0,
      Math.min(slides.length - 1, Math.round(e.nativeEvent.contentOffset.x / pageWidth)),
    );
    if (next !== indexRef.current) {
      indexRef.current = next;
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
      onIndexChange?.(next);
    }
  };

  const renderItem = ({ item }: ListRenderItemInfo<ThemePreviewSlide>) => (
    <View style={{ width: pageWidth, height: listHeight || undefined, flex: listHeight ? undefined : 1 }}>
      {/* GH ScrollView nests under the horizontal pager with directional lock. */}
      <ScrollView
        style={{ flex: 1 }}
        nestedScrollEnabled
        directionalLockEnabled
        showsVerticalScrollIndicator
        bounces
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View style={{ maxWidth: 390, width: "100%", alignSelf: "center" }}>
          <ReferenceHome
            brand={item.brand}
            portraitSource={item.portraitSource}
            listings={item.listings}
            width={contentWidth}
          />
        </View>
        {note ? (
          <Text style={{ color: "#C5BDAF", padding: 24, textAlign: "center", lineHeight: 21 }}>{note}</Text>
        ) : null}
      </ScrollView>
      <View
        style={{
          width: "100%",
          maxWidth: 390,
          alignSelf: "center",
          paddingBottom: insets.bottom,
        }}
      >
        <ThemeNavigation brand={item.brand} />
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#111713" }}>
        <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 14, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
              paddingLeft: 6,
              paddingRight: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.1)",
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <ChevronLeft size={18} color="#F5EFE5" strokeWidth={2.2} />
            <Text style={{ color: "#F5EFE5", fontSize: 15, fontWeight: "600" }}>Back</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: "#F5EFE5", fontSize: 15 }}>
              {current?.title ?? title ?? "Preview"}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={{ color: "#A9A294", fontSize: 12, marginTop: 2 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {multi ? (
            <>
              <Pressable
                onPress={() => goTo(safeIndex - 1)}
                disabled={safeIndex <= 0}
                accessibilityRole="button"
                accessibilityLabel="Previous theme"
                hitSlop={8}
                style={({ pressed }) => ({ padding: 8, opacity: safeIndex <= 0 ? 0.3 : pressed ? 0.6 : 1 })}
              >
                <ChevronLeft color="#E6CEAA" />
              </Pressable>
              <Text style={{ color: "#C5BDAF", fontSize: 12 }}>
                {safeIndex + 1}/{slides.length}
              </Text>
              <Pressable
                onPress={() => goTo(safeIndex + 1)}
                disabled={safeIndex >= slides.length - 1}
                accessibilityRole="button"
                accessibilityLabel="Next theme"
                hitSlop={8}
                style={({ pressed }) => ({
                  padding: 8,
                  opacity: safeIndex >= slides.length - 1 ? 0.3 : pressed ? 0.6 : 1,
                })}
              >
                <ChevronRight color="#E6CEAA" />
              </Pressable>
            </>
          ) : null}
        </View>

        {slides.length > 0 ? (
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            onLayout={e => setListHeight(e.nativeEvent.layout.height)}
            data={slides}
            keyExtractor={item => item.id}
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
            renderItem={renderItem}
            // Keep off-screen pages mounted lightly so swipe feels continuous.
            windowSize={3}
            initialScrollIndex={safeIndex}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
