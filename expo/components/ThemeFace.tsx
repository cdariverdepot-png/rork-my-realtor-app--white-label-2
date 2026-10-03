import React, { memo } from "react";
import { View } from "react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import type { ClientLayoutId } from "@/constants/clientLayouts";
import { themeDesign } from "@/constants/themeDesigns";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";

/** Every card uses the same phone-shaped frame (390 × 844), so the carousel is uniform. */
export const THEME_CARD_ASPECT = 844 / 390;
export const themeCardHeight = (_id: ClientLayoutId, width: number) => width * THEME_CARD_ASPECT;

function sameFace(
  prev: { id: ClientLayoutId; brand: Brand; listings: ManagedListing[]; portraitSource?: number; width: number; radius?: number },
  next: { id: ClientLayoutId; brand: Brand; listings: ManagedListing[]; portraitSource?: number; width: number; radius?: number },
) {
  return prev.id === next.id
    && prev.width === next.width
    && (prev.radius ?? 18) === (next.radius ?? 18)
    && prev.portraitSource === next.portraitSource
    && prev.brand.portraitUrl === next.brand.portraitUrl
    && prev.brand.layoutId === next.brand.layoutId
    && prev.brand.theme === next.brand.theme
    && prev.brand.realtor === next.brand.realtor
    && prev.listings === next.listings
    && prev.brand.curated === next.brand.curated
    && prev.brand.concierge === next.brand.concierge;
}

/** One miniature theme preview. Memoised: carousels move these, never rebuild them. */
export default memo(function ThemeFace({ id, brand, listings, portraitSource, width, radius = 18 }: {
  id: ClientLayoutId; brand: Brand; listings: ManagedListing[]; portraitSource?: number; width: number; radius?: number;
}) {
  const scale = width / 390;
  // A phone viewport, not a shrunken full-page screenshot. Scrollable content
  // continues below the card exactly as it does in the full preview.
  return <View accessibilityLabel={themeDesign(id).name}
    style={{ width, height: width * THEME_CARD_ASPECT, borderRadius: radius, overflow: "hidden",
      borderWidth: 1, borderColor: "#686158", backgroundColor: themeDesign(id).background }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, left: 0, width: 390, transform: [{ scale }], transformOrigin: "top left" }}>
      <ReferenceHome brand={brand} portraitSource={portraitSource} listings={listings} width={390} miniature primaryOnly />
    </View>
    {id !== "eliza-editorial" && <View pointerEvents="none" style={{ position: "absolute", bottom: 0, width: 390, transform: [{ scale }], transformOrigin: "bottom left" }}>
      <ThemeNavigation brand={brand} miniature />
    </View>}
  </View>;
}, sameFace);
