import Pressable from './TactilePressable';
import React from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { ArrowUpRight, Heart, MessageCircle, CalendarDays, FileText, TrendingUp, Bell, ChevronRight } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ClientSectionId } from "@/constants/sections";
import { themeDesign } from "@/constants/themeDesigns";

type ContentRoute = "/message" | "/favorites" | "/calendar" | "/documents" | "/insights" | "/notifications" | "/account" | "/book" | "/note";
export default function ThemeContentSection({ id, brand: b, onNavigate, onContact }: {
  id: ClientSectionId; brand: Brand; onNavigate?: (route: ContentRoute) => void;
  onContact?: (channel: "call" | "text" | "email") => void;
}) {
  const d = themeDesign(b.layoutId, b.theme);
  const paper = d.light || d.composition === "editorial";
  const background = paper ? "#FBF8F2" : d.background;
  const ink = paper ? "#25312C" : d.ink;
  const muted = paper ? "#62675E" : d.muted;
  const accent = paper ? "#806039" : d.accent;
  const panel = paper ? "#FFFFFF" : d.panel;
  const radius = d.composition === "coastal" ? 24 : d.composition === "minimal" ? 8 : 16;
  const compactTools = ["discovery", "concierge", "property"].includes(d.composition);
  if (id === "beat" && d.composition === "journal") {
    return <View style={{ backgroundColor: d.background, padding: 18 }}><Pressable disabled={!onNavigate} onPress={() => onNavigate?.("/insights")} accessibilityRole="button"
      style={{ borderWidth: 1, borderColor: "#C6AC7D22", borderRadius: 8, backgroundColor: "#171918", padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
      <TrendingUp color={accent} size={28} /><View style={{ flex: 1 }}><Text style={{ color: accent, fontSize: 8, letterSpacing: 1.5, marginBottom: 7 }}>CURRENT MARKET INSIGHT</Text>
        <Text style={{ color: ink, fontFamily: "CormorantGaramond_500Medium", fontSize: 21 }}>{b.beat.headline}</Text>
      </View><ArrowUpRight color={accent} size={17} />
    </Pressable></View>;
  }
  if (id === "concierge" && (compactTools || d.composition === "minimal" || d.composition === "coastal")) {
    const tools: { title: string; route: ContentRoute; icon: typeof Heart }[] = [
      { title: "Saved homes", route: "/favorites", icon: Heart }, { title: "Direct messaging", route: "/message", icon: MessageCircle },
      { title: "Schedule a call", route: "/calendar", icon: CalendarDays }, { title: "Documents", route: "/documents", icon: FileText },
    ];
    return <View style={{ backgroundColor: background, padding: 16 }}>
      {d.composition === "concierge" && <Text style={{ color: ink, fontFamily: "CormorantGaramond_500Medium", fontSize: 27, marginBottom: 16 }}>{b.concierge.title || "Client Concierge"}</Text>}
      <View style={{ flexDirection: compactTools ? "row" : "column", flexWrap: "wrap", gap: 8 }}>
        {tools.map(({ title, route, icon: Icon }) => <Pressable key={route} disabled={!onNavigate} onPress={() => onNavigate?.(route)} accessibilityRole="button"
          style={{ flexGrow: 1, flexBasis: compactTools ? "21%" : "100%", alignItems: compactTools ? "center" : "flex-start", flexDirection: compactTools ? "column" : "row", gap: 12,
            paddingVertical: compactTools ? 20 : 18, paddingHorizontal: 10, borderRadius: d.composition === "coastal" ? 18 : 10, backgroundColor: panel,
            borderWidth: d.composition === "coastal" ? 0 : 1, borderColor: accent + "33" }}>
          <Icon size={compactTools ? 25 : 30} color={accent} /><Text style={{ color: ink, flexShrink: 1, fontSize: compactTools ? 10 : 15, lineHeight: 15, textAlign: compactTools ? "center" : "left" }}>{title}</Text>
          {!compactTools && <ChevronRight color={accent} size={19} style={{ marginLeft: "auto" }} />}
        </Pressable>)}
      </View>
    </View>;
  }
  const text = (copy: string | undefined, large = false) => copy?.trim() ?
    <Text style={{ color: large ? ink : muted, fontSize: large ? 26 : 14, lineHeight: large ? 34 : 23,
      fontFamily: large ? "PlayfairDisplay_500Medium" : "Inter_400Regular", marginBottom: 12 }}>{copy}</Text> : null;
  const link = (label: string, route: ContentRoute) => <Pressable key={route} disabled={!onNavigate}
    onPress={() => onNavigate?.(route)} accessibilityRole="button" style={({ pressed }) => ({
      borderWidth: 1, borderColor: accent + "44", borderRadius: radius, padding: 18, marginTop: 8,
      flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: panel, opacity: pressed ? 0.75 : 1,
    })}><Text style={{ color: ink, fontSize: 14, flex: 1 }}>{label}</Text><ArrowUpRight color={accent} size={18} /></Pressable>;
  const contact = (label: string, channel: "call" | "text" | "email") => <Pressable disabled={!onContact}
    onPress={() => onContact?.(channel)} accessibilityRole="button" style={{ padding: 18, marginTop: 8, borderRadius: radius, borderWidth: 1, borderColor: accent + "44" }}>
    <Text style={{ color: ink }}>{label}</Text>
  </Pressable>;
  let content: React.ReactNode = null;
  switch (id) {
    case "note":
      content = <>{text(b.note.date)}{text(b.note.title, true)}
        {b.note.body.filter(p => p.trim()).map((p, i) => <View key={i}>{text(p)}</View>)}
        {b.note.signoff.trim() !== b.realtor.name.trim() && text(b.note.signoff)}{b.signatureUrl ? <Image source={{ uri: b.signatureUrl }} style={{ width: 160, height: 50 }} contentFit="contain" /> : null}
        {text(b.realtor.name)}{link("Read the full note", "/note")}</>;
      break;
    case "beat":
      content = <>{text(b.beat.headline, true)}{b.beat.bullets.filter(x => x.label?.trim() || x.copy?.trim()).map((item, i) =>
        <View key={i} style={{ flexDirection: "row", gap: 18, paddingVertical: 18, borderTopWidth: 1, borderColor: accent + "44" }}>
          <Text style={{ color: accent, fontSize: 14 }}>{String(i + 1).padStart(2, "0")}</Text>
          <View style={{ flex: 1 }}>{text(item.label, true)}{text(item.copy)}</View>
        </View>)}</>;
      break;
    case "concierge":
      content = <>{text(b.concierge.title || "Your private concierge", true)}
        {link("Saved homes", "/favorites")}{link("Direct messaging", "/message")}{link("Showings & appointments", "/calendar")}
        {link("Documents", "/documents")}{link("Market insights", "/insights")}{link("Notifications", "/notifications")}</>;
      break;
    case "quickContact":
      content = <>{text(b.quickContact.title || "Reach me directly.", true)}{text(b.quickContact.sub.replace(/\{first\}/g, b.realtor.name.trim().split(/\s+/)[0] || "Your realtor"))}
        {b.realtor.phone?.trim() ? contact(b.realtor.phone, "call") : null}
        {b.realtor.email?.trim() ? contact(b.realtor.email, "email") : null}
        {link("Message your realtor", "/message")}{link("Book a showing", "/book")}</>;
      break;
    case "social":
      content = <>{text(b.social.title, true)}
        {b.testimonials.filter(t => t.quote?.trim()).map((t, i) => <View key={i} style={{ padding: 22, marginBottom: 12, backgroundColor: panel, borderRadius: radius }}>
          {text(t.quote)}{text(t.author)}{text(t.detail)}</View>)}
        {b.recentlyClosed.filter(item => item.address?.trim()).map((item, i) =>
          <View key={i} style={{ paddingVertical: 14, borderTopWidth: 1, borderColor: accent + "44" }}>
            {text(item.address)}{text(item.price)}{text(item.days ? `Closed in ${item.days}` : "")}</View>)}</>;
      break;
    case "credentials":
      content = <>{text(b.credentials.title || "Credentials & training", true)}
        {b.credentials.designations.filter(x => x.name?.trim() || x.mark?.trim()).map((x, i) => <View key={i}>{text([x.mark, x.name].filter(Boolean).join(" · "))}</View>)}
        {b.credentials.education.filter(x => x.credential?.trim() || x.institution?.trim()).map((x, i) => <View key={i}>{text([x.credential, x.institution, x.year].filter(Boolean).join(" · "))}</View>)}
        {b.credentials.awards.filter(x => x.title?.trim()).map((x, i) => <View key={i}>{text([x.title, x.issuer, x.year].filter(Boolean).join(" · "))}</View>)}
        {text(b.credentials.memberships.filter(Boolean).join(" · "))}{text(b.credentials.languages.filter(Boolean).join(" · "))}</>;
      break;
    case "support":
      content = <>{text("Let's talk about your move.", true)}
        {b.realtor.phone?.trim() ? <>{contact("Call to book", "call")}{contact("Text to book", "text")}</> : null}
        {b.realtor.email?.trim() ? contact("Email to schedule", "email") : null}
        {link("Schedule a consultation", "/book")}</>;
      break;
    case "footer":
      content = <>{text(b.realtor.brandName || b.realtor.name, true)}{text(b.realtor.title)}{text(b.realtor.city)}
        {text(b.realtor.email)}{text([b.credentials.license.brokerage, b.credentials.license.number, b.credentials.license.state].filter(Boolean).join(" · "))}
        {text("Equal Housing Opportunity")}{text(b.copyright)}</>;
      break;
    default: return null;
  }
  return <View style={{ backgroundColor: background, paddingHorizontal: d.composition === "minimal" ? 30 : 24, paddingVertical: d.composition === "minimal" ? 36 : 26 }}>
    {content}
  </View>;
}
