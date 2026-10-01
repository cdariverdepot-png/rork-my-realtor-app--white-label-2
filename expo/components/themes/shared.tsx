import React, { useState } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle, type ViewStyle } from "react-native";
import PortraitImage from "../PortraitImage";
import { ArrowRight, MessageCircle, X, type LucideIcon } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import { themeDesign } from "@/constants/themeDesigns";
import { useThemeMotion } from "@/hooks/useThemeMotion";
import { imageFrame, imagePosition } from "@/lib/themeImages";

/** Zoom around the chosen focal point; at zoom ≥ 1 the frame always stays filled. Sample portraits are never reframed. */
function zoomStyle(p: { portraitSource?: number; brand: Brand }): ViewStyle {
  if (p.portraitSource !== undefined) return {};
  const f = imageFrame(p.brand.theme, p.brand.layoutId);
  return f.zoom > 1 ? { transform: [{ scale: f.zoom }], transformOrigin: `${f.x}% ${f.y}%` } : {};
}

export type HeroProps = { brand: Brand; portraitSource?: number; width?: number; scrollY?: Animated.Value; preview?: boolean; topInset?: number;
  onBrowse?: () => void; onMessage?: () => void; onSaved?: () => void; onSchedule?: () => void; onCall?: () => void; onNotifications?: () => void };
export const SERIF = "CormorantGaramond_500Medium";
export const ITALIC = "CormorantGaramond_500Medium_Italic";
export function useFrame(p: HeroProps, referenceHeight: number) {
  const window = useWindowDimensions();
  const width = p.width ?? window.width;
  const s = width / 390;
  const extraTop = Math.max(0, (p.topInset ?? 24) - 24);
  const motion = useThemeMotion(p.scrollY, referenceHeight * s, p.preview, 24 * s);
  return { s, extraTop, height: referenceHeight * s + extraTop, d: themeDesign(p.brand.layoutId, p.brand.theme),
    fade: { opacity: motion.contentOpacity, transform: [{ translateY: motion.contentTranslate }] }, motion,
    headline: p.brand.realtor.heroMessage.trim() || p.brand.realtor.tagline.trim() || p.brand.realtor.name,
    first: p.brand.realtor.name.trim().split(/\s+/)[0] || "your realtor" };
}
export function Backdrop({ p, frame, colors, left = 0, vertical = false }: { p: HeroProps; frame: ReturnType<typeof useFrame>; colors: readonly [string, string, ...string[]]; left?: number; vertical?: boolean }) {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {(p.portraitSource !== undefined || !!p.brand.portraitUrl?.trim()) && <Animated.View style={{ position: "absolute", left: left * frame.s, right: 0, top: -28 * frame.s, bottom: -28 * frame.s,
      transform: [{ translateY: frame.motion.imgTranslate }, { scale: frame.motion.imgScale }] }}>
      <View style={[StyleSheet.absoluteFill, zoomStyle(p)]}>
        <PortraitImage source={p.portraitSource} uri={p.brand.portraitUrl} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={imagePosition(p.brand.theme, p.brand.layoutId)} priority="high" accessibilityLabel={`Portrait of ${p.brand.realtor.name}`} />
      </View>
    </Animated.View>}
    <></>
    {!vertical && !frame.d.light && <></>}
  </View>;
}
/** Font size that keeps a one-line label (e.g. a name) inside `width`, never above `max`. */
export function fitSize(text: string, max: number, width: number, perChar = 0.5) {
  return Math.max(9, Math.min(max, width / Math.max(1, text.trim().length * perChar)));
}
export function Box({ x, y, w, h, s, children, style }: { x: number; y: number; w?: number; h?: number; s: number; children?: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ position: "absolute", left: x * s, top: y * s, width: w === undefined ? undefined : w * s, height: h === undefined ? undefined : h * s }, style]}>{children}</View>;
}
export function BrandMark({ p, s, monogramSize = 32, divider = false, serif = false, color, accent }: { p: HeroProps; s: number; monogramSize?: number; divider?: boolean; serif?: boolean; color: string; accent: string }) {
  const r = p.brand.realtor;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 12 * s }}>
    {!!r.monogram && <Text style={{ color: accent, fontFamily: SERIF, fontSize: monogramSize * s, lineHeight: monogramSize * 1.05 * s }}>{r.monogram}</Text>}
    <View style={{ borderLeftWidth: divider ? 1 : 0, borderColor: accent + "88", paddingLeft: divider ? 12 * s : 0, flexShrink: 1 }}>
      <Text numberOfLines={2} style={{ color, fontFamily: serif ? SERIF : "Inter_500Medium", fontSize: (serif ? 13 : 11) * s, letterSpacing: 2 * s }}>{r.brandName || r.name}</Text>
      {!!r.brandSub && <Text numberOfLines={2} style={{ color: accent, fontSize: 7 * s, letterSpacing: 1.5 * s, marginTop: 4 * s }}>{r.brandSub}</Text>}
    </View>
  </View>;
}
/** Fit the shared headline into the reference's typographic region, without changing its words. */
/**
 * Fit the headline into the theme's typographic region without changing its
 * words. A cautious width estimate picks the starting size (and keeps every
 * word whole); the rendered height is then measured and the size steps down
 * until it truly fits, so it can never spill into the text below — whatever
 * the font, platform or copy.
 */
