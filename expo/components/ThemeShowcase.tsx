import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { GestureType } from "react-native-gesture-handler";
import type { Brand } from "@/contexts/BrandContext";
import { THEME_CAROUSEL_ORDER, themeDesign } from "@/constants/themeDesigns";
import { themeSample } from "@/constants/themeSamples";
import { withSamplePortrait } from "@/constants/themeSamplePortraits";
import FanCarousel from "./FanCarousel";
import ThemeFace, { themeCardHeight } from "./ThemeFace";

/**
 * Dashboard theme browser: the default sample templates in the editor's fanned
 * carousel style, smaller. Hold and drag, flick, or tap a side card. Browsing
 * only — nothing is changed. `onSwipeGesture` lets the dashboard's own swipe yield.
 */
export default function ThemeShowcase({ brand, onSwipeGesture }: { brand: Brand; onSwipeGesture?: (gesture: GestureType) => void }) {
  const [width, setWidth] = useState(0);
  const count = THEME_CAROUSEL_ORDER.length;
  const order = THEME_CAROUSEL_ORDER as readonly string[];
  const [initial] = useState(() => Math.max(0, brand.layoutId ? order.indexOf(brand.layoutId) : 0));
  const [index, setIndex] = useState(initial);

  const cardWidth = width ? Math.min(140, width * 0.32) : 110;
  const cards = useMemo(() => THEME_CAROUSEL_ORDER.map(id => {
    const preview = withSamplePortrait({ ...themeSample(id), sample: true });
    return <ThemeFace key={id} id={id} brand={preview.brand} listings={preview.listings} portraitSource={preview.portraitSource} width={cardWidth} radius={12} />;
  }), [cardWidth]);
  const heights = useMemo(() => THEME_CAROUSEL_ORDER.map(id => themeCardHeight(id, cardWidth)), [cardWidth]);

  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ marginTop: 16 }}>
    {width > 0 && <FanCarousel count={count} initialIndex={initial} cards={cards} cardWidth={cardWidth} cardHeights={heights}
      gap={cardWidth * 0.55} rise={8} radius={12} onIndexChange={setIndex} onGesture={onSwipeGesture} />}
    <Text style={{ color: "#F5EFE5", textAlign: "center", marginTop: 4, fontSize: 13 }}>
      {themeDesign(THEME_CAROUSEL_ORDER[index]).name}
      <Text style={{ color: "#9A948A" }}>{`  ·  ${index + 1} of ${count}${THEME_CAROUSEL_ORDER[index] === brand.layoutId && brand.themeChosen ? "  ·  Your theme" : ""}`}</Text>
    </Text>
  </View>;
}
