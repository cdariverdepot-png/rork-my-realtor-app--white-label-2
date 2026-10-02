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
  // Hero imagery and copy are stationary; scrolling cannot create or swap interpolation nodes.
  return useMemo(() => ({ imgTranslate: 0, imgScale: 1, topBarOpacity: 1, contentTranslate: 0, contentOpacity: 1 }), []);
}
