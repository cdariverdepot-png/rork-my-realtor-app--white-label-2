import React, { useState } from "react";
import { View } from "react-native";
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
  const d = liveThemeDesign(brand.layoutId, brand.theme);
  const [route, setRoute] = useState<string | null>(null),
    open = (path: string) => setRoute(path);
  return (
    <>
      <View
        style={{
          width,
          borderRadius: 24,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: d.accent + "55",
          backgroundColor: d.background,
        }}
      >
        <ReferenceHome
          brand={brand}
          listings={listings}
          width={width}
          onNavigate={open}
          onOpen={(id) => open("/listing/" + id)}
          onFavorite={() => open("/favorites")}
          onContact={() => open("/message")}
          onCall={() => open("/message")}
        />
        <ThemeNavigation brand={brand} preview onNavigate={open} />
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
