import React from "react";
import { Text, View } from "react-native";
import { useHero, Masthead, Photo, Eyebrow, Title, Introduction, Buttons, DirectLine } from "./heroElements";
import type { HeroProps } from "./shared";
export default function BurgundyHero(p: HeroProps) {
const { s, d, width, split, headline } = useHero(p);
return <View style={{ backgroundColor: d.background, paddingHorizontal: 20 * s, paddingBottom: 18 * s }}>
<Masthead p={p} s={s} d={d} serif />
<View style={{ borderWidth: 1, borderColor: d.accent + "77", padding: 16 * s, backgroundColor: d.panel }}>
<Eyebrow p={p} s={s} d={d} /><Title s={s} d={d} size={39}>{headline}</Title>
<View style={{ flexDirection: split ? "row" : "column", gap: 16 * s, alignItems: "center", marginTop: 20 * s }}>
<Photo p={p} width={(width - 90 * s) * 0.45} maxHeight={280 * s} />
<View style={{ flex: 1 }}><Text style={{ color: d.accent, fontSize: 8 * s, letterSpacing: 1.5 * s }}>PRIVATE ACCESS</Text><Introduction p={p} s={s} d={d} serif /><DirectLine p={p} s={s} d={d} /></View></View>
<Buttons p={p} s={s} d={d} row radius={7} browseLabel="View the collection" /></View></View>;
}
