import React, { useMemo } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Bell } from "lucide-react-native";
import FullPortrait from "../FullPortrait";
import { usePortraitDimensions } from "@/hooks/usePortraitDimensions";
import { themeDesign } from "@/constants/themeDesigns";
import { Action, BrandMark, Circle, Intro, SERIF, ITALIC, type HeroProps } from "./shared";
/** Every theme keeps its visual identity while the portrait and copy occupy separate flow regions. */
export default function AdaptiveHero(p: HeroProps) {
  const window = useWindowDimensions(), width = p.width ?? window.width;
  const s = width / 390, pad = 24 * s, d = themeDesign(p.brand.layoutId, p.brand.theme);
  const photo = usePortraitDimensions(p.brand.portraitUrl, p.portraitSource);
  const side = photo.known && photo.ratio < 0.85 && width >= 360 && window.fontScale <= 1.3 &&
    ["coastal", "property", "minimal", "concierge"].includes(d.composition);
  const centered = d.composition === "minimal", journal = d.composition === "journal";
  const photoWidth = side ? (width - pad * 3) * 0.49 : width - pad * 2;
  const r = p.brand.realtor;
  const signature = useMemo(() => p.brand.signatureUrl ? { uri: p.brand.signatureUrl } : null, [p.brand.signatureUrl]);
  const headline = r.heroMessage.trim() || r.tagline.trim() || r.name;
  const first = r.name.trim().split(/\s+/)[0] || "your realtor";
  const copy = <View style={{ flex: side ? 1 : undefined, gap: 14 * s, paddingVertical: 18 * s }}>
    {!!r.heroEyebrow && <Text style={{ color: d.accent, fontSize: 10 * s, letterSpacing: 2 * s, textAlign: centered ? "center" : "left" }}>{r.heroEyebrow}</Text>}
    <Text style={{ color: d.ink, fontFamily: centered ? ITALIC : SERIF, fontSize: (side ? 32 : journal ? 42 : 46) * s, lineHeight: (side ? 34 : journal ? 44 : 48) * s, textAlign: centered ? "center" : "left" }}>{headline}</Text>
    <View style={{ height: 1, width: 40 * s, backgroundColor: d.accent, alignSelf: centered ? "center" : "flex-start" }} />
    <Intro p={p} s={s} lines={side ? 6 : 5} color={d.muted} serif={journal || centered} />
    <Text style={{ color: d.ink, fontSize: 13 * s, fontFamily: SERIF }}>{r.name}</Text>
    {!!(r.title || r.city) && <Text style={{ color: d.muted, fontSize: 10 * s }}>{[r.title, r.city].filter(Boolean).join(" · ")}</Text>}

    {signature && <Image source={signature} contentFit="contain" transition={0} style={{ width: 130 * s, height: 40 * s }} accessibilityLabel={"Signature of " + r.name} />}
    <View style={{ gap: 10 * s }}>
      <Action s={s} label={r.primaryCta || "Explore homes"} onPress={p.onBrowse} color={d.background} bg={d.accent} radius={d.light || d.composition === "discovery" ? 18 : 2} />
      <Action s={s} label={"Message " + first} onPress={p.onMessage} color={d.ink} border={d.accent} radius={d.light || d.composition === "discovery" ? 18 : 2} />
    </View>
  </View>;
  return <View style={{ backgroundColor: d.background, paddingHorizontal: pad, paddingTop: p.topInset ?? 24 * s, paddingBottom: 20 * s }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 * s, paddingBottom: 22 * s }}>
      <View style={{ flex: 1 }}><BrandMark p={p} s={s} color={d.ink} accent={d.accent} serif={journal} divider={d.composition === "property"} /></View>
      <Circle s={s} color={d.accent} onPress={p.onMessage} />
      {!!p.onNotifications && <Circle s={s} color={d.accent} Icon={Bell} onPress={p.onNotifications} />}
    </View>
    <View style={{ flexDirection: side ? "row-reverse" : "column", alignItems: side ? "center" : "stretch", gap: side ? pad : 0 }}>
      {photo.hasPhoto && <View style={{ backgroundColor: d.panel, borderWidth: d.composition === "concierge" ? 1 : 0, borderColor: d.accent }}><FullPortrait brand={p.brand} source={p.portraitSource} width={photoWidth} ratio={photo.ratio} /></View>}
      {copy}
    </View>
  </View>;
}
