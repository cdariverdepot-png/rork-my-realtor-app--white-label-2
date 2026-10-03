import React, { useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, type PressableProps, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '@/hooks/useThemeMotion';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
/** Single layout/touch node; the target remains at least 44 points. */
export default function TactilePressable({ style, children, disabled, onPressIn, onPressOut, onFocus, onBlur, hitSlop = 4, ...props }: PressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false), [focused, setFocused] = useState(false);
  const { reduced } = useReducedMotion();
  const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed }) : style) ?? {};
  const feedback = (down: boolean) => {
    scale.stopAnimation();
    if (reduced) scale.setValue(1);
    else if (down) scale.setValue(0.975);
    else Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 380, mass: 0.7, useNativeDriver: true }).start();
  };
  return <AnimatedPressable {...props} disabled={disabled} hitSlop={hitSlop}
    accessibilityState={{ ...props.accessibilityState, disabled: !!disabled }}
    onPressIn={event => { if (disabled) return; setPressed(true); feedback(true); if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {}); onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); feedback(false); onPressOut?.(event); }}
    onFocus={event => { const target = event.target as unknown as { matches?: (selector: string) => boolean }; setFocused(Platform.OS === 'web' && !!target.matches?.(':focus-visible')); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }}
    style={[flat, !disabled && { minHeight: Math.max(44, Number(flat.minHeight) || 0), minWidth: Math.max(44, Number(flat.minWidth) || 0) },
      Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer', touchAction: 'manipulation', outlineStyle: focused ? 'solid' : 'none', outlineWidth: 2, outlineColor: '#86BCEB', outlineOffset: 3 } as ViewStyle) : null,
      { opacity: pressed ? 0.78 : flat.opacity ?? 1, transform: [...(Array.isArray(flat.transform) ? flat.transform : []), { scale }] }]}>
    {typeof children === 'function' ? children({ pressed }) : children}
  </AnimatedPressable>;
}
