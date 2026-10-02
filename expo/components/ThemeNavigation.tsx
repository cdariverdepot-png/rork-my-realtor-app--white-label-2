import React from "react";
import { Pressable, Text, View } from "react-native";
import { Home, Search, Heart, MessageCircle, UserRound, CalendarDays, Menu, Layers, Ellipsis } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import { themeDesign } from "@/constants/themeDesigns";
export type ThemeRoute = "/" | "/listings" | "/favorites" | "/message" | "/calendar" | "/account" | "/menu";
export default function ThemeNavigation({ brand, onNavigate, pathname = "/", unread = 0, saved = 0, preview = false }: { brand: Brand; onNavigate?: (route: ThemeRoute) => void; pathname?: string; unread?: number; saved?: number; preview?: boolean }) {
  const d = themeDesign(brand.layoutId, brand.theme);
  const discovery = d.composition === "discovery";
  const coastal = d.composition === "coastal";
  const journal = d.composition === "journal";
  const burgundy = d.composition === "concierge";
  const minimal = d.composition === "minimal";
  const nora = d.composition === "property";
  const tabs: [string, ThemeRoute, typeof Home][] = coastal ? [["Home", "/", Home], ["Collection", "/listings", Layers], ["Saved", "/favorites", Heart], ["Profile", "/account", UserRound]] :
    discovery ? [["Discover", "/", Home], ["Saved", "/favorites", Heart], ["Concierge", "/message", MessageCircle], ["Schedule", "/calendar", CalendarDays], ["Menu", "/menu", Menu]] :
    journal ? [["Home", "/", Home], ["Collection", "/listings", Heart], ["Concierge", "/message", MessageCircle], ["Schedule", "/calendar", CalendarDays], ["Profile", "/account", UserRound]] :
    burgundy ? [["Home", "/", Home], ["Search", "/listings", Search], ["Favorites", "/favorites", Heart], ["Messages", "/message", MessageCircle], ["More", "/menu", Ellipsis]] :
    [["Home", "/", Home], [minimal ? "Discover" : "Search", "/listings", Search], ["Saved", "/favorites", Heart], ["Messages", "/message", MessageCircle], ["Profile", "/account", UserRound]];
  return <View style={{ backgroundColor: coastal ? "#F8F5EF" : d.background, paddingHorizontal: nora ? 0 : coastal ? 12 : 9, paddingTop: 4, paddingBottom: 8 }}>
    <View style={{ flexDirection: "row", backgroundColor: coastal ? "#FFFDFA" : nora ? "#111410" : minimal ? "#20251B" : "#171A16", borderRadius: coastal || discovery || journal ? 24 : nora ? 0 : 10, borderWidth: nora ? 0 : 1, borderTopWidth: 1, borderColor: d.accent + "33", paddingVertical: coastal ? 13 : 8 }}>
      {tabs.map(([originalLabel, originalRoute, OriginalIcon]) => {
        const route = preview && originalRoute === '/account' ? '/menu' : originalRoute;
        const label = preview && originalRoute === '/account' ? 'Menu' : originalLabel;
        const Icon = preview && originalRoute === '/account' ? Menu : OriginalIcon;
        const active = route === "/" ? pathname === "/" : route === '/menu' ? ['/menu', '/documents', '/notifications', '/insights', '/legal', '/note'].includes(pathname) : route === '/account' ? pathname === '/account' || pathname === '/client-profile' : pathname.startsWith(route);
        const count = route === "/message" ? unread : route === "/favorites" ? saved : 0;
        return <Pressable key={route} disabled={!onNavigate} onPress={() => onNavigate?.(route)} accessibilityRole="button" accessibilityLabel={label}
          accessibilityState={{ selected: active }} style={{ flex: 1, alignItems: "center", gap: 8, paddingVertical: 6, minHeight: 44, borderRadius: 9, backgroundColor: burgundy && active ? "#363833" : "transparent" }}>
          <Icon size={22} color={active ? d.accent : d.muted} fill={active && (nora || burgundy) ? d.accent : "transparent"} />
          {count > 0 && <Text style={{ position: "absolute", top: 0, right: 8, backgroundColor: d.accent, color: "#151713", borderRadius: 8, paddingHorizontal: 4, fontSize: 9 }}>{count > 9 ? "9+" : count}</Text>}
          <Text style={{ color: active ? d.accent : d.muted, fontSize: 7, letterSpacing: 0.8 }}>{label.toUpperCase()}</Text>
          {active && discovery && <View style={{ position: "absolute", bottom: -8, height: 2, width: 33, backgroundColor: d.accent, borderRadius: 2 }} />}
        </Pressable>;
      })}
    </View>
  </View>;
}
