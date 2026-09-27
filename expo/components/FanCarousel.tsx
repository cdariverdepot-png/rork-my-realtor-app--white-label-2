import React, { useEffect, useMemo, useRef } from "react";
import { Platform, Pressable, View } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const SPRING = { damping: 22, stiffness: 190, mass: 0.9 };
const tick = () => { if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {}); };

/** Signed distance of card i from the front, wrapped so the fan loops. */
function wrapped(i: number, pos: number, count: number) {
  "worklet";
  const half = count / 2;
  return ((((i - pos + half) % count) + count) % count) - half;
}

function Card({ i, count, pos, gap, left, width, height, rise, radius, onPress, children }: {
  i: number; count: number; pos: SharedValue<number>; gap: number; left: number; width: number; height: number;
  rise: number; radius: number; onPress: (i: number) => void; children: React.ReactNode;
}) {
  const card = useAnimatedStyle(() => {
    const off = wrapped(i, pos.value, count);
    const depth = Math.abs(off);
    return {
      zIndex: Math.round(100 - depth * 10),
      // The card crossing the back of the loop fades out instead of flying across.
      opacity: depth > 3 ? Math.max(0, (count / 2 - depth) * 2) : 1,
      transform: [
        { translateX: off * gap },
        { translateY: Math.min(depth, 3) * rise },
        { scale: 1 - Math.min(depth, 3.5) * 0.09 },
        { rotate: `${off * 2}deg` },
      ],
    };
  });
  const frontRing = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(wrapped(i, pos.value, count)) * 2) }));
  return <Animated.View style={[{ position: "absolute", left, top: 0, width, height }, card]}>
    <Pressable onPress={() => onPress(i)} style={{ flex: 1 }} accessibilityRole="button">
      {children}
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0,
        borderRadius: radius, borderWidth: 2, borderColor: "#D4B989" }, frontRing]} />
    </Pressable>
  </Animated.View>;
}

/**
 * Looping fanned carousel whose motion runs entirely on the UI thread: the fan
 * tracks the finger while held, a flick carries on with momentum, and it always
 * settles on a card. Card contents render once — browsing never re-renders them.
 * A light haptic notch marks each card reaching the front.
 */
export default function FanCarousel({ count, initialIndex, cards, cardWidth, cardHeights, gap, rise = 12, radius = 18,
  onIndexChange, onFrontPress, stepRef, onGesture }: {
  count: number; initialIndex: number; cards: React.ReactNode[]; cardWidth: number; cardHeights: number[]; gap: number; rise?: number; radius?: number;
  onIndexChange: (index: number) => void; onFrontPress?: () => void;
  /** Filled with a function that moves the fan by ±n cards (for arrow buttons). */
  stepRef?: React.MutableRefObject<((delta: number) => void) | null>;
  /** Hands the drag gesture to a parent that needs to yield to it. */
  onGesture?: (gesture: GestureType) => void;
}) {
  const pos = useSharedValue(initialIndex);
  const start = useSharedValue(initialIndex);
  const [width, setWidth] = React.useState(0);
  const frontRef = useRef(initialIndex);

  const changed = (index: number) => { frontRef.current = index; tick(); onIndexChange(index); };
  useAnimatedReaction(
    () => ((Math.round(pos.value) % count) + count) % count,
    (current, previous) => { if (previous !== null && current !== previous) runOnJS(changed)(current); },
  );

  const moveBy = (delta: number) => { pos.value = withSpring(Math.round(pos.value) + delta, SPRING); };
  useEffect(() => { if (stepRef) stepRef.current = moveBy; });

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart(() => { start.value = pos.value; })
    .onUpdate(e => { pos.value = start.value - e.translationX / gap; })
    .onEnd(e => {
      // Momentum: a quick flick travels further before settling on a card.
      const target = Math.round(pos.value - (e.velocityX / gap) * 0.18);
      pos.value = withSpring(target, { ...SPRING, velocity: -e.velocityX / gap });
    }), [gap]);
  useEffect(() => { onGesture?.(pan); }, [pan, onGesture]);

  const press = (i: number) => {
    if (i === frontRef.current) { onFrontPress?.(); return; }
    // Shortest way round the loop to the tapped card.
    const delta = ((((i - frontRef.current + count / 2) % count) + count) % count) - count / 2;
    moveBy(Math.round(delta));
  };

  return <GestureDetector gesture={pan}>
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} collapsable={false}
      style={{ height: Math.max(...cardHeights) + rise * 3 + 12, overflow: "hidden" }}>
      {width > 0 && cards.map((face, i) => <Card key={i} i={i} count={count} pos={pos} gap={gap}
        left={(width - cardWidth) / 2} width={cardWidth} height={cardHeights[i]} rise={rise} radius={radius} onPress={press}>{face}</Card>)}
    </View>
  </GestureDetector>;
}
