import React, { memo } from "react";
import { View } from "react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import type { ClientLayoutId } from "@/constants/clientLayouts";
import { themeDesign } from "@/constants/themeDesigns";
import { THEME_REFERENCES } from "@/constants/themeReferences";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";

/** Every card uses the same phone-shaped frame (390 × 844), so the carousel is uniform. */
export const THEME_CARD_ASPECT = 844 / 390;
export const themeCardHeight = (_id: ClientLayoutId, width: number) => width * THEME_CARD_ASPECT;

/** One miniature theme preview. Memoised: carousels move these, never rebuild them. */
export default memo(function ThemeFace({ id, brand, listings, portraitSource, width, radius = 18 }: {
  id: ClientLayoutId; brand: Brand; listings: ManagedListing[]; portraitSource?: number; width: number; radius?: number;
}) {
  const scale = width / 390;
  const referenceHeight = 390 / THEME_REFERENCES[id].aspect;
  // Designs shorter than the frame sit on their own background; taller ones are cropped at the frame.
  return <View accessibilityLabel={themeDesign(id).name}
    style={{ width, height: width * THEME_CARD_ASPECT, borderRadius: radius, overflow: "hidden",
      borderWidth: 1, borderColor: "#686158", backgroundColor: themeDesign(id).background }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: 390, height: referenceHeight, transform: [{ scale }], transformOrigin: "top left" }}>
      <ReferenceHome brand={brand} portraitSource={portraitSource} listings={listings} width={390} miniature primaryOnly />
    </View>
    {id !== "eliza-editorial" && <View pointerEvents="none" style={{ position: "absolute", bottom: 0, width: 390, transform: [{ scale }], transformOrigin: "bottom left" }}>
      <ThemeNavigation brand={brand} />
    </View>}
  </View>;
});
