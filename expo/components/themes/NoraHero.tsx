import React from "react";
import { Text, View } from "react-native";
import { useHero, Masthead, Photo, Eyebrow, Title, Introduction, Buttons } from "./heroElements";
import type { HeroProps } from "./shared";
export default function NoraHero(p: HeroProps) {
const { s, d, width, split, headline } = useHero(p);
return <View style={{ backgroundColor: d.background }}>
<View style={{ paddingHorizontal: 23 * s }}><Masthead p={p} s={s} d={d} /></View>
<View style={{ flexDirection: split ? "row" : "column", alignItems: "stretch" }}>
<View style={{ flex: split ? 1 : undefined, padding: 23 * s, borderTopWidth: 1, borderColor: d.accent }}><Eyebrow p={p} s={s} d={d} /><Title s={s} d={d} size={split ? 37 : 48}>{headline}</Title><Introduction p={p} s={s} d={d} /></View>
<View style={{ backgroundColor: d.panel, alignItems: "center", justifyContent: "center" }}><Photo p={p} width={split ? 190 * s : width} maxHeight={430 * s} /></View></View>
<View style={{ backgroundColor: d.accent, paddingHorizontal: 23 * s, paddingVertical: 12 * s }}><Text style={{ color: d.background, fontSize: 9 * s, letterSpacing: 1.3 * s }}>{[p.brand.realtor.name, p.brand.realtor.city].filter(Boolean).join(" / ").toUpperCase()}</Text></View>
<View style={{ paddingHorizontal: 23 * s, paddingVertical: 7 * s }}><Buttons p={p} s={s} d={d} row /></View></View>;
}
