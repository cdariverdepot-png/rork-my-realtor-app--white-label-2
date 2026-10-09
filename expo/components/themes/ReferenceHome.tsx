import Pressable from '../TactilePressable';
import { listingStatusLabel } from "@/lib/listingStatusLabel";
import React, { useMemo } from "react";
import { Animated, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import PortraitImage from "../PortraitImage";
import { ArrowRight, ChevronRight, Heart, Phone, MessageCircle, CalendarDays, UserPlus, KeyRound, Star, House, BellRing, TrendingUp, ConciergeBell, ShieldCheck, type LucideIcon } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { visibleSections, type ClientSectionId } from "@/constants/sections";
import { orderThemeSections } from "@/constants/themeStructure";
import { themeDesign } from "@/constants/themeDesigns";
import { withThemeSlots } from "@/constants/themeSlots";
import { collectionHeading } from "@/lib/collectionHeading";
import ThemeHero from "../ThemeHero";
import ThemeContentSection from "../ThemeContentSection";
import LiveThemeHome from "./LiveThemeHome";
import WebsiteHome from './WebsiteHome';
import { SERIF, type HeroProps } from "./shared";
import { specLine } from "@/lib/listingSpecs";

export type ReferenceRoute = "/listings" | "/message" | "/favorites" | "/calendar" | "/insights" | "/notifications" | "/account" | "/book" | "/documents" | "/note";
export type ReferenceHomeProps = { brand: Brand; portraitSource?: number; listings: ManagedListing[]; width?: number; scrollY?: Animated.Value; topInset?: number; miniature?: boolean; primaryOnly?: boolean;
  onNavigate?: (route: ReferenceRoute) => void; onCall?: () => void; onOpen?: (id: string) => void; onFavorite?: (id: string) => void; isFavorite?: (id: string) => boolean;
  recommendedIds?: string[]; recommendationLabel?: string;
  onContact?: (channel: "call" | "text" | "email") => void; renderAdditional?: (section: ClientSectionId) => React.ReactNode };
type CardKind = "coastal" | "journal" | "discovery" | "burgundy" | "nora" | "mina" | "editorial";

export default function ReferenceHome(p: ReferenceHomeProps) {
  if (p.brand.presentation === 'website' && p.brand.websiteDesign) return <WebsiteHome {...p} />;
  return p.miniature ? <CarouselReferenceHome {...p} /> : <LiveThemeHome {...p} />;
}

function CarouselReferenceHome(p: ReferenceHomeProps) {
  const window = useWindowDimensions();
  const width = p.width ?? window.width, s = width / 390;
  // The theme owns the layout; the profile only fills its slots.
  const b = useMemo(() => withThemeSlots(p.brand), [p.brand]), r = b.realtor, d = themeDesign(b.layoutId, b.theme);
  const items = p.listings.filter(item => !item.hidden && !item.sourceArchived);
  const visible = visibleSections({ brand: b, visibleListingCount: items.length });
  const has = (id: ClientSectionId) => visible.includes(id);
  const nav = (route: ReferenceRoute) => p.onNavigate ? () => p.onNavigate?.(route) : undefined;
  const first = r.name.trim().split(/\s+/)[0] || "your realtor";
  const text = (copy: string, size: number, color = d.ink, serif = false) => <Text style={{ color, fontSize: size * s, fontFamily: serif ? SERIF : "Inter_400Regular" }}>{copy}</Text>;
  const title = (copy: string, color = d.ink) => <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: SERIF, color, fontSize: Math.min(22, 300 / Math.max(1, copy.length * 0.5)) * s }}>{copy.replace(/\s+/g, " ")}</Text>;
  const portrait = <PortraitImage uri={b.portraitUrl} contentFit="contain" style={{ width: 41 * s, height: 41 * s, borderRadius: 23 * s }} />;
  const saved = p.isFavorite ? items.filter(item => p.isFavorite?.(item.id)) : [];
  const heroProps: HeroProps = { brand: b, portraitSource: p.portraitSource, width, scrollY: p.scrollY, preview: p.miniature, topInset: p.topInset,
    onBrowse: nav("/listings"), onMessage: nav("/message"), onSaved: nav("/favorites"), onSchedule: nav("/calendar"), onCall: p.onCall, onNotifications: nav("/notifications") };
  const favorite = (item: ManagedListing, bottom = false) => <Pressable disabled={!p.onFavorite} onPress={() => p.onFavorite?.(item.id)} accessibilityRole="button"
    accessibilityLabel={p.isFavorite?.(item.id) ? "Remove saved home" : "Save home"} accessibilityState={{ selected: !!p.isFavorite?.(item.id) }}
    style={{ position: "absolute", right: 4 * s, top: bottom ? undefined : 3 * s, bottom: bottom ? 3 * s : undefined, padding: 11 * s, width: 44, height: 44, borderRadius: 22, backgroundColor: "#11171388", alignItems: "center", justifyContent: "center", zIndex: 2 }}><Heart color="#FFFCF4" size={18 * s} fill={p.isFavorite?.(item.id) ? d.accent : "transparent"} /></Pressable>;
  const photo = (item: ManagedListing) => <Image source={{ uri: item.images?.[0] || item.image }} contentFit="cover" transition={0} accessibilityLabel={item.title} style={{ position: "absolute", width: "100%", height: "100%" }} />;
  const recommendation = (item: ManagedListing) => p.recommendedIds?.includes(item.id) ? <Text style={{ position: "absolute", left: 7 * s, top: 29 * s, maxWidth: "78%", backgroundColor: "#D4B989EE", color: "#111713", fontSize: 6.5 * s, paddingHorizontal: 7 * s, paddingVertical: 4 * s, borderRadius: 12 * s, letterSpacing: 0.4 * s, zIndex: 3 }}>{p.recommendationLabel || "Recommended by your realtor"}</Text> : null;
  const meta = (item: ManagedListing, size = 8) => <Text style={{ color: "#CDCBC0", fontSize: size * s, marginTop: 6 * s }}>{specLine(item).split(" · ").join("  ·  ")}</Text>;
  const card = (item: ManagedListing, kind: CardKind) => {
    const w = { coastal: 163, journal: 194, discovery: 119, burgundy: 153, nora: 112, mina: 169, editorial: 270 }[kind];
    const h = { coastal: 146, journal: 172, discovery: 192, burgundy: 169, nora: 133, mina: 142, editorial: 280 }[kind];
    const overlay = ["coastal", "discovery", "nora", "editorial"].includes(kind);
    const photoHeight = kind === "mina" ? 87 : kind === "burgundy" ? 113 : kind === "journal" ? 99 : h;
    return <View key={item.id} style={{ width: w * s, height: h * s, borderRadius: (kind === "journal" || kind === "editorial" ? 3 : 8) * s, overflow: "hidden", backgroundColor: "#111713", borderWidth: 1, borderColor: d.accent + "33" }}>
      <Pressable disabled={!p.onOpen} onPress={() => p.onOpen?.(item.id)} accessibilityRole="button" accessibilityLabel={item.title} style={{ flex: 1 }}>
        <View style={{ height: photoHeight * s }}>{photo(item)}{recommendation(item)}</View>
        {overlay && <></>}
        {!!listingStatusLabel(item) && <Text numberOfLines={1} style={{ position: "absolute", top: 7 * s, left: 7 * s, maxWidth: "70%", backgroundColor: kind === "burgundy" ? "#641326" : kind === "discovery" ? "#DAB27A" : "#111713E8", color: kind === "discovery" ? "#121610" : "#F3EBDC", fontSize: 6 * s, padding: 4 * s, borderRadius: kind === "discovery" ? 12 * s : 2 * s, letterSpacing: 0.6 * s }}>{listingStatusLabel(item).toUpperCase()}</Text>}
        <View style={{ position: overlay ? "absolute" : "relative", bottom: overlay ? 9 * s : undefined, left: overlay ? 8 * s : undefined, right: overlay ? 8 * s : undefined, padding: overlay ? 0 : 8 * s }}>
          {kind === "coastal" ? <>{text(item.neighborhood || item.title, 9, "#FFFAEF")}{text(item.price, 10, "#FFFAEF")}</> : kind === "burgundy" ? <>{text(item.price, 19, "#FFF8ED", true)}{text(item.neighborhood || item.title, 9, "#D8B480")}{meta(item, 7)}</> : <>
            {kind === "journal" && <Text numberOfLines={1} style={{ color: d.accent, fontSize: 6 * s, letterSpacing: 1 * s, marginBottom: 5 * s }}>{item.neighborhood?.toUpperCase()}</Text>}
            <Text numberOfLines={kind === "mina" ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: "#FCF5E8", fontFamily: SERIF, fontSize: (kind === "journal" ? 16 : 13) * s }}>{item.title}</Text>
            {kind !== "journal" && <Text numberOfLines={1} style={{ color: "#D2CDBF", fontSize: 7 * s, marginTop: 4 * s }}>{item.neighborhood}</Text>}
            <Text style={{ color: "#FFF9ED", fontSize: (kind === "mina" ? 11 : 9) * s, marginTop: 5 * s }}>{item.price}</Text>
            {kind === "discovery" && meta(item, 6)}
          </>}
        </View>
      </Pressable>{favorite(item, kind === "coastal")}
    </View>;
  };
  const row = (kind: CardKind, list = items) => <ScrollView horizontal showsHorizontalScrollIndicator={false} style={kind === "coastal" ? { marginHorizontal: 15 * s } : undefined} contentContainerStyle={{ gap: (kind === "discovery" ? 8 : 10) * s, paddingHorizontal: (kind === "coastal" ? 0 : 20) * s }}>{list.map(item => card(item, kind))}</ScrollView>;
  const heading = (label: string, options: { light?: boolean; eyebrow?: boolean; small?: boolean } = {}) => <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 23 * s, paddingTop: (options.small ? 6 : b.layoutId === "private-collection" ? 9 : 14) * s, paddingBottom: (options.small ? 6 : b.layoutId === "private-collection" ? 8 : 13) * s, gap: 12 * s }}>
    <View style={{ flex: 1 }}>{options.eyebrow && !!b.curated.eyebrow && <Text style={{ color: d.accent, fontSize: 7 * s, letterSpacing: 1.4 * s, marginBottom: 4 * s }}>{b.curated.eyebrow.toUpperCase()}</Text>}
      {options.small ? <Text numberOfLines={1} style={{ color: d.accent, fontSize: 8 * s, letterSpacing: 1.8 * s }}>{label.replace(/\s+/g, " ").toUpperCase()}</Text> : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: SERIF, fontSize: (b.layoutId === "coastal-personal" ? 19 : 22) * s, color: options.light ? "#232B26" : d.ink }}>{label.replace(/\s+/g, " ")}</Text>}</View>
    <Pressable disabled={!p.onNavigate} onPress={nav("/listings")} accessibilityRole="button" accessibilityLabel="View all homes" style={{ flexDirection: "row", gap: 7 * s, paddingVertical: (options.small ? 3 : 8) * s }}>{text("View all", 11, d.accent)}<ArrowRight color={d.accent} size={14 * s} /></Pressable>
  </View>;
  const serviceTile = (name: string, sub: string, Icon: LucideIcon, route: ReferenceRoute) => <Pressable key={name} disabled={!p.onNavigate} onPress={nav(route)} accessibilityRole="button" style={{ flex: 1, minWidth: 0, alignItems: "center", paddingVertical: 14 * s, paddingHorizontal: 4 * s, borderRadius: 9 * s, backgroundColor: "#20211CCC", borderWidth: 1, borderColor: d.accent + "22" }}>
    <Icon size={24 * s} color={d.accent} /><Text numberOfLines={2} style={{ color: "#F1EEE3", fontSize: 11 * s, textAlign: "center", marginTop: 9 * s }}>{name}</Text><Text numberOfLines={2} style={{ color: d.accent, fontSize: 9 * s, textAlign: "center", marginTop: 7 * s, letterSpacing: 0.5 * s }}>{sub}</Text>
  </Pressable>;
  const coastalUtilities = <View style={{ paddingHorizontal: 25 * s, gap: 8 * s, paddingTop: 14 * s, paddingBottom: 12 * s }}>
    <Pressable disabled={!p.onNavigate} onPress={nav("/favorites")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFFB0", borderRadius: 13 * s, padding: 10 * s, gap: 17 * s }}>
      {saved[0] ? <Image source={{ uri: saved[0].image }} style={{ width: 41 * s, height: 41 * s, borderRadius: 24 * s }} /> : <View style={{ width: 41 * s, height: 41 * s, borderRadius: 24 * s, backgroundColor: "#DFE8E4", alignItems: "center", justifyContent: "center" }}><Heart size={24 * s} color="#9F824C" /></View>}
      <View style={{ flex: 1 }}>{text("Saved Homes", 11, "#262B2C")}{text(p.isFavorite ? `${saved.length} properties` : "Your saved properties", 8, "#696A66")}</View><ChevronRight size={17 * s} color="#40443B" />
    </Pressable>
    <Pressable disabled={!p.onCall && !p.onNavigate} onPress={p.onCall || nav("/message")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFFB0", borderRadius: 13 * s, padding: 10 * s, gap: 17 * s }}>
      <View style={{ backgroundColor: "#A78246", borderRadius: 26 * s, padding: 11 * s }}><Phone size={23 * s} color="#FFF6E7" /></View>
      <View style={{ flex: 1 }}>{text("Direct Line Concierge", 11, "#262B2C")}{text(`Tap to contact ${first}`, 8, "#696A66")}</View><ChevronRight size={17 * s} color="#40443B" />
    </Pressable>
  </View>;
  const discoveryUtilities = <View style={{ flexDirection: "row", padding: 16 * s, gap: 6 * s }}>
    {serviceTile("Saved Homes", p.isFavorite ? `${saved.length} SAVED` : "YOUR FAVORITES", Heart, "/favorites")}
    {serviceTile("Client Concierge", "GET IN TOUCH", KeyRound, "/message")}
    {serviceTile("Schedule a Call", "PICK A TIME", CalendarDays, "/calendar")}
    {serviceTile("Refer a Friend", "INTRODUCE SOMEONE", UserPlus, "/message")}
  </View>;
  const noraUtilities = <View style={{ flexDirection: "row", padding: 20 * s, paddingTop: 12 * s, paddingBottom: 8 * s, gap: 8 * s }}>
    {serviceTile("BUY A HOME", "Find your next home", House, "/listings")}{serviceTile("SELL YOUR HOME", "Get in touch", KeyRound, "/message")}
    {serviceTile("EXPLORE LISTINGS", "Homes selected for you", Star, "/listings")}{serviceTile("SCHEDULE A CALL", "Book a consultation", CalendarDays, "/calendar")}
  </View>;
  const minaUtilities = <View style={{ paddingHorizontal: 21 * s, paddingTop: 10 * s, gap: 8 * s }}>
    <Pressable disabled={!p.onNavigate} onPress={nav("/message")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", padding: 11 * s, gap: 12 * s, borderRadius: 7 * s, borderWidth: 1, borderColor: "#AA97633D", backgroundColor: "#20251C" }}>
      <View style={{ borderRadius: 22 * s, padding: 10 * s, borderWidth: 1, borderColor: "#AA9763" }}><ConciergeBell size={23 * s} color="#AA9763" /></View>
      <View style={{ flex: 1 }}><Text style={{ color: "#BFA574", fontSize: 8 * s, letterSpacing: 2 * s }}>CONCIERGE</Text><Text numberOfLines={2} style={{ color: "#C8C2B4", fontSize: 9 * s, marginTop: 5 * s }}>{b.concierge.title || "Personal guidance, directly from your realtor."}</Text></View><ArrowRight size={19 * s} color="#BFA574" />
    </Pressable>
    <Pressable disabled={!p.onNavigate} onPress={nav("/favorites")} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", padding: 11 * s, gap: 10 * s, borderRadius: 7 * s, borderWidth: 1, borderColor: "#AA97633D", backgroundColor: "#20251C" }}>
      <View style={{ flex: 1 }}>{text("Saved homes", 17, "#F5EEDF", true)}<Text style={{ color: "#BFA574", fontSize: 7 * s, letterSpacing: 1.4 * s, marginTop: 4 * s }}>{p.isFavorite ? `${saved.length} PROPERTIES` : "YOUR FAVORITES"}</Text></View>
      <View style={{ flexDirection: "row" }}>{saved.slice(0, 3).map(item => <Image key={item.id} source={{ uri: item.image }} style={{ width: 29 * s, height: 29 * s, borderRadius: 3 * s }} />)}</View><ArrowRight size={18 * s} color="#BFA574" />
    </Pressable>
  </View>;
  const burgundyUtilities = <View style={{ margin: 16 * s, marginTop: 8 * s, borderWidth: 1, borderColor: "#B3925F66", borderRadius: 12 * s, padding: 12 * s, backgroundColor: "#111512" }}>
    <Text style={{ color: "#C7A676", fontSize: 7 * s, letterSpacing: 1.5 * s }}>YOUR PRIVATE ACCESS</Text><View style={{ flexDirection: "row", justifyContent: "space-between" }}>{title(b.concierge.title || "Client Concierge")}{!!b.signatureUrl && <Image source={{ uri: b.signatureUrl }} style={{ width: 70 * s, height: 28 * s }} contentFit="contain" />}</View>
    <View style={{ flexDirection: "row", marginTop: 12 * s }}>{([
      ["Direct\nMessaging", `Chat with ${first}`, MessageCircle, "/message"], ["Saved\nHomes", "Keep your favorites close", Heart, "/favorites"],
      ["Curated\nMatches", "Homes selected for you", House, "/listings"], ["Showing\nRequests", "Book a private tour", CalendarDays, "/calendar"],
    ] as [string, string, LucideIcon, ReferenceRoute][]).map(([label, sub, Icon, route], i) => <Pressable key={route} disabled={!p.onNavigate} onPress={nav(route)} accessibilityRole="button" style={{ flex: 1, alignItems: "center", borderLeftWidth: i ? 1 : 0, borderColor: "#B3925F44", paddingHorizontal: 5 * s }}>
      <Icon color="#C7A676" size={22 * s} /><Text style={{ fontFamily: SERIF, color: "#FFF6E7", fontSize: 12 * s, lineHeight: 12 * s, textAlign: "center", marginTop: 8 * s }}>{label}</Text><Text numberOfLines={2} style={{ color: "#BDBAAE", fontSize: 7 * s, textAlign: "center", marginTop: 4 * s }}>{sub}</Text>
    </Pressable>)}</View>
  </View>;
  const stats = [{ value: r.closedVolume, label: "SALES VOLUME", Icon: KeyRound }, { value: b.testimonials.length ? String(b.testimonials.length) : "", label: "TESTIMONIALS", Icon: Star },
    { value: b.credentials.designations[0]?.mark, label: "DESIGNATION", Icon: ShieldCheck }, { value: r.yearsActive > 0 ? `${r.yearsActive}+` : "", label: "YEARS EXPERIENCE", Icon: ShieldCheck }].filter(stat => stat.value);
  const statsBand = stats.length > 0 && <View style={{ marginHorizontal: 16 * s, marginBottom: 10 * s, paddingVertical: 14 * s, flexDirection: "row", borderRadius: 10 * s, borderWidth: 1, borderColor: "#804352", backgroundColor: "#390E19" }}>{stats.map(({ value, label, Icon }) => <View key={label} style={{ flex: 1, alignItems: "center", gap: 5 * s }}><View style={{ flexDirection: "row", gap: 4 * s }}><Icon size={14 * s} color="#C7A676" />{text(value!, 14, "#FFF4E7", true)}</View><Text style={{ color: "#DDD2BD", fontSize: 5.5 * s, letterSpacing: 1 * s }}>{label}</Text></View>)}</View>;
  const featured = has("listings") && items[0] && <View style={{ marginHorizontal: 22 * s, marginTop: -3 * s, height: 176 * s, borderRadius: 11 * s, overflow: "hidden", borderWidth: 1, borderColor: "#9D774833" }}>
    <Pressable disabled={!p.onOpen} onPress={() => p.onOpen?.(items[0].id)} accessibilityRole="button" accessibilityLabel={items[0].title} style={{ flex: 1 }}>{photo(items[0])}{recommendation(items[0])}<></>
      <View style={{ width: "61%", padding: 15 * s, justifyContent: "space-between", flex: 1 }}><Text style={{ color: "#FFF4E4", fontSize: 7 * s, letterSpacing: 1 * s }}>FEATURED PROPERTY</Text><Text numberOfLines={2} style={{ color: "#FFF4E4", fontFamily: SERIF, fontSize: 24 * s, lineHeight: 24 * s }}>{items[0].title}</Text>{text(items[0].neighborhood || "", 8, "#E7DDCF")}<View style={{ height: 1, backgroundColor: "#D1C5AA77", width: "70%" }} />{text(items[0].price, 22, "#CB7856", true)}{meta(items[0], 8)}<Text style={{ color: "#CB7856", fontSize: 8 * s, letterSpacing: 1 * s }}>VIEW DETAILS →</Text></View>
    </Pressable>{favorite(items[0])}
  </View>;
  const market = has("beat") && <View style={{ paddingHorizontal: 20 * s, paddingBottom: 12 * s }}><Pressable disabled={!p.onNavigate} onPress={nav("/insights")} accessibilityRole="button" style={{ padding: 14 * s, borderRadius: 6 * s, backgroundColor: "#111513", borderWidth: 1, borderColor: "#D0B37722", flexDirection: "row", alignItems: "center", gap: 12 * s }}><TrendingUp size={27 * s} color="#BDA475" /><View style={{ flex: 1 }}><Text style={{ color: "#BDA475", fontSize: 6 * s, letterSpacing: 1.3 * s }}>CURRENT MARKET INSIGHT</Text><Text numberOfLines={2} style={{ color: "#E8E4DA", fontFamily: SERIF, fontSize: 17 * s, marginTop: 6 * s }}>{b.beat.headline}</Text></View><ArrowRight size={15 * s} color="#BDA475" /></Pressable></View>;
  // Each primary composition follows its own reference, including section nesting/order.
  let primary: React.ReactNode;
  switch (b.layoutId) {
    case "coastal-personal": primary = <><ThemeHero {...heroProps} /><View style={{ marginTop: -10 * s, marginHorizontal: 11 * s, borderRadius: 20 * s, backgroundColor: "#F8F6F1", paddingBottom: 7 * s }}>
      {has("listings") && <>{heading(b.curated.title || "Curated Collection", { light: true })}{row("coastal")}</>}{has("concierge") && coastalUtilities}</View></>; break;
    case "advisor-journal": primary = <><ThemeHero {...heroProps} />{market}{has("listings") && <>{heading(b.curated.title || "Homes I think you'll love.", { eyebrow: true })}{row("journal")}</>}</>; break;
    case "warm-concierge": primary = <><ThemeHero {...heroProps} />{has("listings") && <>{heading(b.curated.title || "Curated for You")}{row("discovery")}</>}{has("concierge") && discoveryUtilities}</>; break;
    case "private-collection": primary = <><ThemeHero {...heroProps} />{has("listings") && <View style={{ borderWidth: 1, borderColor: "#BD9A5933", borderRadius: 12 * s, marginHorizontal: 8 * s, marginTop: -2 * s, paddingBottom: 7 * s }}>{heading(b.curated.title || "Exclusive Listings", { eyebrow: true })}{row("burgundy")}</View>}{has("concierge") && burgundyUtilities}{has("social") && statsBand}</>; break;
    case "modern-editorial": primary = <><ThemeHero {...heroProps} />{featured}{has("concierge") && noraUtilities}{has("listings") && items.length > 1 && <>{heading(b.curated.title || "Curated for You", { small: true })}{row("nora", items.slice(1))}</>}</>; break;
    case "portrait-statement": primary = <><ThemeHero {...heroProps} /><View style={{ borderTopWidth: 1, borderColor: "#AD966433", borderTopLeftRadius: 10 * s, borderTopRightRadius: 10 * s }}>{has("listings") && <>{heading(b.curated.title || "Featured Properties", { small: true })}{row("mina")}</>}{has("concierge") && minaUtilities}</View></>; break;
    default: primary = <><ThemeHero {...heroProps} />{has("listings") && <View style={{ backgroundColor: "#F8F0E5", paddingBottom: 20 * s }}>{heading(collectionHeading(b.curated.title), { light: true })}{row("editorial")}</View>}</>;
  }
  const consumed: ClientSectionId[] = ["hero", "listings"];
  if (!["eliza-editorial", "advisor-journal"].includes(b.layoutId || "")) consumed.push("concierge");
  return <View style={{ backgroundColor: b.layoutId === "coastal-personal" ? "#F5F1E9" : d.background }}>
    {primary}
    {!p.primaryOnly && orderThemeSections(visible, b.layoutId).filter(id => !consumed.includes(id)).map(id => p.renderAdditional ? p.renderAdditional(id) : <ThemeContentSection key={id} id={id} brand={b} onNavigate={p.onNavigate} onContact={p.onContact} />)}
  </View>;
}
