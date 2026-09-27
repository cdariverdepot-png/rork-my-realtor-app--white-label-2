import React from "react";
import { Animated, Text, View } from "react-native";
import { Bell, MessageCircle, Search } from "lucide-react-native";
import { Action, Backdrop, Box, BrandMark, Circle, Headline, Intro, useFrame, type HeroProps } from "./shared";
export default function NoraHero(p: HeroProps) {
  const f = useFrame(p, 360), { s } = f;
  return <View style={{ height: f.height, overflow: "hidden", backgroundColor: "#121310" }}>
    <Backdrop p={p} frame={f} colors={["#090D09F5", "#090D09A0", "#090D0900"]} />
    <Box x={23} y={25} w={275} s={s}><BrandMark p={p} s={s} color="#F9F1E8" accent="#B96746" monogramSize={38} divider /></Box>
    <Box x={342} y={23} s={s}><Circle Icon={Bell} s={s} color="#DDD9CE" onPress={p.onNotifications} size={30} /></Box>
    <Animated.View style={[{ position: "absolute", top: f.extraTop, left: 0, right: 0 }, f.fade]}>
      <Box x={24} y={83} w={98} s={s}><Text style={{ color: "#C9714E", fontSize: 8 * s, letterSpacing: 1.5 * s }}>{p.brand.realtor.heroEyebrow}</Text></Box>
      <Box x={24} y={108} w={98} s={s}><Headline copy={f.headline} s={s} size={37} width={98} height={88} color="#FFF8EC" accent="#C9714E" italicFrom={0.30} /></Box>
      <Box x={24} y={203} w={26} h={1} s={s} style={{ backgroundColor: "#B96746" }} />
      <Box x={24} y={218} w={146} s={s}><Intro p={p} s={s} lines={4} color="#E3DED1" /></Box>
      <Box x={222} y={270} w={142} h={27} s={s}><Action label="START YOUR SEARCH" Icon={Search} iconFirst s={s} color="#FFF5E8" bg="#B95838" radius={3} onPress={p.onBrowse} /></Box>
      <Box x={222} y={303} w={142} h={27} s={s}><Action label={`MESSAGE ${f.first.toUpperCase()}`} Icon={MessageCircle} iconFirst s={s} color="#F4E9DD" border="#944A2D" radius={3} onPress={p.onMessage} /></Box>
    </Animated.View>
  </View>;
}
