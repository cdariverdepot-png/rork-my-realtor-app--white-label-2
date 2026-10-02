import React, { useMemo } from "react";
import { Image } from "expo-image";
import { Text, View, useWindowDimensions } from "react-native";
import { Bell, Phone } from "lucide-react-native";
import FullPortrait from "../FullPortrait";
import { usePortraitDimensions } from "@/hooks/usePortraitDimensions";
import { themeDesign } from "@/constants/themeDesigns";
import { Action, BrandMark, Circle, Intro, SERIF, ITALIC, type HeroProps } from "./shared";

// Shared elements, not a shared composition: each theme owns its own layout.
export function useHero(p: HeroProps) {
  const window = useWindowDimensions(), width = p.width ?? window.width;
  const s = width / 390, d = themeDesign(p.brand.layoutId, p.brand.theme);
  const photo = usePortraitDimensions(p.brand.portraitUrl, p.portraitSource);
  return { width, s, d, photo, split: photo.known && photo.ratio < 1.15 && window.fontScale <= 1.3 && width >= 340,
    headline: p.brand.realtor.heroMessage.trim() || p.brand.realtor.tagline.trim() || p.brand.realtor.name,
    first: p.brand.realtor.name.trim().split(/\s+/)[0] || "your realtor" };
}
type ElementProps = { p: HeroProps; s: number; d: ReturnType<typeof themeDesign> };
export function Masthead({ p, s, d, serif = false }: ElementProps & { serif?: boolean }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 12 * s, paddingVertical: 20 * s }}>
    <View style={{ flex: 1 }}><BrandMark p={p} s={s} color={d.ink} accent={d.accent} serif={serif} /></View>
    <Circle s={s} color={d.accent} onPress={p.onMessage} />
    {!!p.onNotifications && <Circle s={s} color={d.accent} Icon={Bell} onPress={p.onNotifications} />}
  </View>;
}
export function Photo({ p, width, maxHeight }: { p: HeroProps; width: number; maxHeight?: number }) {
  return <FullPortrait brand={p.brand} source={p.portraitSource} width={width} maxHeight={maxHeight} scrollY={p.scrollY} preview={p.preview} />;
}
export function Eyebrow({ p, s, d, center = false }: ElementProps & { center?: boolean }) {
  return p.brand.realtor.heroEyebrow ? <Text style={{ color: d.accent, fontSize: 9 * s, letterSpacing: 1.7 * s, textAlign: center ? "center" : "left", marginBottom: 12 * s }}>{p.brand.realtor.heroEyebrow.toUpperCase()}</Text> : null;
}
export function Title({ children, s, d, size = 40, italic = false, center = false }: { children: string; s: number; d: ReturnType<typeof themeDesign>; size?: number; italic?: boolean; center?: boolean }) {
  return <Text style={{ fontFamily: italic ? ITALIC : SERIF, fontSize: size * s, lineHeight: size * 1.04 * s, letterSpacing: -0.5 * s, color: d.ink, textAlign: center ? "center" : "left" }}>{children}</Text>;
}
export function Introduction({ p, s, d, serif = false }: ElementProps & { serif?: boolean }) {
  return <View style={{ marginVertical: 15 * s }}><Intro p={p} s={s} lines={4} color={d.muted} serif={serif} /></View>;
}
export function Identity({ p, s, d, center = false }: ElementProps & { center?: boolean }) {
  const signature = useMemo(() => p.brand.signatureUrl ? { uri: p.brand.signatureUrl } : null, [p.brand.signatureUrl]);
  return <View style={{ marginVertical: 12 * s, alignItems: center ? "center" : "flex-start" }}>
    {signature ? <Image source={signature} contentFit="contain" transition={0} style={{ width: 130 * s, height: 35 * s }} accessibilityLabel={"Signature of " + p.brand.realtor.name} /> : <Text style={{ color: d.ink, fontFamily: ITALIC, fontSize: 20 * s }}>{p.brand.realtor.name}</Text>}
    <Text style={{ color: d.muted, fontSize: 8 * s, letterSpacing: 0.7 * s, marginTop: 5 * s }}>{[p.brand.realtor.title, p.brand.realtor.city].filter(Boolean).join(" · ")}</Text>
  </View>;
}
export function Buttons({ p, s, d, row = false, radius = 2, browseLabel }: ElementProps & { row?: boolean; radius?: number; browseLabel?: string }) {
  const first = p.brand.realtor.name.trim().split(/\s+/)[0] || "your realtor";
  return <View style={{ flexDirection: row ? "row" : "column", gap: 9 * s, marginVertical: 12 * s }}>
    <View style={{ flex: row ? 1 : undefined }}><Action s={s} label={browseLabel || p.brand.realtor.primaryCta || "Explore homes"} onPress={p.onBrowse} bg={d.accent} color={d.background} radius={radius} /></View>
    <View style={{ flex: row ? 1 : undefined }}><Action s={s} label={"Message " + first} onPress={p.onMessage} border={d.accent} color={d.ink} radius={radius} /></View>
  </View>;
}
export function DirectLine({ p, s, d }: ElementProps) {
  return <Action s={s} label="Your direct line" onPress={p.onCall || p.onMessage} Icon={Phone} color={d.accent} iconFirst />;
}
