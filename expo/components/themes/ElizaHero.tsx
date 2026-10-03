import React from "react";
import { Text, View } from "react-native";
import { useHero, Masthead, Photo, Eyebrow, Title, Identity, Buttons } from "./heroElements";
import type { HeroProps } from "./shared";
export default function ElizaHero(p: HeroProps) {
const { s, d, width, headline } = useHero(p);
return <View style={{ backgroundColor: d.background }}>
<View style={{ paddingHorizontal: 22 * s }}><Masthead p={p} s={s} d={d} /></View>
<View style={{ paddingHorizontal: 22 * s, paddingTop: 14 * s }}><Eyebrow p={p} s={s} d={d} /><Title s={s} d={d} size={51}>{headline}</Title></View>
<View style={{ marginTop: 22 * s, paddingHorizontal: 22 * s, flexDirection: "row", alignItems: "center", gap: 9 * s }}>
<View style={{ backgroundColor: "#EFE4D4" }}><Photo p={p} width={width - 68 * s} maxHeight={470 * s} /></View>
<Text style={{ width: 14 * s, color: d.accent, fontSize: 8 * s, letterSpacing: 1.2 * s }}>P{"\n"}E{"\n"}R{"\n"}S{"\n"}O{"\n"}N{"\n"}A{"\n"}L</Text></View>
<View style={{ padding: 22 * s, marginTop: 18 * s, backgroundColor: "#EFE4D4" }}><Identity p={p} s={s} d={{ ...d, ink: "#172019", muted: "#526057" }} /><Buttons p={p} s={s} d={{ ...d, ink: "#172019", background: "#EFE4D4", accent: "#806039" }} row radius={0} /></View></View>;
}
