import React from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Heart } from "lucide-react-native";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { listingStatusLabel } from "@/lib/listingStatusLabel";
import { specLine } from "@/lib/listingSpecs";
import { listingDisplayTitle } from "@/lib/listingTitle";
import { homesCount, listingColumns, listingSurface, listingsHeading, type ListingSurface } from "@/lib/listingSurface";

type CardProps = { item: ManagedListing; surface: ListingSurface; width: number; onOpen?: (id: string) => void;
  onFavorite?: (id: string) => void; favorite?: boolean; recommendation?: string; imageUri?: string };

/** One complete property card: photo, status, price, address, area and the specifications the source published. */
export function ListingCard({ item, surface: t, width, onOpen, onFavorite, favorite, recommendation, imageUri }: CardProps) {
  const status = listingStatusLabel(item);
  const specs = specLine(item, "long");
  return <View testID="listing-card" style={{ width, borderRadius: t.radius, overflow: "hidden", borderWidth: 1, borderColor: t.line, backgroundColor: t.panel }}>
    <Pressable disabled={!onOpen} onPress={() => onOpen?.(item.id)} accessibilityRole="button" accessibilityLabel={[item.title, item.price].filter(Boolean).join(", ")}>
      <View style={{ width: "100%", aspectRatio: 3 / 2, backgroundColor: t.line }}>
        {!!(imageUri || item.images?.[0] || item.image) && <Image source={{ uri: imageUri || item.images?.[0] || item.image }} contentFit="cover" transition={150}
          style={{ position: "absolute", width: "100%", height: "100%" }} accessibilityIgnoresInvertColors />}
        {!!status && <Text style={{ position: "absolute", left: 12, top: 12, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, overflow: "hidden",
          backgroundColor: "#111713D9", color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.6 }}>{status.toUpperCase()}</Text>}
        {!!recommendation && <Text numberOfLines={1} style={{ position: "absolute", left: 12, bottom: 12, maxWidth: "80%", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
          overflow: "hidden", backgroundColor: t.accent, color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 11 }}>{recommendation}</Text>}
      </View>
      <View style={{ padding: 16, gap: 6 }}>
        {!!item.price && <Text style={{ color: t.ink, fontFamily: t.headingFont, fontSize: 24 }}>{item.price}</Text>}
        <Text numberOfLines={2} style={{ color: t.ink, fontFamily: t.bodyFont, fontSize: 16, lineHeight: 22 }}>{listingDisplayTitle(item)}</Text>
        {!!item.neighborhood && <Text numberOfLines={1} style={{ color: t.muted, fontFamily: t.bodyFont, fontSize: 13 }}>{item.neighborhood}</Text>}
        {!!specs && <Text numberOfLines={1} style={{ color: t.ink, fontFamily: t.bodyFont, fontSize: 13, marginTop: 2 }}>{specs}</Text>}
      </View>
    </Pressable>
    {!!onFavorite && <Pressable onPress={() => onFavorite(item.id)} accessibilityRole="button" accessibilityLabel={favorite ? "Remove saved home" : "Save home"}
      accessibilityState={{ selected: !!favorite }} hitSlop={6}
      style={{ position: "absolute", top: 8, right: 8, width: 44, height: 44, borderRadius: 22, backgroundColor: "#111713A6", alignItems: "center", justifyContent: "center" }}>
      <Heart size={20} color="#FFFFFF" fill={favorite ? t.accent : "transparent"} />
    </Pressable>}
  </View>;
}

/** Layout for a listing grid of a given width: a centered content column, the number of columns and each card's width. */
export function listingGrid(width: number) {
  const side = width < 480 ? 16 : 24, gap = 16;
  const content = Math.min(width, 1120) - side * 2;
  const columns = listingColumns(content);
  const card = Math.floor((content - gap * (columns - 1)) / columns);
  return { side, gap, content, columns, card };
}

/**
 * The Listings tab: every active home as a complete card in natural vertical scroll, one column on phones and a
 * balanced grid only where each card keeps a readable width. Used where the screen itself scrolls (preview).
 */
export default function ListingBrowser({ brand, listings, width: givenWidth, onOpen, onFavorite, isFavorite, recommendedIds, recommendationLabel, title, emptyText }: {
  brand: Brand; listings: ManagedListing[]; width?: number; onOpen?: (id: string) => void; onFavorite?: (id: string) => void;
  isFavorite?: (id: string) => boolean; recommendedIds?: string[]; recommendationLabel?: string;
  /** Heading for another collection of the same homes (Saved homes); defaults to the realtor's listings. */
  title?: string; emptyText?: string }) {
  const window = useWindowDimensions();
  const width = givenWidth ?? window.width;
  const t = listingSurface(brand);
  const items = listings.filter(item => !item.hidden && !item.sourceArchived);
  const grid = listingGrid(width);
  // A single home is shown at a comfortable width instead of stretching across a wide screen.
  const card = items.length === 1 ? Math.min(grid.card * grid.columns + grid.gap * (grid.columns - 1), 560) : grid.card;
  return <View testID="listing-browser" style={{ backgroundColor: t.background, paddingTop: 24, paddingBottom: 32, minHeight: 640 }}>
    <View style={{ width: grid.content, alignSelf: "center", gap: 4, marginBottom: 20 }}>
      <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: t.headingFont, fontSize: 32, lineHeight: 38 }}>{title ?? listingsHeading(brand)}</Text>
      <Text style={{ color: t.muted, fontFamily: t.bodyFont, fontSize: 14 }}>{items.length ? homesCount(items.length) : title ? "None yet" : "No active listings yet"}</Text>
    </View>
    {items.length ? <View style={{ width: grid.content, alignSelf: "center", flexDirection: "row", flexWrap: "wrap", gap: grid.gap, justifyContent: items.length === 1 ? "center" : "flex-start" }}>
      {items.map(item => <ListingCard key={item.id} item={item} surface={t} width={card} onOpen={onOpen} onFavorite={onFavorite} favorite={isFavorite?.(item.id)}
        recommendation={recommendedIds?.includes(item.id) ? recommendationLabel || "Recommended by your realtor" : undefined} />)}
    </View> : <Text style={{ width: grid.content, alignSelf: "center", color: t.muted, fontFamily: t.bodyFont, fontSize: 15, lineHeight: 23 }}>
      {emptyText ?? "New homes will appear here as they become available. Get in touch to talk about what you’re looking for."}</Text>}
  </View>;
}
