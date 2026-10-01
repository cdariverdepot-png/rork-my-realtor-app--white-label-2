import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";

export type ReducedMotionState = {
  /** False until AccessibilityInfo resolves — callers must not start entrance motion yet. */
  ready: boolean;
  reduced: boolean;
};

/**
 * Start unresolved so entrance animations wait for the real preference instead of
 * painting at full opacity and then replaying when `true → false` arrives.
 */
export function useReducedMotion(): ReducedMotionState {
  const [state, setState] = useState<ReducedMotionState>({ ready: false, reduced: true });
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      changed = true;
      if (active) setState({ ready: true, reduced: value });
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !changed) setState({ ready: true, reduced: value });
    }).catch(() => {
      if (active && !changed) setState({ ready: true, reduced: false });
    });
    return () => { active = false; subscription.remove(); };
  }, []);
  return state;
}

/** Shared demo-derived motion. No profile, navigation or persistence ownership. */
export function useThemeMotion(scrollY: Animated.Value | undefined, height: number, disabled = false, imageTravelLimit = Infinity) {
  const fallback = useRef(new Animated.Value(0)).current;
  const { ready, reduced } = useReducedMotion();
  const sy = scrollY ?? fallback;
  // Stay still until the preference is known so parallax values do not swap mid-frame.
  const still = !ready || reduced || disabled;
  const h = Math.max(1, height);
  // Always return Animated nodes (never raw numbers) so parent re-renders and
  // reduce-motion readiness do not remount the parallax Image wrapper.
  return useMemo(() => {
    const travelUp = still ? 0 : Math.min(h * 0.5, imageTravelLimit);
    const travelDown = still ? 0 : Math.min(h * 0.35, imageTravelLimit);
    const pullScale = still ? 1 : 1.25;
    const pushScale = still ? 1 : 1.06;
    return {
      imgTranslate: sy.interpolate({
        inputRange: [-h, 0, h], outputRange: [-travelUp, 0, travelDown], extrapolate: "clamp",
      }),
      imgScale: sy.interpolate({
        inputRange: [-h, 0, h], outputRange: [pullScale, 1, pushScale], extrapolate: "clamp",
      }),
      // Keep interactive content perceivable while it remains on screen.
      topBarOpacity: sy.interpolate({
        inputRange: [0, 160, 260], outputRange: still ? [1, 1, 1] : [1, 0.6, 0.35], extrapolate: "clamp",
      }),
      contentTranslate: sy.interpolate({
        inputRange: [0, h], outputRange: still ? [0, 0] : [0, -60], extrapolate: "clamp",
      }),
      contentOpacity: sy.interpolate({
        inputRange: [0, h * 0.55, h * 0.85], outputRange: still ? [1, 1, 1] : [1, 0.85, 0.35], extrapolate: "clamp",
      }),
    };
  }, [sy, h, still, imageTravelLimit]);
}
