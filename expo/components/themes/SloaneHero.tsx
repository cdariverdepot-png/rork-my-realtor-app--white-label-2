import React from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { MessageCircle, Phone, Search, SlidersHorizontal } from "lucide-react-native";
import { Action, Backdrop, Box, BrandMark, Circle, Headline, Intro, useFrame, type HeroProps } from "./shared";
export default function SloaneHero(p: HeroProps) {
  const f = useFrame(p, 441), { s } = f;
  return <View style={{ height: f.height, overflow: "hidden", backgroundColor: "#24211A" }}>
    <Backdrop p={p} frame={f} colors={["#211D17DF", "#211D1766", "#211D1700"]} />
    <Box x={20} y={29} w={150} s={s}><BrandMark p={p} s={s} color="#FFF9EB" accent="#DDB379" monogramSize={40} divider serif /></Box>
    <Box x={273} y={22} w={99} h={23} s={s}><Action label="CONTACT" s={s} Icon={MessageCircle} iconFirst onPress={p.onMessage} bg="#3B3427CC" color="#F4E7D2" radius={20} /></Box>
    <Animated.View style={[{ position: "absolute", top: f.extraTop, left: 0, right: 0 }, f.fade]}>
      <Box x={20} y={128} w={125} s={s}><Headline copy={`Hi, I’m\n${f.first}.`} s={s} size={48} width={125} height={95} color="#FFF9F0" accent="#E3B77C" italicFrom={0.67} /></Box>
      <Box x={20} y={231} w={32} h={1} s={s} style={{ backgroundColor: "#DDB379" }} />
      <Box x={20} y={247} w={143} s={s}><Intro p={p} s={s} lines={5} color="#F0E9DF" content={f.headline} /></Box>
      <Box x={20} y={334} w={126} h={32} s={s}><Action label={`MESSAGE ${f.first.toUpperCase()}`} s={s} Icon={MessageCircle} iconFirst bg="#DAB582" color="#171713" radius={13} onPress={p.onMessage} /></Box>
      <Box x={157} y={335} s={s}><Circle s={s} color="#DDB379" Icon={Phone} onPress={p.onCall} size={32} /></Box>
    </Animated.View>
    <Box x={20} y={386 + f.extraTop / s} w={350} h={41} s={s}><Pressable disabled={!p.onBrowse} onPress={p.onBrowse} accessibilityRole="button" accessibilityLabel="Search homes" style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 * s, paddingHorizontal: 13 * s, borderWidth: 1, borderColor: "#DDB37944", borderRadius: 14 * s, backgroundColor: "#191A16E8" }}>
      <Search color="#EEECE6" size={19 * s} /><Text style={{ color: "#B9B6AB", flex: 1, fontSize: 9 * s }}>Search homes, locations, or features</Text><SlidersHorizontal color="#DDB379" size={19 * s} />
    </Pressable></Box>
  </View>;
}
