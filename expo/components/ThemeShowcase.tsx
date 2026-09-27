import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import type { Brand } from "@/contexts/BrandContext";
import { THEME_CAROUSEL_ORDER, themeDesign } from "@/constants/themeDesigns";
import { THEME_REFERENCES } from "@/constants/themeReferences";
import { themeSample } from "@/constants/themeSamples";
import { withSamplePortrait } from "@/constants/themeSamplePortraits";
import { useReducedMotion } from "@/hooks/useThemeMotion";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";

const tick = () => { if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {}); };

/** Same fanned, sliding card as the theme editor's carousel. */
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
  return <Animated.View style={{ position: "absolute", left, top: depth * 8, width, height,
    zIndex: 10 - depth, transform: [{ translateX: value }] }}>{children}</Animated.View>;
}

/**
 * Dashboard theme browser: the default sample templates in the editor's fanned
 * carousel style, at a smaller size. Swipe (or tap a side card) to browse, with
 * a light haptic notch per theme. Browsing only — nothing is changed.
 *
 * `onSwipeGesture` hands the swipe to the dashboard so its own swipe can wait.
 */
export default function ThemeShowcase({ brand, onSwipeGesture }: { brand: Brand; onSwipeGesture?: (gesture: GestureType) => void }) {
  const [width, setWidth] = useState(0);
  const count = THEME_CAROUSEL_ORDER.length;
  const order = THEME_CAROUSEL_ORDER as readonly string[];
  const [index, setIndex] = useState(() => Math.max(0, brand.layoutId ? order.indexOf(brand.layoutId) : 0));
  const step = (delta: number) => { tick(); setIndex(current => (current + delta + count) % count); };

  // Sample templates are fixed fixtures; build them once.
  const samples = useMemo(() => THEME_CAROUSEL_ORDER.map(id => withSamplePortrait({ ...themeSample(id), sample: true })), []);

  const swipe = useMemo(() => Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .runOnJS(true)
    .onEnd(e => { if (Math.abs(e.translationX) > 35) step(e.translationX < 0 ? 1 : -1); }), [count]);
  useEffect(() => { onSwipeGesture?.(swipe); }, [swipe, onSwipeGesture]);

  const cardWidth = width ? Math.min(140, width * 0.32) : 110;
  const scale = cardWidth / 390;
  const gap = cardWidth * 0.55;
  const tallest = Math.max(...THEME_CAROUSEL_ORDER.map(id => (390 / THEME_REFERENCES[id].aspect) * scale));

  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ marginTop: 16 }}>
    <GestureDetector gesture={swipe}>
      <View style={{ height: tallest + 30, overflow: "hidden" }} collapsable={false}>
        {width > 0 && [-3, -2, -1, 0, 1, 2, 3].map(offset => {
          const i = (index + offset + count) % count;
          const id = THEME_CAROUSEL_ORDER[i];
          const preview = samples[i];
          const referenceHeight = 390 / THEME_REFERENCES[id].aspect;
          const depthScale = 1 - Math.abs(offset) * 0.09;
          return <SlidingCard key={id} x={offset * gap} left={(width - cardWidth) / 2} width={cardWidth}
            height={referenceHeight * scale} depth={Math.abs(offset)}>
            <Pressable onPress={() => { if (offset !== 0) step(offset); }} accessibilityRole="button"
              accessibilityLabel={offset === 0 ? themeDesign(id).name : `Show ${themeDesign(id).name}`} accessibilityState={{ selected: offset === 0 }}
              style={{ width: cardWidth, height: referenceHeight * scale, borderRadius: 14, overflow: "hidden",
                borderWidth: offset === 0 ? 2 : 1, borderColor: offset === 0 ? "#D4B989" : "#686158",
                backgroundColor: themeDesign(id).background,
                transform: [{ scale: depthScale }, { rotate: `${offset * 2}deg` }] }}>
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                style={{ width: 390, height: referenceHeight, transform: [{ scale }], transformOrigin: "top left" }}>
                <ReferenceHome brand={preview.brand} portraitSource={preview.portraitSource} listings={preview.listings} width={390} miniature primaryOnly />
              </View>
              {id !== "eliza-editorial" && <View pointerEvents="none" style={{ position: "absolute", bottom: 0, width: 390, transform: [{ scale }], transformOrigin: "bottom left" }}>
                <ThemeNavigation brand={preview.brand} />
              </View>}
            </Pressable>
          </SlidingCard>;
        })}
      </View>
    </GestureDetector>
    <Text style={{ color: "#F5EFE5", textAlign: "center", marginTop: 4, fontSize: 13 }}>
      {themeDesign(THEME_CAROUSEL_ORDER[index]).name}
      <Text style={{ color: "#9A948A" }}>{`  ·  ${index + 1} of ${count}${THEME_CAROUSEL_ORDER[index] === brand.layoutId && brand.themeChosen ? "  ·  Your theme" : ""}`}</Text>
    </Text>
  </View>;
}
