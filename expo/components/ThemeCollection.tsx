import Pressable from './TactilePressable';
import { listingStatusLabel } from "@/lib/listingStatusLabel";
import React from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Heart, ArrowRight, BedDouble, Bath, Maximize } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { liveThemeDesign as themeDesign } from "@/constants/liveThemeDesigns";
import { sectionState } from "@/constants/sections";

export default function ThemeCollection({ brand, listings, width: previewWidth, onOpen, onBrowse, onFavorite, isFavorite }:
  { brand: Brand; listings: ManagedListing[]; width?: number; onOpen?: (id: string) => void;
    onBrowse?: () => void; onFavorite?: (id: string) => void; isFavorite?: (id: string) => boolean }) {
  const window = useWindowDimensions();
  const width = previewWidth ?? window.width;
  const d = themeDesign(brand.layoutId, brand.theme);
  const items = listings.filter(item => !item.hidden && !item.sourceArchived);
  if (sectionState(brand, "listings", items.length > 0) !== "present") return null;
  const c = d.composition;
  const coastal = c === "coastal";
  const discovery = c === "discovery";
  const minimal = c === "minimal";
  const feature = c === "property";
  const editorial = c === "editorial";
  const burgundy = c === "concierge";
  const ink = d.ink;
  const serif = "CormorantGaramond_500Medium";
  const pairedWidth = Math.max(138, (width - 54) / 2);
  const cardWidth = coastal || minimal || c === "journal" ? pairedWidth : discovery ? Math.max(124, (width - 50) / 3) : burgundy ? width * 0.40 : width * 0.73;
  const favorite = (item: ManagedListing) => <Pressable disabled={!onFavorite} onPress={() => onFavorite?.(item.id)} accessibilityRole="button"
    accessibilityLabel={isFavorite?.(item.id) ? "Remove saved home" : "Save home"} accessibilityState={{ selected: !!isFavorite?.(item.id) }}
    style={{ position: "absolute", top: 4, right: 4, width: 44, height: 44, borderRadius: 22, backgroundColor: "#11171388", alignItems: "center", justifyContent: "center", zIndex: 2 }}><Heart size={20} color="#FFF8EC" fill={isFavorite?.(item.id) ? d.accent : "transparent"} /></Pressable>;
  const specs = (item: ManagedListing, size = 9) => <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
    <BedDouble size={12} color={d.accent} /><Text style={{ color: d.muted, fontSize: size }}>{item.beds}</Text>
    <Bath size={12} color={d.accent} /><Text style={{ color: d.muted, fontSize: size }}>{item.baths}</Text>
    <Maximize size={11} color={d.accent} /><Text style={{ color: d.muted, fontSize: size }}>{item.sqft}</Text>
  </View>;
  const image = (item: ManagedListing) => <Image source={{ uri: item.images?.[0] || item.image }} contentFit="cover" transition={0} style={{ position: "absolute", width: "100%", height: "100%" }} accessibilityLabel={item.title} />;
  const badge = (item: ManagedListing) => listingStatusLabel(item) ? <Text style={{ position: "absolute", left: 8, top: 10, maxWidth: "65%", paddingHorizontal: 7, paddingVertical: 5,
    borderRadius: discovery ? 16 : 3, backgroundColor: burgundy ? "#5E1526" : discovery ? "#C7A06B" : "#111713DD", color: discovery ? "#191713" : "#F9F2E8", fontSize: 7, letterSpacing: 0.8 }}>{listingStatusLabel(item).toUpperCase()}</Text> : null;
  const card = (item: ManagedListing, compact = false) => {
    const overlay = coastal || discovery || compact || editorial;
    const height = coastal ? 155 : discovery ? 236 : compact ? 195 : editorial ? 310 : undefined;
    return <View key={item.id} style={{ width: compact ? Math.max(126, (width - 54) / 3) : cardWidth, overflow: "hidden", borderRadius: editorial ? 0 : 10,
      borderWidth: 1, borderColor: d.accent + "33", backgroundColor: coastal ? "#FFFDF8" : d.background }}>
      <Pressable disabled={!onOpen} onPress={() => onOpen?.(item.id)} accessibilityRole="button" accessibilityLabel={item.title}>
        <View style={{ height: height ?? (minimal ? 155 : burgundy ? 180 : 132) }}>
          {image(item)}{badge(item)}
          {overlay && <><></>
            <View style={{ position: "absolute", bottom: 10, left: 9, right: 9 }}>
              <Text style={{ fontFamily: coastal ? "Inter_400Regular" : serif, fontSize: coastal ? 10 : compact ? 16 : 18, color: "#FFF8EF" }}>{coastal ? item.neighborhood || item.title : item.title}</Text>
              {!coastal && !!item.neighborhood && <Text style={{ color: "#E3DFD6", fontSize: 8, marginTop: 4 }}>{item.neighborhood}</Text>}
              <Text style={{ color: "#FFF8EF", fontSize: 10, marginTop: 6 }}>{item.price}</Text>
              {discovery && specs(item, 7)}
            </View></>}
        </View>
        {!overlay && <View style={{ padding: 11 }}>
          {burgundy ? <><Text style={{ color: d.ink, fontFamily: serif, fontSize: 23 }}>{item.price}</Text><Text style={{ color: d.accent, fontSize: 10, marginTop: 5 }}>{item.neighborhood || item.title}</Text>{specs(item)}</> :
            <><Text style={{ color: d.ink, fontFamily: serif, fontSize: minimal ? 20 : 19 }}>{item.title}</Text>
              <Text style={{ color: d.muted, fontSize: 8, letterSpacing: 1.3, marginTop: 7 }}>{item.neighborhood?.toUpperCase()}</Text>
              <Text style={{ color: d.ink, fontSize: 14, marginTop: 9 }}>{item.price}</Text>{!minimal && specs(item)}</>}
        </View>}
      </Pressable>{favorite(item)}
    </View>;
  };
  const heading = <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 17, paddingHorizontal: 18 }}>
    <View style={{ flex: 1 }}>{!coastal && !discovery && !!brand.curated.eyebrow?.trim() && <Text style={{ color: d.accent, fontSize: 8, letterSpacing: 1.7, marginBottom: 6 }}>{brand.curated.eyebrow.toUpperCase()}</Text>}
      {!minimal && <Text style={{ color: ink, fontFamily: serif, fontSize: editorial ? 36 : 25, lineHeight: editorial ? 37 : 27 }}>{brand.curated.title || "Curated for you"}</Text>}
      {minimal && !brand.curated.eyebrow?.trim() && <Text style={{ color: d.accent, fontSize: 9, letterSpacing: 2 }}>FEATURED PROPERTIES</Text>}
    </View><Pressable disabled={!onBrowse} onPress={onBrowse} accessibilityRole="button" accessibilityLabel="View all homes" style={{ padding: 8, flexDirection: "row", gap: 8 }}><Text style={{ color: d.accent, fontSize: 10 }}>View all</Text><ArrowRight size={15} color={d.accent} /></Pressable>
  </View>;
  const heroListing = items[0];
  return <View style={{ backgroundColor: coastal || editorial ? d.panel : d.background, paddingTop: feature ? 0 : 20, paddingBottom: 20,
    borderTopLeftRadius: coastal ? 25 : burgundy ? 18 : 0, borderTopRightRadius: coastal ? 25 : burgundy ? 18 : 0,
    marginTop: coastal || burgundy || feature ? -12 : 0, marginHorizontal: coastal || burgundy ? 10 : 0,
    borderWidth: burgundy ? 1 : 0, borderColor: d.accent + "33" }}>
    {feature ? <>
      <View style={{ marginHorizontal: 20, borderRadius: 16, overflow: "hidden", height: 235 }}>
        <Pressable disabled={!onOpen} onPress={() => onOpen?.(heroListing.id)} accessibilityRole="button" accessibilityLabel={heroListing.title} style={{ flex: 1 }}>
          {image(heroListing)}<></>
          <View style={{ padding: 17, width: "62%", justifyContent: "space-between", flex: 1 }}>
            <Text style={{ color: d.ink, fontSize: 8, letterSpacing: 1.5 }}>FEATURED PROPERTY</Text>
            <Text style={{ color: d.ink, fontFamily: serif, fontSize: 29, lineHeight: 29 }}>{heroListing.title}</Text>
            <Text style={{ color: d.muted, fontSize: 10 }}>{heroListing.neighborhood}</Text>
            <Text style={{ color: d.accent, fontFamily: serif, fontSize: 26 }}>{heroListing.price}</Text>
            {specs(heroListing)}<Text style={{ color: d.accent, fontSize: 9, letterSpacing: 1 }}>VIEW DETAILS →</Text>
          </View>
        </Pressable>{favorite(heroListing)}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginVertical: 13 }}>{items.slice(0, 4).map((item, i) => <View key={item.id} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: i === 0 ? d.accent : "#55564C" }} />)}</View>
      {items.length > 1 && <>{heading}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>{items.slice(1).map(item => card(item, true))}</ScrollView></>}
    </> : <>{heading}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: coastal ? 14 : 18, gap: 10 }} decelerationRate="fast" snapToInterval={cardWidth + 10}>{items.map(item => card(item))}</ScrollView></>}
  </View>;
}
