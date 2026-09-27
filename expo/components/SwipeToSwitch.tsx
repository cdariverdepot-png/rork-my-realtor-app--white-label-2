import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { brand, fonts } from "@/constants/colors";

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

type Props = {
  /** Direction the user drags to pull the screen aside. */
  direction: "left" | "right";
  /** Fired only when the revealed button is tapped — never by the drag itself. */
  onTrigger: () => void;
  /** Revealed label, e.g. "LIVE SITE". */
  label: string;
  Icon: IconType;
  enabled?: boolean;
  /** A nested scroller (e.g. a horizontal carousel) that should win over this swipe. */
  waitFor?: GestureType;
  children: React.ReactNode;
};

/** Resting travel when latched open — matches the revealed panel width. */
const OPEN_X = 138;
/** Release past this and the panel latches open; below it, it closes. */
const LATCH = 46;
/** Furthest the sheet travels while dragging. */
const DRAG_MAX = 176;

/**
 * Wraps a screen so it can be dragged aside to reveal a single navigation
 * action, like a drawer. The drag has exactly two resting states — closed and
 * latched open — and never navigates on its own: the user releases, the panel
 * stays put, and they either tap the revealed button or push the screen back.
 */
export default function SwipeToSwitch({
  direction,
  onTrigger,
  label,
  Icon,
  enabled = true,
  waitFor,
  children,
}: Props) {
  const sign = direction === "left" ? -1 : 1;
  const dragX = useRef(new Animated.Value(0)).current;
  /** Latched resting travel in unsigned px: 0 = closed, OPEN_X = open. */
  const base = useRef<number>(0);
  /** Live unsigned travel, so a cancelled gesture can still settle correctly. */
  const travelRef = useRef<number>(0);
  /** Guards against onEnd and onFinalize both settling the same gesture. */
  const settled = useRef<boolean>(true);
  const crossed = useRef<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);

  const settle = useCallback(
    (to: number) => {
      base.current = to;
      travelRef.current = to;
      setOpen(to > 0);
      Animated.spring(dragX, {
        toValue: to * sign,
        useNativeDriver: true,
        tension: 95,
        friction: 13,
      }).start();
    },
    [dragX, sign]
  );

  const close = useCallback(() => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    settle(0);
  }, [settle]);

  /** Land on whichever rest state the current travel is closest in intent to. */
  const settleFromTravel = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    const landOpen = travelRef.current > LATCH;
    if (landOpen !== base.current > 0 && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    settle(landOpen ? OPEN_X : 0);
  }, [settle]);

  const gesture = useMemo(() => {
    const pan =
      Gesture.Pan()
        .enabled(enabled)
        // Once open the sheet must be pushable back, so listen both ways.
        .activeOffsetX(open ? [-12, 12] : direction === "left" ? [-14, 9999] : [-9999, 14])
        // Vertical intent belongs to the scroll view underneath.
        .failOffsetY([-16, 16])
        .runOnJS(true)
        .onBegin(() => {
          settled.current = false;
          crossed.current = base.current > 0;
        })
        .onUpdate((e) => {
          const raw = base.current + e.translationX * sign;
          const travel = Math.max(0, raw);
          travelRef.current = travel;
          // Rubber-band past the stop so the sheet never runs away.
          const eased =
            travel <= DRAG_MAX ? travel : DRAG_MAX + (travel - DRAG_MAX) * 0.22;
          dragX.setValue(eased * sign);

          const past = travel > LATCH;
          if (past !== crossed.current) {
            crossed.current = past;
            if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
          }
        })
        .onEnd(settleFromTravel)
        // A gesture cancelled by the scroll view still has to land somewhere.
        .onFinalize(settleFromTravel);
    return waitFor ? pan.requireExternalGestureToFail(waitFor) : pan;
  }, [direction, enabled, open, sign, dragX, settleFromTravel, waitFor]);

  /** 0 → 1 as the panel opens. */
  const progress = dragX.interpolate({
    inputRange: direction === "left" ? [-OPEN_X, 0] : [0, OPEN_X],
    outputRange: direction === "left" ? [1, 0] : [0, 1],
    extrapolate: "clamp",
  });
  const panelOpacity = progress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0.45, 1],
  });
  const panelScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
  const panelSlide = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sign * -24, 0],
  });
  const Chevron = direction === "left" ? ChevronRight : ChevronLeft;

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents={open ? "box-none" : "none"}
        style={[
          styles.panel,
          direction === "left" ? styles.panelRight : styles.panelLeft,
          {
            opacity: panelOpacity,
            transform: [{ translateX: panelSlide }, { scale: panelScale }],
          },
        ]}
      >
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
            onTrigger();
          }}
          disabled={!open}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={12}
          style={({ pressed }) => [styles.target, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.badge}>
            <LinearGradient
              colors={["rgba(212,185,137,0.28)", "rgba(210,163,67,0.08)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Icon size={22} color={brand.goldLight} strokeWidth={1.7} />
          </View>
          <View style={styles.labelRow}>
            {direction === "right" ? (
              <Chevron size={11} color={brand.goldLight} strokeWidth={2} />
            ) : null}
            <Text style={styles.label}>{label}</Text>
            {direction === "left" ? (
              <Chevron size={11} color={brand.goldLight} strokeWidth={2} />
            ) : null}
          </View>
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.content, { transform: [{ translateX: dragX }] }]}>
          {children}
          {open ? (
            // While latched, the screen itself is inert — tapping it closes.
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  content: { flex: 1 },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: OPEN_X,
    alignItems: "center",
    justifyContent: "center",
  },
  panelRight: { right: 0 },
  panelLeft: { left: 0 },
  target: { alignItems: "center", justifyContent: "center", gap: 12, padding: 16 },
  badge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.45)",
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  label: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 9.5,
    letterSpacing: 2,
  },
});
