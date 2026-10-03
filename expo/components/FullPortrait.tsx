import React, { memo } from "react";
import { Animated, View } from "react-native";
import PortraitImage from "./PortraitImage";
import type { Brand } from "@/contexts/BrandContext";
import { usePortraitDimensions } from "@/hooks/usePortraitDimensions";
import { imageFrame, imagePosition } from "@/lib/themeImages";
import { useThemeMotion } from "@/hooks/useThemeMotion";
/** Natural-flow photo panel: only an explicit crop choice enables saved framing. */
function FullPortrait({ brand, source, width, ratio: measuredRatio, maxHeight, scrollY, preview = false }: { brand: Brand; source?: number; width: number; ratio?: number; maxHeight?: number; scrollY?: Animated.Value; preview?: boolean }) {
  const dimensions = usePortraitDimensions(brand.portraitUrl, source);
  const crop = brand.theme.portraitFit === "crop";
  const ratio = crop ? 0.8 : measuredRatio ?? dimensions.ratio;
  const height = Math.min(width / Math.max(0.05, ratio), maxHeight ?? width * 2.5);
  const gutter = scrollY && !preview ? Math.min(24, 14 * width / 390) : 0;
  const motion = useThemeMotion(scrollY, height, preview, gutter);
  const frame = crop && source === undefined ? imageFrame(brand.theme, brand.layoutId) : { x: 50, y: 50, zoom: 1 };
  if (!dimensions.hasPhoto) return null;
  return <View style={{ width, height: height + gutter * 2, paddingTop: gutter, overflow: "hidden" }}>
    <Animated.View style={{ width, height, transform: [{ translateY: motion.imgTranslate }] }}>
    <PortraitImage source={source} uri={brand.portraitUrl} contentFit={crop ? "cover" : "contain"}
      contentPosition={crop ? imagePosition(brand.theme, brand.layoutId) : "center"}
      style={{ width: "100%", height: "100%", ...(frame.zoom > 1 ? { transform: [{ scale: frame.zoom }], transformOrigin: `${frame.x}% ${frame.y}%` } : {}) }}
      priority="high" accessibilityLabel={"Portrait of " + brand.realtor.name} />
    </Animated.View>
  </View>;
}
export default memo(FullPortrait, (a, b) => a.source === b.source && a.width === b.width && a.ratio === b.ratio &&
  a.maxHeight === b.maxHeight && a.scrollY === b.scrollY && a.preview === b.preview &&
  a.brand.portraitUrl === b.brand.portraitUrl && a.brand.realtor.name === b.brand.realtor.name &&
  a.brand.layoutId === b.brand.layoutId && JSON.stringify(a.brand.theme) === JSON.stringify(b.brand.theme));
