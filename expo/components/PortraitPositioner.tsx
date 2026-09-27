import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { Brand } from "@/contexts/BrandContext";
import ThemeHero from "./ThemeHero";
import { withThemeSlots } from "@/constants/themeSlots";
import { imageFrame, imagePositionKey } from "@/lib/themeImages";

type Frame = { x: number; y: number; zoom: number };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Direct manipulation of the portrait inside the chosen theme — drag to move,
 * pinch to zoom, like a profile-photo cropper. The hero renders live with the
 * framing as you go; zoom never drops below 1 so the frame stays filled.
 */
export default function PortraitPositioner({ visible, brand, onDone, onCancel }: {
  visible: boolean; brand: Brand; onDone: (next: Brand) => void; onCancel: () => void;
}) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const width = Math.min(window.width, 430);
  const key = imagePositionKey(brand.theme, brand.layoutId);
  const [frame, setFrame] = useState<Frame>(() => imageFrame(brand.theme, brand.layoutId));
  const start = useRef<Frame>(frame);
  // Each time the editor opens, start from the saved framing for this look.
  useEffect(() => {
    if (!visible) return;
    const fresh = imageFrame(brand.theme, brand.layoutId);
    start.current = fresh;
    setFrame(fresh);
  }, [visible, key]);

  const live: Brand = useMemo(() => ({
    ...brand,
    theme: { ...brand.theme, imagePositions: { ...brand.theme.imagePositions, [key]: frame } },
  }), [brand, key, frame]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().runOnJS(true)
      .onBegin(() => { start.current = frame; })
      .onUpdate(e => {
        // Dragging the photo right reveals more of its left side, so the focal point moves left.
        const factor = 100 / (width * 0.8) / start.current.zoom;
        setFrame(current => ({ ...current,
          x: clamp(start.current.x - e.translationX * factor, 0, 100),
          y: clamp(start.current.y - e.translationY * factor, 0, 100) }));
      });
    const pinch = Gesture.Pinch().runOnJS(true)
      .onBegin(() => { start.current = frame; })
      .onUpdate(e => setFrame(current => ({ ...current, zoom: clamp(start.current.zoom * e.scale, 1, 3) })));
    return Gesture.Simultaneous(pan, pinch);
  }, [frame, width]);

  const finish = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onDone(live);
  };
  const reset = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setFrame({ x: 50, y: 50, zoom: 1 });
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0B0D0C" }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center" }}>
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={10} style={{ padding: 8 }}>
          <Text style={{ color: "#C8C2B4", fontSize: 16 }}>Cancel</Text>
        </Pressable>
        <Text style={{ flex: 1, color: "#F5EFE5", textAlign: "center", fontSize: 16, fontWeight: "600" }}>Position your portrait</Text>
        <Pressable onPress={finish} accessibilityRole="button" hitSlop={10}
          style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: "#D4B989", transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <Text style={{ color: "#171713", fontSize: 16, fontWeight: "700" }}>Done</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <GestureDetector gesture={gesture}>
          <View style={{ width, overflow: "hidden", borderRadius: 18 }} collapsable={false}>
            <View pointerEvents="none"><ThemeHero brand={withThemeSlots(live)} width={width} preview /></View>
          </View>
        </GestureDetector>
      </View>
      <View style={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 24, alignItems: "center", gap: 10 }}>
        <Text style={{ color: "#C8C2B4", textAlign: "center" }}>Drag to move · Pinch to zoom</Text>
        <Pressable onPress={reset} accessibilityRole="button" hitSlop={8}><Text style={{ color: "#D4B989" }}>Reset</Text></Pressable>
      </View>
    </GestureHandlerRootView>
  </Modal>;
}
