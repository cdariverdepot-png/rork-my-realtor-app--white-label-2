import React from "react";
import { Animated, Text, View } from "react-native";
import { Action, Backdrop, Box, BrandMark, Circle, Headline, useFrame, type HeroProps } from "./shared";
export default function ElizaHero(p: HeroProps) {
  const f = useFrame(p, 764), { s } = f;
  return <View style={{ height: f.height, overflow: "hidden", backgroundColor: "#152017" }}>
    <Backdrop p={p} frame={f} colors={["#0B160F10", "#0B160F05", "#0B160F25", "#EFE4D49A"]} vertical />
    <Box x={22} y={19} w={270} s={s}><BrandMark p={p} s={s} color="#FFF9F0" accent="#BB9A59" monogramSize={31} /></Box>
    <Box x={334} y={11} s={s}><Circle s={s} color="#D4C6A7" onPress={p.onMessage} size={35} /></Box>
    <Animated.View style={[{ position: "absolute", top: f.extraTop, left: 0, right: 0 }, f.fade]}>
      <Box x={23} y={300} w={336} s={s}><Text style={{ color: "#DEC38E", fontSize: 11 * s, letterSpacing: 2.4 * s }}>{p.brand.realtor.heroEyebrow}</Text></Box>
      <Box x={22} y={332} w={337} s={s}><Headline copy={f.headline} s={s} size={51} width={337} height={202} color="#FFF9EF" /></Box>
      <Box x={23} y={583} w={27} h={1} s={s} style={{ backgroundColor: "#B99C66" }} />
      <Box x={64} y={563} w={272} s={s}><Text style={{ color: "#FFF9EF", fontSize: 14 * s, letterSpacing: 1 * s }}>{p.brand.realtor.name}</Text><Text style={{ color: "#E2DACA", fontSize: 12 * s, lineHeight: 15 * s, marginTop: 5 * s }}>{[p.brand.realtor.title, p.brand.realtor.city].filter(Boolean).join(" · ")}</Text></Box>
      <Box x={23} y={633} w={227} h={64} s={s}><Action label={p.brand.realtor.primaryCta || "Find your home"} s={s} color="#172019" bg="#F9EFE2" onPress={p.onBrowse} radius={0} /></Box>
      <Box x={263} y={653} w={112} h={35} s={s}><Action label="Message me" s={s} color="#FFF4E6" onPress={p.onMessage} /></Box>
      <Box x={23} y={743} w={330} s={s}><Text style={{ color: "#927139", fontSize: 12 * s, letterSpacing: 2 * s }}>{p.brand.curated.eyebrow}</Text></Box>
    </Animated.View>
  </View>;
}