export function Headline({ copy, s, size, width, height, color, accent, italicFrom, style }: { copy: string; s: number; size: number; width: number; height: number; color: string; accent?: string; italicFrom?: number; style?: TextStyle }) {
  // Real serif glyphs run wider than the old estimate; 1.18 keeps words from breaking mid-word.
  const glyph = (letter: string) => (/[ilI.,'!]/.test(letter) ? 0.27 : /[MWmw]/.test(letter) ? 0.9 : 0.54);
  const wordWidth = (token: string, font: number) => [...token].reduce((sum, letter) => sum + glyph(letter), 0) * font;
  const estimateLines = (font: number) => {
    let lines = 1, used = 0;
    for (const word of copy.split(/(\n)/)) {
      if (word === "\n") { lines++; used = 0; continue; }
      for (const token of word.split(/\s+/).filter(Boolean)) {
        const length = wordWidth(token, font);
        if (used && used + length > width) { lines++; used = 0; }
        used += length + font * 0.26;
      }
    }
    return lines;
  };
  const longest = Math.max(1, ...copy.split(/\s+/).filter(Boolean).map(token => wordWidth(token, 1)));
  let fitted = Math.min(size, width / longest);
  while (fitted > 12 && estimateLines(fitted) * fitted * 1.08 > height) fitted -= 0.5;

  // Measured correction: shrink until the rendered block fits its region.
  const [shrink, setShrink] = useState(1);
  const key = `${copy}|${size}|${width}|${height}|${s}`;
  const lastKey = React.useRef(key);
  if (lastKey.current !== key) { lastKey.current = key; if (shrink !== 1) setShrink(1); }
  const font = fitted * shrink;

  const words = [...copy.matchAll(/\S+/g)];
  const split = italicFrom === undefined ? words.length : Math.max(1, Math.round(words.length * italicFrom));
  const splitIndex = split < words.length ? words[split].index! : copy.length;
  return <Text
    onLayout={e => {
      if (e.nativeEvent.layout.height > height * s * 1.03 && shrink > 0.5) setShrink(k => Math.max(0.5, k * 0.92));
    }}
    style={[{ fontFamily: SERIF, fontSize: font * s, lineHeight: font * 1.04 * s, color, letterSpacing: -0.55 * s }, style]}>
    {copy.slice(0, splitIndex)}{split < words.length && <Text style={{ fontFamily: ITALIC, color: accent || color }}>{copy.slice(splitIndex)}</Text>}
  </Text>;
}
export function Intro({ p, s, lines = 4, color, serif = false, content }: { p: HeroProps; s: number; lines?: number; color: string; serif?: boolean; content?: string }) {
  const [open, setOpen] = useState(false);
  const copy = (content ?? p.brand.realtor.welcomeNote).trim();
  if (!copy) return null;
  return <>
    <Pressable disabled={p.preview || copy.length < 100} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Read full introduction">
      <Text numberOfLines={!p.preview && copy.length >= 100 ? Math.max(1, lines - 1) : lines} style={{ color, fontFamily: serif ? SERIF : "Inter_400Regular", fontSize: (serif ? 13 : 10) * s, lineHeight: 15 * s }}>{copy}</Text>
      {!p.preview && copy.length >= 100 && <Text style={{ color, fontSize: 8 * s, textDecorationLine: "underline", marginTop: 3 * s }}>Read introduction</Text>}
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#000000AA" }}>
      <View style={{ maxHeight: "80%", padding: 24, backgroundColor: "#FBF8F2", borderRadius: 16 }}><Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close introduction" style={{ alignSelf: "flex-end", padding: 10 }}><X color="#171713" /></Pressable>
        <ScrollView><Text style={{ color: "#171713", fontSize: 16, lineHeight: 26 }}>{copy}</Text></ScrollView>
      </View></View></Modal>
  </>;
}
export function Action({ label, onPress, s, bg = "transparent", color, border, radius = 3, Icon = ArrowRight, iconFirst = false }: { label: string; onPress?: () => void; s: number; bg?: string; color: string; border?: string; radius?: number; Icon?: LucideIcon; iconFirst?: boolean }) {
  return <Pressable disabled={!onPress} onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, minHeight: 0, paddingHorizontal: 10 * s, paddingVertical: 6 * s,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 * s, backgroundColor: bg, borderColor: border || bg, borderWidth: border ? 1 : 0, borderRadius: radius * s, opacity: pressed ? 0.7 : 1 })}>
    {iconFirst && <Icon size={16 * s} color={color} />}<Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color, fontSize: (label.length > 16 ? 8 : 9) * s, letterSpacing: 0.45 * s, flexShrink: 1 }}>{label}</Text>{!iconFirst && <Icon size={16 * s} color={color} />}
  </Pressable>;
}
export function Circle({ onPress, Icon = MessageCircle, color, s, size = 34 }: { onPress?: () => void; Icon?: LucideIcon; color: string; s: number; size?: number }) {
  return <Pressable disabled={!onPress} onPress={onPress} accessibilityRole="button" accessibilityLabel={Icon === MessageCircle ? "Message your realtor" : "Contact your realtor"} style={{ width: size * s, height: size * s, borderRadius: size * s / 2, borderWidth: 1, borderColor: color + "99", alignItems: "center", justifyContent: "center" }}><Icon size={18 * s} color={color} /></Pressable>;
}
