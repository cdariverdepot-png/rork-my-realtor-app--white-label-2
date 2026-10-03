import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { GestureType } from "react-native-gesture-handler";
import type { Brand } from "@/contexts/BrandContext";
import { THEME_CAROUSEL_ORDER, themeCandidate, themeDesign } from "@/constants/themeDesigns";
import { themeSample } from "@/constants/themeSamples";
import { withSamplePortrait } from "@/constants/themeSamplePortraits";
import FanCarousel from "./FanCarousel";
import ThemeFace, { themeCardHeight } from "./ThemeFace";
import ThemePreviewModal from "./ThemePreviewModal";
import OnboardingThemePreview from './OnboardingThemePreview';
import { useListings } from '@/contexts/ListingsContext';
import { websiteCandidate, type WebsiteVariant } from '@/lib/websitePresentation';

/**
 * Dashboard theme browser: the default sample templates in the editor's fanned
 * carousel style, smaller. Hold and drag, flick, or tap a side card; tap the front card to preview it. Browsing
 * only — nothing is changed. `onSwipeGesture` lets the dashboard's own swipe yield.
 */
export default function ThemeShowcase({ brand, onSwipeGesture }: { brand: Brand; onSwipeGesture?: (gesture: GestureType) => void }) {
  const [width, setWidth] = useState(0);
  const { all } = useListings();
  const available = !!brand.websiteDesign;
  const order = useMemo(() => available ? ['website' as const, ...THEME_CAROUSEL_ORDER] : THEME_CAROUSEL_ORDER, [available]);
  const count = order.length;
  const [variant, setVariant] = useState<WebsiteVariant>(brand.websiteVariant ?? 'original');
  const [initial] = useState(() => brand.presentation === 'website' ? 0 : Math.max(0, brand.layoutId ? order.indexOf(brand.layoutId) : 0));
  const [index, setIndex] = useState(initial);
  const [previewing, setPreviewing] = useState(false);
  const shownId = order[Math.min(index, count - 1)];
  const shown = useMemo(() => ({ brand: shownId === 'website' ? websiteCandidate(brand, variant) : themeCandidate(brand, shownId), listings: all }), [shownId, brand, variant, all]);
  const name = shownId === 'website' ? 'My Website' : themeDesign(shownId).name;

  const cardWidth = width ? Math.min(140, width * 0.32) : 110;
  const cards = useMemo(() => order.map(id => id === 'website' ? <View key={id} pointerEvents="none"><OnboardingThemePreview brand={websiteCandidate(brand, variant)} listings={all} width={cardWidth} /></View> :
    <ThemeFace key={id} id={id} brand={themeCandidate(brand, id)} listings={all} width={cardWidth} radius={12} />), [cardWidth, order, brand, variant, all]);
  const heights = useMemo(() => order.map(id => id === 'website' ? Math.min(780, cardWidth * 2.12) : themeCardHeight(id, cardWidth)), [cardWidth, order]);

  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ marginTop: 16 }}>
    {width > 0 && <FanCarousel count={count} initialIndex={initial} cards={cards} cardWidth={cardWidth} cardHeights={heights}
      gap={cardWidth * 0.55} rise={8} radius={12} onIndexChange={setIndex} onGesture={onSwipeGesture}
      onFrontPress={() => setPreviewing(true)} />}
    <Text style={{ color: "#F5EFE5", textAlign: "center", marginTop: 4, fontSize: 13 }}>
      {name}
      <Text style={{ color: "#9A948A" }}>{`  ·  ${index + 1} of ${count}`}</Text>
    </Text>
    {shownId === 'website' && <View style={{ flexDirection: 'row', alignSelf: 'center', gap: 12, marginTop: 12 }}>{(['original','optimized'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: variant === value }} onPress={() => setVariant(value)} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: variant === value ? '#D4B989' : '#686158' }}><Text style={{ color: '#F5EFE5' }}>{value === 'original' ? 'Original' : 'Optimized'}</Text></Pressable>)}</View>}
    <ThemePreviewModal visible={previewing} title={name} subtitle="Your content · preview activity stays here"
      brand={shown.brand} listings={shown.listings} onClose={() => setPreviewing(false)} />
  </View>;
}
