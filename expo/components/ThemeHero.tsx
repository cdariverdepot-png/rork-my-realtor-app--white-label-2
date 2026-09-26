import React from "react";
import { Image } from "expo-image";
import { Text, View, useWindowDimensions } from "react-native";
import MarissaHero from "./themes/MarissaHero";
import VanceHero from "./themes/VanceHero";
import SloaneHero from "./themes/SloaneHero";
import BurgundyHero from "./themes/BurgundyHero";
import NoraHero from "./themes/NoraHero";
import MinaHero from "./themes/MinaHero";
import ElizaHero from "./themes/ElizaHero";
import { Action, type HeroProps } from "./themes/shared";
import { themeDesign } from "@/constants/themeDesigns";
export type { HeroProps } from "./themes/shared";
export type ThemeActions = Pick<HeroProps, "onBrowse" | "onMessage" | "onSaved" | "onSchedule" | "onCall" | "onNotifications">;
const HEROES = { "coastal-personal": MarissaHero, "advisor-journal": VanceHero, "warm-concierge": SloaneHero,
  "private-collection": BurgundyHero, "modern-editorial": NoraHero, "portrait-statement": MinaHero, "eliza-editorial": ElizaHero };
export default function ThemeHero(p: HeroProps) {
  const window = useWindowDimensions();
  // Large system text uses flow layout; never clip a user's enlarged introduction.
  if (!p.preview && (window.fontScale > 1.3 || (p.width ?? window.width) < 330)) {
    const d = themeDesign(p.brand.layoutId, p.brand.theme);
    return <View style={{ backgroundColor: d.background, padding: 24, paddingTop: p.topInset ?? 24, gap: 20 }}>
      <Text style={{ color: d.accent, fontSize: 18 }}>{p.brand.realtor.brandName || p.brand.realtor.name}</Text>
      {(p.portraitSource !== undefined || !!p.brand.portraitUrl) && <Image source={p.portraitSource ?? { uri: p.brand.portraitUrl }} style={{ height: 300 }} contentFit="cover" />}
      <Text style={{ color: d.ink, fontSize: 30 }}>{p.brand.realtor.heroMessage || p.brand.realtor.tagline || p.brand.realtor.name}</Text>
      <Text style={{ color: d.muted, fontSize: 17, lineHeight: 26 }}>{p.brand.realtor.welcomeNote}</Text>
      <Action s={1} label="Explore homes" onPress={p.onBrowse} color={d.ink} border={d.accent} />
      <Action s={1} label="Message your realtor" onPress={p.onMessage} color={d.ink} border={d.accent} />
    </View>;
  }
  const Component = HEROES[p.brand.layoutId ?? "private-collection"];
  const extraTop = Math.max(0, (p.topInset ?? 24) - 24);
  return <View style={{ paddingTop: extraTop, backgroundColor: themeDesign(p.brand.layoutId, p.brand.theme).background }}><Component {...p} topInset={24} /></View>;
}
