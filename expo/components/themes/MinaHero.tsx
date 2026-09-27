import React from "react";
import { Animated, Text, View } from "react-native";
import { MessageCircle } from "lucide-react-native";
import { Action, Backdrop, Box, BrandMark, Circle, Headline, Intro, useFrame, type HeroProps } from "./shared";
export default function MinaHero(p: HeroProps) {
  const f = useFrame(p, 341), { s } = f;
  return <View style={{ height: f.height, overflow: "hidden", backgroundColor: "#101710" }}>
    <Backdrop p={p} frame={f} colors={["#0D160FFC", "#0D160FB0", "#0D160F66"]} />
    <Box x={24} y={40} w={280} s={s}><BrandMark p={p} s={s} color="#FFF8EC" accent="#B49A66" monogramSize={42} /></Box>
    <Box x={343} y={44} s={s}><Circle s={s} color="#B49A66" onPress={p.onMessage} size={30} /></Box>
    <Animated.View style={[{ position: "absolute", top: f.extraTop, left: 0, right: 0 }, f.fade]}>
      <Box x={24} y={107} w={110} s={s}><Text style={{ color: "#B99F6B", fontSize: 8 * s, letterSpacing: 1.7 * s }}>{p.brand.realtor.heroEyebrow}</Text></Box>
      <Box x={24} y={134} w={106} s={s}><Headline copy={f.headline} s={s} size={42} width={106} height={76} color="#F9F6ED" /></Box>
      <Box x={24} y={214} w={14} h={1} s={s} style={{ backgroundColor: "#B49A66" }} />
      <Box x={24} y={224} w={150} s={s}><Intro p={p} s={s} lines={4} color="#C9C4B3" /></Box>
      <Box x={227} y={262} w={139} h={32} s={s}><Action label="Explore homes" s={s} color="#161B10" bg="#AD9061" radius={4} onPress={p.onBrowse} /></Box>
      <Box x={227} y={300} w={139} h={32} s={s}><Action label={`Message ${f.first}`} Icon={MessageCircle} s={s} color="#BFA271" border="#B49A66" radius={4} onPress={p.onMessage} /></Box>
    </Animated.View>
  </View>;
}
