import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";

export type ReducedMotionState = {
  /** False until AccessibilityInfo resolves — callers must not start entrance motion yet. */
  ready: boolean;
  reduced: boolean;
};

/**
 * Process-wide reduce-motion cache. Every Reveal / hero used to subscribe on its
 * own; staggered ready flips restarted entrances and swapped parallax nodes so
 * the client home flashed off/on while scrolling.
 */
let cachedMotion: ReducedMotionState = { ready: false, reduced: true };
const motionListeners = new Set<(state: ReducedMotionState) => void>();
let motionSubscribed = false;

function publishMotion(next: ReducedMotionState) {
  cachedMotion = next;
  motionListeners.forEach(listener => listener(next));
}

function ensureMotionSubscription() {
  if (motionSubscribed) return;
  motionSubscribed = true;
  let changed = false;
  AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
    changed = true;
    publishMotion({ ready: true, reduced: value });
  });
  AccessibilityInfo.isReduceMotionEnabled().then(value => {
    if (!changed) publishMotion({ ready: true, reduced: value });
  }).catch(() => {
    if (!changed) publishMotion({ ready: true, reduced: false });
  });
}

/**
 * Start unresolved so entrance animations wait for the real preference instead of
 * painting at full opacity and then replaying when `true → false` arrives.
 */
export function useReducedMotion(): ReducedMotionState {
  const [state, setState] = useState<ReducedMotionState>(cachedMotion);
  useEffect(() => {
    ensureMotionSubscription();
    setState(cachedMotion);
    if (cachedMotion.ready) return;
    const listener = (next: ReducedMotionState) => setState(next);
    motionListeners.add(listener);
    return () => { motionListeners.delete(listener); };
  }, []);
  return state;
}

/** Shared demo-derived motion. No profile, navigation or persistence ownership. */
export function useThemeMotion(scrollY: Animated.Value | undefined, height: number, disabled = false, imageTravelLimit = Infinity) {
  const fallback = useRef(new Animated.Value(0)).current;
  const { ready, reduced } = useReducedMotion();
  const sy = scrollY ?? fallback;
  // Freeze the a11y preference after the first answer so a mid-scroll
  // reduceMotionChanged cannot recreate interpolations and flash the tree.
  const frozenReduced = useRef<boolean | null>(null);
  if (ready && frozenReduced.current === null) frozenReduced.current = reduced;
  const still = !ready || (frozenReduced.current ?? true) || disabled;
  const h = Math.max(1, height);
  // Always return Animated nodes (never raw numbers) so parent re-renders and
  // reduce-motion readiness do not remount the parallax Image wrapper.
  return useMemo(() => {
    // Upward travel only — positive translateY was dropping the portrait ~travel
    // limit (~0.25in) over BUY A HOME / action tiles on scroll.
    const travel = still ? 0 : Math.min(h * 0.35, imageTravelLimit);
    const pullScale = still ? 1 : 1.22;
    const pushScale = still ? 1 : 1.05;
    return {
      // Overscroll (pull-down): translate stays 0 — scale-only zoom, never drops
      // into content. Scroll down: classic parallax (image moves UP). Keep scale.
      imgTranslate: sy.interpolate({
        inputRange: [-h, 0, h], outputRange: [0, 0, -travel], extrapolate: "clamp",
      }),
      imgScale: sy.interpolate({
        inputRange: [-h, 0, h], outputRange: [pullScale, 1, pushScale], extrapolate: "clamp",
      }),
      // Scroll-linked opacity fades read as the whole page blinking on bounce /
      // overscroll; parallax is transform-only.
      topBarOpacity: sy.interpolate({
        inputRange: [0, 1], outputRange: [1, 1], extrapolate: "clamp",
      }),
      contentTranslate: sy.interpolate({
        inputRange: [0, h], outputRange: still ? [0, 0] : [0, -36], extrapolate: "clamp",
      }),
      contentOpacity: sy.interpolate({
        inputRange: [0, 1], outputRange: [1, 1], extrapolate: "clamp",
      }),
    };
  }, [sy, h, still, imageTravelLimit]);
}
