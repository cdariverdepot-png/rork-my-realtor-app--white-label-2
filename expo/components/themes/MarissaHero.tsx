import React from "react";
import { Animated, Text, View } from "react-native";
import { Image } from "expo-image";
import { Phone, MessageCircle } from "lucide-react-native";
import { Action, Backdrop, Box, BrandMark, Headline, Intro, ITALIC, useFrame, type HeroProps } from "./shared";
/** Marissa reference: 462 × 1000; collection begins at y=488 (0.1px rounding at 390). */
export default function MarissaHero(p: HeroProps) {
  const f = useFrame(p, 422), { s, d } = f;
  return <View style={{ height: f.height, backgroundColor: "#F7F3EC", overflow: "hidden" }}>
    <Backdrop p={p} frame={f} colors={["#F7F3ECFF", "#F7F3ECA8", "#F7F3EC00"]} />
    <Box x={20} y={20} w={246} s={s}><BrandMark p={p} s={s} color="#18232A" accent="#A88954" monogramSize={28} /></Box>
    <Box x={286} y={18} w={86} h={33} s={s}><Action s={s} label="Concierge" Icon={Phone} iconFirst onPress={p.onMessage} color="#6B5636" bg="#FFFCF3BB" border="#C6B99C66" radius={24} /></Box>
    <Animated.View style={[{ position: "absolute", top: f.extraTop, left: 0, right: 0 }, f.fade]}>
      <Box x={23} y={75} w={97} s={s}><Headline copy={f.headline} s={s} size={33} width={97} height={122} color="#12202A" /></Box>
      {!!p.brand.realtor.heroEyebrow && <Box x={23} y={203} w={130} s={s}><Text style={{ color: "#3D4243", fontSize: 7 * s, letterSpacing: 1 * s }}>{p.brand.realtor.heroEyebrow.toUpperCase()}</Text></Box>}
      <Box x={23} y={231} w={31} h={1} s={s} style={{ backgroundColor: "#A88954" }} />
      <Box x={23} y={246} w={154} s={s}><Intro p={p} s={s} lines={3} color="#283338" /></Box>
      <Box x={23} y={296} w={150} h={30} s={s}>{p.brand.signatureUrl ? <Image source={{ uri: p.brand.signatureUrl }} style={{ width: "100%", height: "100%" }} contentFit="contain" /> : <Text style={{ color: "#AB8B56", fontFamily: ITALIC, fontSize: 25 * s }}>{p.brand.realtor.name}</Text>}</Box>
      <Box x={23} y={327} w={166} s={s}><Text numberOfLines={1} style={{ color: "#2A3032", fontSize: 7 * s, letterSpacing: 1.4 * s }}>{p.brand.realtor.title.toUpperCase()}</Text></Box>
      <Box x={23} y={353} w={132} h={39} s={s}><Action s={s} label={`Message ${f.first}`} onPress={p.onMessage} Icon={MessageCircle} bg="#A5844E" color="#FFF9EF" radius={4} /></Box>
    </Animated.View>
  </View>;
}
