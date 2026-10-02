import React from "react";
import { Pressable, Text, View } from "react-native";
import { Search, SlidersHorizontal } from "lucide-react-native";
import { useHero, Masthead, Photo, Eyebrow, Title, Introduction, Buttons, DirectLine } from "./heroElements";
import type { HeroProps } from "./shared";
export default function SloaneHero(p: HeroProps) {
const { s, d, width, split, headline, first } = useHero(p);
return <View style={{ backgroundColor: d.background, paddingHorizontal: 20 * s, paddingBottom: 18 * s }}>
<Masthead p={p} s={s} d={d} serif />
<View style={{ flexDirection: split ? "row" : "column", gap: 16 * s, alignItems: "center" }}>
<View style={{ flex: split ? 1 : undefined, width: split ? undefined : "100%" }}><Eyebrow p={p} s={s} d={d} /><Title s={s} d={d} size={split ? 36 : 47} italic>{`Hi, I’m ${first}.`}</Title><Text style={{ color: d.ink, fontSize: 12 * s, lineHeight: 18 * s, marginTop: 17 * s }}>{headline}</Text><Introduction p={p} s={s} d={d} /><DirectLine p={p} s={s} d={d} /></View>
<View style={{ backgroundColor: d.panel, padding: 5 * s, borderLeftWidth: 1, borderColor: d.accent }}><Photo p={p} width={split ? 170 * s : width - 50 * s} maxHeight={400 * s} /></View></View>
<Buttons p={p} s={s} d={d} row radius={14} />
<Pressable disabled={!p.onBrowse} onPress={p.onBrowse} accessibilityRole="button" accessibilityLabel="Search homes" style={{ flexDirection: "row", alignItems: "center", gap: 10 * s, borderRadius: 14 * s, borderWidth: 1, borderColor: d.accent + "66", backgroundColor: "#191A16", padding: 14 * s }}><Search size={18 * s} color={d.accent} /><Text style={{ flex: 1, color: d.muted, fontSize: 10 * s }}>Homes, locations, or features</Text><SlidersHorizontal size={17 * s} color={d.accent} /></Pressable></View>;
}
