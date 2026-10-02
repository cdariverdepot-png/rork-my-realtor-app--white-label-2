import React from "react";
import { Animated, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Brand } from "@/contexts/BrandContext";
import ThemeHero from "./ThemeHero";
/** Shared full PortraitImage panel for previews and client pages. */
export default function ClientLayoutHero({ brand, scrollY }: { brand: Brand; scrollY?: Animated.Value }) {
  const router = useRouter(), insets = useSafeAreaInsets();
  const contact = () => {
    const r = brand.realtor;
    if (r.phone) void Linking.openURL("tel:" + r.phone.replace(/[^+\d]/g, ""));
    else if (r.email) void Linking.openURL("mailto:" + r.email);
    else router.push("/message");
  };
  return <ThemeHero brand={brand} scrollY={scrollY} topInset={insets.top + 24}
    onBrowse={() => router.push("/listings")} onMessage={contact} />;
}
