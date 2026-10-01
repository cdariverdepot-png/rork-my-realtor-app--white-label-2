import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

const LOGO = require("@/assets/images/boot-logo-v2.png");

interface Props {
  /** Called once the curtain has fully faded out and the boot screen can unmount. */
  onFinish: () => void;
}

/**
 * Cinematic launch sequence shown over the app on cold start.
 *
 * Sequence:
 *  1. Pure black holds briefly.
 *  2. Logo rises out of darkness.
 *  3. A thin shimmer sweeps across the logo only.
 *  4. Curtain dissolves, revealing the app.
 */
const LOGO_SIZE_RATIO = 0.68;

export default function BootScreen({ onFinish }: Props) {
  const { width } = useWindowDimensions();
  const logoSize = Math.min(width * LOGO_SIZE_RATIO, 260);

  const curtain = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;
  // Shimmer sweep — constrained to logo bounds via overflow hidden on parent
  const sweepX = useRef(new Animated.Value(-1)).current;
  const sweepOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const seq = Animated.sequence([
      // ── beat of pure black ──
      Animated.delay(350),

      // ── logo rises out of darkness ──
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 1200,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 1300,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
      ]),

      // ── breath ──
      Animated.delay(400),

      // ── shimmer sweeps across the logo only ──
      Animated.parallel([
        Animated.timing(sweepX, {
          toValue: 1,
          duration: 1100,
          easing: Easing.bezier(0.3, 0, 0.7, 1),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(sweepOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.delay(380),
          Animated.timing(sweepOpacity, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
        ]),
      ]),

      // ── breathe ──
      Animated.delay(500),

      // ── dissolve: curtain lifts ──
      Animated.timing(curtain, {
        toValue: 0,
        duration: 550,
        easing: Easing.bezier(0.42, 0, 0.58, 1),
        useNativeDriver: true,
      }),
    ]);

    seq.start(({ finished }) => {
      if (finished) onFinish();
    });
  }, [curtain, logoOpacity, logoScale, sweepX, sweepOpacity, onFinish]);

  // Sweep translates from just-left to just-right of the logo
  const sweepTranslate = sweepX.interpolate({
    inputRange: [-1, 1],
    outputRange: [-logoSize * 0.6, logoSize * 1.35],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.fill, { opacity: curtain }]}
    >
      {/* Logo + shimmer — clipped so shimmer never bleeds beyond the logo */}
      <Animated.View
        style={[
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <Animated.View style={styles.logoClip(logoSize)}>
          <Image
            source={LOGO}
            style={styles.logo(logoSize)}
            contentFit="contain"
            transition={0}
          />

          {/* Shimmer — absolutely positioned bar that sweeps within the clipped logo area */}
          <Animated.View
            style={[
              styles.sweep(logoSize),
              {
                opacity: sweepOpacity,
                transform: [
                  { translateX: sweepTranslate },
                  { rotate: "15deg" },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={[
                "rgba(255,255,255,0)",
                "rgba(255,255,255,0.22)",
                "rgba(255,252,240,0.5)",
                "rgba(255,255,255,0.22)",
                "rgba(255,255,255,0)",
              ]}
              locations={[0, 0.3, 0.5, 0.7, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = {
  fill: {
    ...StyleSheet.absoluteFill,
    ...(Platform.OS === "web"
      ? {
          position: "fixed" as const,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%" as const,
          // 100dvh tracks Safari chrome; minHeight fallback for older browsers
          height: "100dvh" as unknown as number,
          minHeight: "100dvh" as unknown as number,
        }
      : {}),
    backgroundColor: "#000000",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    zIndex: 9999,
  },

  logoClip: (size: number) => ({
    width: size,
    height: size,
    overflow: "hidden" as const,
  }),
  logo: (size: number) => ({
    width: size,
    height: size,
  }),
  sweep: (size: number) => ({
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    width: size * 0.28,
  }),
};
