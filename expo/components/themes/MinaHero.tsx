import React from "react";
import { View } from "react-native";
import { useHero, Masthead, Photo, Eyebrow, Title, Introduction, Identity, Buttons } from "./heroElements";
import type { HeroProps } from "./shared";
export default function MinaHero(p: HeroProps) {
const { s, d, width, headline } = useHero(p);
return <View style={{ backgroundColor: d.background, paddingHorizontal: 24 * s, paddingBottom: 18 * s }}>
<Masthead p={p} s={s} d={d} />
<View style={{ alignItems: "center", paddingVertical: 12 * s }}><Eyebrow p={p} s={s} d={d} center /><Title s={s} d={d} size={43} italic center>{headline}</Title>
<View style={{ height: 1, width: 34 * s, backgroundColor: d.accent, marginVertical: 20 * s }} />
<View style={{ borderWidth: 1, borderColor: d.accent + "66", padding: 9 * s }}><Photo p={p} width={Math.min(width - 72 * s, 215 * s)} maxHeight={330 * s} /></View>
<Identity p={p} s={s} d={d} center /></View>
<Introduction p={p} s={s} d={d} serif /><Buttons p={p} s={s} d={d} row radius={4} /></View>;
}
