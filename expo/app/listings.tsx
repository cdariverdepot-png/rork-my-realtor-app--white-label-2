import { useWorkflowBack } from '@/hooks/useWorkflowBack';
import React, { useCallback, useMemo } from "react";
import { FlatList, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListings, type ManagedListing } from "@/contexts/ListingsContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useAuth } from "@/contexts/AuthContext";
import { useClientFeed } from "@/contexts/ClientFeedContext";
import { useBrand } from "@/contexts/BrandContext";
import { bustedUri } from "@/lib/imageUri";
import { ListingCard, listingGrid } from "@/components/ListingBrowser";
import { homesCount, listingSurface, listingsHeading } from "@/lib/listingSurface";
import { useClientNavVisible } from "@/components/ClientShell";

/**
 * Full browse of every active listing the realtor represents: complete cards in natural vertical scroll, one
 * column on phones and a balanced grid on wide screens, in the realtor's own colors and type. Virtualized, so
 * a hundred homes scroll as smoothly as one.
 */
export default function AllListings() {
  const router = useRouter();
  const back = useWorkflowBack();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { visible } = useListings();
  const { isFavorited, toggleListing } = useFavorites();
  const { currentClientId } = useAuth();
  const { getFeed } = useClientFeed();
  const { brand } = useBrand();
  // Listings is a bottom-navigation destination: no Back arrow while that navigation is on screen.
  const navVisible = useClientNavVisible();
  const t = listingSurface(brand);
  const grid = listingGrid(width);
  const recommendedIds = useMemo(
    () => (currentClientId ? getFeed(currentClientId).pinnedListingIds : []),
    [currentClientId, getFeed],
  );
  const recommendationLabel = useMemo(() => {
    const first = brand.realtor.name.trim().split(/\s+/)[0];
    return `Recommended by ${first || "your realtor"}`;
  }, [brand.realtor.name]);
  const open = useCallback((id: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    router.push(`/listing/${id}`);
  }, [router]);
  const favorite = useCallback((id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggleListing("favorites", id);
  }, [toggleListing]);
  const single = visible.length === 1;
  const cardWidth = single ? Math.min(grid.card * grid.columns + grid.gap * (grid.columns - 1), 560) : grid.card;

  const renderItem = ({ item }: { item: ManagedListing }) => <ListingCard item={item} surface={t} width={cardWidth} onOpen={open} onFavorite={favorite}
    favorite={isFavorited(item.id)} imageUri={bustedUri(item.images?.[0] ?? item.image, item.updatedAt)}
    recommendation={recommendedIds.includes(item.id) ? recommendationLabel : undefined} />;

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center" }}>
        {!navVisible && <Pressable onPress={() => back()} hitSlop={14} accessibilityRole="button" accessibilityLabel="Back"
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
          <ArrowLeft size={20} color={t.ink} strokeWidth={1.6} />
        </Pressable>}
      </View>
      <FlatList
        key={`columns-${single ? 1 : grid.columns}`}
        data={visible}
        keyExtractor={(it) => it.id}
        numColumns={single ? 1 : grid.columns}
        renderItem={renderItem}
        {...(!single && grid.columns > 1 ? { columnWrapperStyle: { gap: grid.gap, width: grid.content, alignSelf: "center" as const } } : {})}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 116, gap: grid.gap, alignItems: single || grid.columns === 1 ? "center" : undefined }}
        initialNumToRender={6}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ width: grid.content, alignSelf: "center", gap: 4, marginBottom: 4 }}>
            <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: t.headingFont, fontSize: 32, lineHeight: 38 }}>{listingsHeading(brand)}</Text>
            <Text style={{ color: t.muted, fontFamily: t.bodyFont, fontSize: 14 }}>{visible.length ? homesCount(visible.length) : "No active listings yet"}</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ width: grid.content, alignSelf: "center", color: t.muted, fontFamily: t.bodyFont, fontSize: 15, lineHeight: 23 }}>
            New homes will appear here as they become available. Get in touch to talk about what you’re looking for.
          </Text>
        }
      />
    </View>
  );
}
