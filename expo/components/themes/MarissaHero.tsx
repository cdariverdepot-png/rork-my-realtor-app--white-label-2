import React from "react";
import { View } from "react-native";
import { useHero, Masthead, Photo, Eyebrow, Title, Introduction, Identity, Buttons } from "./heroElements";
import type { HeroProps } from "./shared";
export default function MarissaHero(p: HeroProps) {
const { s, d, width, split, headline } = useHero(p), pad = 22 * s;
return <View style={{ backgroundColor: d.background, paddingHorizontal: pad, paddingBottom: 18 * s }}>
<Masthead p={p} s={s} d={d} />
<View style={{ flexDirection: split ? "row" : "column", gap: 18 * s, alignItems: split ? "center" : "stretch" }}>
<View style={{ flex: split ? 1 : undefined }}><Eyebrow p={p} s={s} d={d} /><Title s={s} d={d} size={split ? 34 : 43}>{headline}</Title><Introduction p={p} s={s} d={d} /><Identity p={p} s={s} d={d} /></View>
<View style={{ alignSelf: "center", backgroundColor: d.panel, borderTopWidth: 1, borderBottomWidth: 1, borderColor: d.accent + "55", paddingVertical: 8 * s }}><Photo p={p} width={split ? 170 * s : width - pad * 2} maxHeight={440 * s} /></View>
</View><Buttons p={p} s={s} d={d} row radius={22} /></View>;
}
