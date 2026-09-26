import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";

/** Start still while the platform preference loads; never flash unwanted motion. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      changed = true;
      if (active) setReduced(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !changed) setReduced(value);
    }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}

/** Shared demo-derived motion. No profile, navigation or persistence ownership. */
export function useThemeMotion(scrollY: Animated.Value | undefined, height: number, disabled = false, imageTravelLimit = Infinity) {
  const fallback = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const sy = scrollY ?? fallback;
  const still = reduced || disabled;
  const h = Math.max(1, height);
  return {
    imgTranslate: still ? 0 : sy.interpolate({
      inputRange: [-h, 0, h], outputRange: [-Math.min(h * 0.5, imageTravelLimit), 0, Math.min(h * 0.35, imageTravelLimit)], extrapolate: "clamp",
    }),
    imgScale: still ? 1 : sy.interpolate({
      inputRange: [-h, 0, h], outputRange: [1.25, 1, 1.06], extrapolate: "clamp",
    }),
    // Keep interactive content perceivable while it remains on screen.
    topBarOpacity: still ? 1 : sy.interpolate({
      inputRange: [0, 160, 260], outputRange: [1, 0.6, 0.35], extrapolate: "clamp",
    }),
    contentTranslate: still ? 0 : sy.interpolate({
      inputRange: [0, h], outputRange: [0, -60], extrapolate: "clamp",
    }),
    contentOpacity: still ? 1 : sy.interpolate({
      inputRange: [0, h * 0.55, h * 0.85], outputRange: [1, 0.85, 0.35], extrapolate: "clamp",
    }),
  };
}
