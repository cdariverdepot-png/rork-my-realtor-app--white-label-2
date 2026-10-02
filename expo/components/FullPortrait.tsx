import React from "react";
import { View } from "react-native";
import PortraitImage from "./PortraitImage";
import type { Brand } from "@/contexts/BrandContext";
import { usePortraitDimensions } from "@/hooks/usePortraitDimensions";
import { imageFrame, imagePosition } from "@/lib/themeImages";
/** Natural-flow photo panel: only an explicit crop choice enables saved framing. */
export default function FullPortrait({ brand, source, width, ratio: measuredRatio }: { brand: Brand; source?: number; width: number; ratio?: number }) {
  const dimensions = usePortraitDimensions(brand.portraitUrl, source);
  if (!dimensions.hasPhoto) return null;
  const crop = brand.theme.portraitFit === "crop";
  const ratio = crop ? 0.8 : measuredRatio ?? dimensions.ratio;
  const height = Math.min(width / Math.max(0.05, ratio), width * 2.5);
  const frame = crop && source === undefined ? imageFrame(brand.theme, brand.layoutId) : { x: 50, y: 50, zoom: 1 };
  return <View style={{ width, height, overflow: "hidden" }}>
    <PortraitImage source={source} uri={brand.portraitUrl} contentFit={crop ? "cover" : "contain"}
      contentPosition={crop ? imagePosition(brand.theme, brand.layoutId) : "center"}
      style={{ width: "100%", height: "100%", ...(frame.zoom > 1 ? { transform: [{ scale: frame.zoom }], transformOrigin: `${frame.x}% ${frame.y}%` } : {}) }}
      priority="high" accessibilityLabel={"Portrait of " + brand.realtor.name} />
  </View>;
}
