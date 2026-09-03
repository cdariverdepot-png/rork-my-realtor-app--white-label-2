import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Props = {
  /** Stagger delay in ms */
  delay?: number;
  /** Distance to slide up (px) */
  distance?: number;
  /** Total tween duration in ms */
  duration?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Subtle one-shot fade + lift on mount. We use this to give the public home
 * a calm, editorial entrance instead of a hard cut.
 */
export default function Reveal({
  delay = 0,
  distance = 18,
  duration = 520,
  children,
  style,
}: Props) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => {
      anim.stop();
    };
  }, [v, delay, duration]);

  return (
    <Animated.View
      style={[
        {
          opacity: v,
          transform: [
            {
              translateY: v.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
