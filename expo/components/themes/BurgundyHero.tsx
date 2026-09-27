import React from "react";
import { Animated, View } from "react-native";
import { MessageCircle, Phone, Search } from "lucide-react-native";
import { Action, Backdrop, Box, BrandMark, Circle, Headline, Intro, useFrame, type HeroProps } from "./shared";
export default function BurgundyHero(p: HeroProps) {
  const f = useFrame(p, 370), { s } = f;
  return <View style={{ height: f.height, overflow: "hidden", backgroundColor: "#0A0D0D" }}>
    <Backdrop p={p} frame={f} colors={["#080B0CF9", "#080B0CBB", "#080B0C00"]} />
    <Box x={22} y={18} w={120} s={s}><BrandMark p={p} s={s} color="#FFF6E7" accent="#C7A16C" monogramSize={32} serif divider /></Box>
    <Box x={341} y={25} s={s}><Circle s={s} color="#C7A16C" Icon={Phone} onPress={p.onCall} size={31} /></Box>
    <Animated.View style={[{ position: "absolute", top: f.extraTop, left: 0, right: 0 }, f.fade]}>
      <Box x={24} y={178} w={215} s={s}><Headline copy={f.headline} s={s} size={26} width={215} height={58} color="#FFF9F0" accent="#C7A16C" italicFrom={0.40} /></Box>
      <Box x={24} y={242} w={30} h={1} s={s} style={{ backgroundColor: "#C7A16C" }} />
      <Box x={24} y={250} w={330} s={s}><Intro p={p} s={s} lines={2} color="#F7F1E6" serif /></Box>
      <Box x={24} y={292} w={166} h={33} s={s}><Action label="START YOUR SEARCH" Icon={Search} iconFirst s={s} color="#FFF6E8" bg="#550E20" border="#8D4655" radius={7} onPress={p.onBrowse} /></Box>
      <Box x={200} y={292} w={166} h={33} s={s}><Action label={`MESSAGE ${f.first.toUpperCase()}`} Icon={MessageCircle} iconFirst s={s} color="#D8B67C" border="#C7A16C" radius={7} onPress={p.onMessage} /></Box>
    </Animated.View>
  </View>;
}
