import React, { useState } from "react";
import { View } from "react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { THEME_CAROUSEL_ORDER, themeDesign } from "@/constants/themeDesigns";
import { THEME_REFERENCES } from "@/constants/themeReferences";
import { themePreview } from "@/constants/themeSamples";
import { withSamplePortrait } from "@/constants/themeSamplePortraits";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";

/**
 * Static, dashboard-sized version of the theme carousel: the realtor's current
 * layout front and centre, flanked by its neighbours, all filled with their own
 * name and portrait. Purely visual — no swiping or selection here.
 */
export default function ThemeShowcase({ brand, listings }: { brand: Brand; listings: ManagedListing[] }) {
  const [width, setWidth] = useState(0);
  const count = THEME_CAROUSEL_ORDER.length;
  const order = THEME_CAROUSEL_ORDER as readonly string[];
  const current = Math.max(0, brand.layoutId ? order.indexOf(brand.layoutId) : 0);
  // About half the old size, so five themes read as a carousel across the width.
  const cardWidth = width ? Math.min(150, width * 0.3) : 110;
  const scale = cardWidth / 390;
  const spread = cardWidth * 0.74;
  const offsets = [-2, -1, 0, 1, 2];
  const heights = offsets.map(offset => {
    const id = THEME_CAROUSEL_ORDER[(current + offset + count) % count];
    return (390 / THEME_REFERENCES[id].aspect) * scale;
  });
  const frameHeight = Math.max(...heights) + 16;

  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} pointerEvents="none"
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ height: frameHeight, marginTop: 18, overflow: "hidden" }}>
    {width > 0 && [-2, 2, -1, 1, 0].map(offset => {
      const id = THEME_CAROUSEL_ORDER[(current + offset + count) % count];
      const preview = withSamplePortrait(themePreview(brand, listings, id, false, "profile"));
      const referenceHeight = 390 / THEME_REFERENCES[id].aspect;
      const depth = Math.abs(offset);
      return <View key={id} style={{
        position: "absolute", top: depth * 7, left: (width - cardWidth) / 2 + offset * spread,
        width: cardWidth, height: referenceHeight * scale, borderRadius: 14, overflow: "hidden",
        borderWidth: depth ? 1 : 2, borderColor: depth ? "#686158" : "#D4B989",
        backgroundColor: themeDesign(id).background, opacity: [1, 0.8, 0.5][depth],
        transform: [{ scale: [1, 0.88, 0.76][depth] }, { rotate: `${offset * 3}deg` }],
      }}>
        <View style={{ width: 390, height: referenceHeight, transform: [{ scale }], transformOrigin: "top left" }}>
          <ReferenceHome brand={preview.brand} portraitSource={preview.portraitSource} listings={preview.listings}
            width={390} miniature primaryOnly />
        </View>
        {id !== "eliza-editorial" && <View style={{ position: "absolute", bottom: 0, width: 390, transform: [{ scale }], transformOrigin: "bottom left" }}>
          <ThemeNavigation brand={preview.brand} />
        </View>}
      </View>;
    })}
  </View>;
}
