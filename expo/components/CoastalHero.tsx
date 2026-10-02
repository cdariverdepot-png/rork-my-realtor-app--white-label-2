import React from "react";
import { Animated } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Brand } from "@/contexts/BrandContext";
import ThemeHero from "./ThemeHero";
/** Shared full PortraitImage panel for previews and client pages. */
export default function CoastalHero({ brand, scrollY }: { brand: Brand; scrollY?: Animated.Value }) {
  const router = useRouter(), insets = useSafeAreaInsets();
  return <ThemeHero brand={brand} scrollY={scrollY} topInset={insets.top + 24}
    onBrowse={() => router.push("/listings")} onMessage={() => router.push("/message")} />;
}
