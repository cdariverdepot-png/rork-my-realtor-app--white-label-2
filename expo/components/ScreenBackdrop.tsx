import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { SCREEN_BG, type BackdropKey } from "@/constants/backdrops";
import { safeImageSource } from "@/lib/safeImageSource";

/**
 * Full-bleed photographic ground for a tool screen.
 *
 * Legibility is carried at the top and bottom, where the header chrome and any
 * docked action sit. The middle band stays comparatively open so the
 * photograph keeps its richness behind the content rather than being flattened
 * into a texture — the same treatment the studio sections use.
 */
export default function ScreenBackdrop({
  screen,
  intensity = "standard",
}: {
  screen: BackdropKey;
  /** "deep" for dense, text-heavy screens; "standard" for card layouts. */
  intensity?: "standard" | "deep";
}) {
  void intensity; // reserved for future scrim tuning
  const source = useMemo(() => safeImageSource(SCREEN_BG[screen]), [screen]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="center"
          allowDownscaling={false}
          cachePolicy="memory-disk"
          priority="high"
        />
      ) : null}
    </View>
  );
}
