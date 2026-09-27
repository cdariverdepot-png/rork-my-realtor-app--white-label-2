import React from "react";
import { Animated, Text, View } from "react-native";
import { Action, Backdrop, Box, BrandMark, Circle, Headline, Intro, useFrame, type HeroProps } from "./shared";
export default function VanceHero(p: HeroProps) {
  const f = useFrame(p, 440), { s } = f;
  return <View style={{ height: f.height, overflow: "hidden", backgroundColor: "#070909" }}>
    <Backdrop p={p} frame={f} colors={["#050707FC", "#050707AE", "#05070718"]} />
    <Box x={20} y={15} w={244} s={s}><BrandMark p={p} s={s} color="#EEEFEA" accent="#B59B6B" monogramSize={28} /></Box>
    <Box x={341} y={11} s={s}><Circle s={s} color="#B8B6A9" onPress={p.onMessage} size={30} /></Box>
    <Animated.View style={[{ position: "absolute", top: f.extraTop, left: 0, right: 0 }, f.fade]}>
      <Box x={23} y={280} w={250} s={s}><Text numberOfLines={1} style={{ color: "#BAA479", fontSize: 7 * s, letterSpacing: 1.8 * s }}>{p.brand.realtor.heroEyebrow}</Text></Box>
      <Box x={23} y={296} w={250} s={s}><Headline copy={f.headline} s={s} size={28} width={250} height={58} color="#F8F5EC" accent="#BEA575" italicFrom={0.48} /></Box>
      <Box x={23} y={362} w={205} s={s}><Intro p={p} s={s} lines={4} color="#C1C0B9" /></Box>
      <Box x={240} y={378} w={130} h={25} s={s}><Action label="GET TO KNOW ME" onPress={p.onMessage} color="#BAA479" s={s} iconFirst /></Box>
    </Animated.View>
  </View>;
}
