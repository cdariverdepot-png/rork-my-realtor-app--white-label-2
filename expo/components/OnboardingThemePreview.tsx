import React, { useRef, useState } from "react";
import { Animated, View } from "react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";
import ThemePreviewModal from "./ThemePreviewModal";
import { liveThemeDesign } from "@/constants/liveThemeDesigns";

/** Actual client renderer and actual discovered inventory, never carousel/sample data. */
export default function OnboardingThemePreview({
  brand,
  listings,
  width,
}: {
  brand: Brand;
  listings: ManagedListing[];
  width: number;
}) {
  const scrollY = useRef(new Animated.Value(0)).current,
    d = liveThemeDesign(brand.layoutId, brand.theme);
  const [route, setRoute] = useState<string | null>(null),
    open = (path: string) => setRoute(path);
  return (
    <>
      <View
        style={{
          width,
          height: Math.min(780, width * 2.12),
          borderRadius: 24,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: d.accent + "55",
          backgroundColor: d.background,
        }}
      >
        <Animated.ScrollView
          nestedScrollEnabled
          bounces={false}
          removeClippedSubviews={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          contentContainerStyle={{ paddingBottom: 104 }}
        >
          <ReferenceHome
            brand={brand}
            listings={listings}
            width={width}
            scrollY={scrollY}
            onNavigate={open}
            onOpen={(id) => open("/listing/" + id)}
            onFavorite={() => open("/favorites")}
            onContact={() => open("/message")}
            onCall={() => open("/message")}
          />
        </Animated.ScrollView>
        <View style={{ position: "absolute", bottom: 0, width: "100%" }}>
          <ThemeNavigation brand={brand} preview onNavigate={open} />
        </View>
      </View>
      <ThemePreviewModal
        visible={route !== null}
        initialRoute={route ?? "/"}
        title="Your client app"
        brand={brand}
        listings={listings}
        onClose={() => setRoute(null)}
      />
    </>
  );
}
