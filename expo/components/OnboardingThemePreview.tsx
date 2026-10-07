import React, { useState } from "react";
import { View } from "react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import ReferenceHome from "./themes/ReferenceHome";
import ThemeNavigation from "./ThemeNavigation";
import ThemePreviewPage from "./ThemePreviewPage";
import { liveThemeDesign } from "@/constants/liveThemeDesigns";

/**
 * Inline builder preview. Navigation stays inside the preview card so using
 * Listings / Saved / Home never leaves the setup editor or creates a second
 * vertical scroll surface.
 */
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
  const [route, setRoute] = useState("/");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const navigate = (path: string) => setRoute(path);
  const toggleSaved = (id: string) =>
    setSavedIds((ids) =>
      ids.includes(id) ? ids.filter((saved) => saved !== id) : [...ids, id],
    );

  return (
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
      {route === "/" ? (
        <ReferenceHome
          brand={brand}
          listings={listings}
          width={width}
          onNavigate={navigate}
          onOpen={(id) => navigate("/listing/" + id)}
          onFavorite={toggleSaved}
          isFavorite={(id) => savedIds.includes(id)}
          onContact={() => navigate("/message")}
          onCall={() => navigate("/message")}
        />
      ) : (
        <ThemePreviewPage
          route={route}
          brand={brand}
          listings={listings}
          onNavigate={navigate}
          savedIds={savedIds}
          onFavorite={toggleSaved}
          width={width}
        />
      )}
      <ThemeNavigation
        brand={brand}
        preview
        pathname={route}
        saved={savedIds.length}
        onNavigate={navigate}
      />
    </View>
  );
}
