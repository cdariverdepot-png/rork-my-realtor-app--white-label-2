import React, { useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, Filter, FeTurbulence, Rect } from "react-native-svg";

/**
 * Subtle linen / film-grain noise — turns flat cream surfaces into something
 * that reads as woven paper. Pointer-events off so it never blocks taps.
 */
interface Props {
  opacity?: number;
  intensity?: number;
  style?: ViewStyle;
}

export default function GrainOverlay({
  opacity = 0.07,
  intensity = 0.85,
  style,
}: Props) {
  const id = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" style={{ opacity }}>
        <Defs>
          <Filter id={id} x="0" y="0" width="100%" height="100%">
            <FeTurbulence
              type="fractalNoise"
              baseFrequency={intensity}
              numOctaves={2}
              stitchTiles="stitch"
            />
          </Filter>
        </Defs>
        <Rect width="100%" height="100%" filter={`url(#${id})`} />
      </Svg>
    </View>
  );
}
