import Pressable from "@/components/TactilePressable";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  House,
  Heart,
  MessageCircle,
  CalendarDays,
  Files,
  Bell,
  ChartNoAxesCombined,
  UserRound,
  SlidersHorizontal,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { liveThemeDesign as themeDesign } from "@/constants/liveThemeDesigns";
import { LIVE_THEME_MATERIALS } from "@/constants/liveThemeDesigns";
import { clientDestination } from "@/lib/clientNavigation";
import ModalChrome from "@/components/ModalChrome";

export default function AppMenu() {
  const router = useRouter(),
    auth = useAuth(),
    { brand } = useBrand();
  const preview = auth.isAdmin && auth.viewAsClient,
    d = themeDesign(brand.layoutId, brand.theme);
  const links = [
    ["Browse homes", "/listings"],
    ["Saved homes", "/favorites"],
    ["Messages", "/messages"],
    ["Showings", "/calendar"],
    ["Documents", "/documents"],
    ["Updates", "/notifications"],
    ["Market insights", "/insights"],
    ...(auth.isClient
      ? [
          ["My account", "/account"],
          ["My preferences", "/client-profile"],
        ]
      : []),
    ["Privacy and terms", "/legal"],
  ];
  const icons = [
    House,
    Heart,
    MessageCircle,
    CalendarDays,
    Files,
    Bell,
    ChartNoAxesCombined,
    ...(auth.isClient ? [UserRound, SlidersHorizontal] : []),
    ShieldCheck,
  ];
  return (
    <View style={{ flex: 1, backgroundColor: d.background }}>
      <Image
        source={
          LIVE_THEME_MATERIALS[brand.layoutId ?? "private-collection"].photo
        }
        contentFit="cover"
        transition={0}
        accessible={false}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[d.background + "A8", d.background + "CC", d.background + "F5"]}
        style={StyleSheet.absoluteFill}
      />
      <ModalChrome eyebrow="App menu" onDark={!d.light} />
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 10, paddingBottom: 140 }}
      >
        <Text
          style={{
            color: d.accent,
            fontSize: 10,
            letterSpacing: 2.2,
            marginBottom: 12,
          }}
        >
          YOUR PRIVATE CONNECTION
        </Text>
        {links.map(([label, path], index) => {
          const Icon = icons[index];
          return (
            <Pressable
              key={path}
              accessibilityRole="button"
              onPress={() =>
                router.navigate(clientDestination(path, preview) as never)
              }
              style={{
                minHeight: 76,
                padding: 18,
                borderWidth: 1,
                borderRadius: brand.layoutId === "coastal-personal" ? 24 : 14,
                borderColor: d.accent + "35",
                backgroundColor: d.light ? "#FFFFFFCC" : "#FFFFFF0B",
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
              }}
            >
              <View
                style={{
                  height: 38,
                  width: 38,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: d.accent + "18",
                }}
              >
                <Icon size={19} color={d.accent} strokeWidth={1.6} />
              </View>
              <Text
                style={{
                  color: d.ink,
                  fontSize: 16,
                  fontFamily: "Inter_500Medium",
                  flex: 1,
                }}
              >
                {label}
              </Text>
              <ArrowUpRight size={18} color={d.accent} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
