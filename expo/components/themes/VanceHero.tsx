import React from "react";
import { Text, View } from "react-native";
import { useHero, Masthead, Photo, Eyebrow, Title, Introduction, Identity, Buttons } from "./heroElements";
import type { HeroProps } from "./shared";
export default function VanceHero(p: HeroProps) {
const { s, d, width, split, headline } = useHero(p);
return <View style={{ backgroundColor: d.background }}>
<View style={{ paddingHorizontal: 22 * s }}><Masthead p={p} s={s} d={d} /></View>
<View style={{ flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderBottomWidth: 1, borderColor: d.accent + "55", padding: 13 * s, gap: 12 * s }}><Text style={{ color: d.accent, fontSize: 8 * s, letterSpacing: 3 * s }}>THE JOURNAL</Text><View style={{ height: 1, flex: 1, backgroundColor: d.accent + "55" }} /><Text style={{ color: d.muted, fontSize: 8 * s }}>A PERSONAL PERSPECTIVE</Text></View>
<View style={{ paddingHorizontal: 22 * s, paddingTop: 23 * s }}><Eyebrow p={p} s={s} d={d} /><Title s={s} d={d} size={44}>{headline}</Title></View>
<View style={{ flexDirection: split ? "row" : "column", alignItems: "center", padding: 22 * s, gap: 18 * s }}>
<View style={{ borderLeftWidth: 2, borderColor: d.accent, paddingLeft: 10 * s }}><Photo p={p} width={(width - 74 * s) * 0.58} maxHeight={340 * s} /></View>
<View style={{ flex: 1 }}><Introduction p={p} s={s} d={d} serif /><Identity p={p} s={s} d={d} /></View></View>
<View style={{ paddingHorizontal: 22 * s, paddingBottom: 15 * s }}><Buttons p={p} s={s} d={d} row browseLabel="Discover the collection" /></View></View>;
}
