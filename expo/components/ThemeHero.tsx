import React from "react";
import PortraitImage from "./PortraitImage";
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
  const Component = HEROES[p.brand.layoutId ?? "private-collection"];
  const extraTop = Math.max(0, (p.topInset ?? 24) - 24);
  return <View style={{ paddingTop: extraTop, backgroundColor: themeDesign(p.brand.layoutId, p.brand.theme).background }}><Component {...p} topInset={24} /></View>;
}
