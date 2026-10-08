import { useWorkflowBack } from '@/hooks/useWorkflowBack';
import React, { useMemo } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Heart } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, dark, fonts } from "@/constants/colors";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";
import { useListings, type ManagedListing } from "@/contexts/ListingsContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useAuth } from "@/contexts/AuthContext";
import { useClientFeed } from "@/contexts/ClientFeedContext";
import { useBrand } from "@/contexts/BrandContext";
import { bustedUri } from "@/lib/imageUri";
import PressableScale from "@/components/PressableScale";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { specLine } from "@/lib/listingSpecs";

const ACCENT = SCREEN_ACCENT.listings;

const { width: W } = Dimensions.get("window");
const COL_GAP = 14;
const SIDE = 20;
const CARD_W = (W - SIDE * 2 - COL_GAP) / 2;
const CARD_H = Math.round(CARD_W * 1.32);

function Card({ item, recommended, recommendationLabel }: { item: ManagedListing; recommended?: boolean; recommendationLabel?: string }) {
  const router = useRouter();
  const back = useWorkflowBack();
  const { isFavorited, toggleListing } = useFavorites();
  const liked = isFavorited(item.id);
  const onPress = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.push(`/listing/${item.id}`);
  };
  const onHeart = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleListing("favorites", item.id);
  };
  return (
    <PressableScale onPress={onPress} haptic="selection" scaleTo={0.97} style={styles.card}>
      <View style={styles.photoWrap}>
        <Image
          source={{ uri: bustedUri(item.images?.[0] ?? item.image, item.updatedAt) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={250}
        />
        <LinearGradient
          colors={["rgba(8,10,9,0.45)", "rgba(8,10,9,0)", "rgba(8,10,9,0.6)"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.tag}>
          <View style={styles.tagDot} />
          <Text style={styles.tagText}>{item.tag.toUpperCase()}</Text>
        </View>
        {recommended ? (
          <View style={styles.recommendedTag}>
            <Text numberOfLines={1} style={styles.recommendedText}>
              {recommendationLabel || "Recommended by your realtor"}
            </Text>
          </View>
        ) : null}
        <Pressable hitSlop={8} onPress={onHeart} style={styles.heart}>
          <Heart
            size={14}
            color={liked ? ACCENT : dark.text}
            fill={liked ? ACCENT : "transparent"}
            strokeWidth={1.8}
          />
        </Pressable>
        <Text style={styles.priceOverlay}>{item.price}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.neighborhood} numberOfLines={1}>
          {item.neighborhood.toUpperCase()}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.specs} numberOfLines={1}>
          {specLine(item)}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Full browse of every active listing the realtor represents. */
export default function AllListings() {
  const router = useRouter();
  const back = useWorkflowBack();
  const insets = useSafeAreaInsets();
  const { visible } = useListings();
  const { currentClientId } = useAuth();
  const { getFeed } = useClientFeed();
  const { brand: realtorBrand } = useBrand();
  const recommendedIds = useMemo(
    () => (currentClientId ? getFeed(currentClientId).pinnedListingIds : []),
    [currentClientId, getFeed],
  );
  const recommendationLabel = useMemo(() => {
    const first = realtorBrand.realtor.name.trim().split(/\s+/)[0];
    return `Recommended by ${first || "your realtor"}`;
  }, [realtorBrand.realtor.name]);

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="listings" />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => back()} hitSlop={14} style={styles.back}>
          <ArrowLeft size={20} color={dark.text} strokeWidth={1.6} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.eyebrow}>THE COLLECTION</Text>
          <Text style={styles.headerTitle}>Find your home</Text>
        </View>
        <View style={styles.back} />
      </View>

      <FlatList
        data={visible}
        keyExtractor={(it) => it.id}
        numColumns={2}
        renderItem={({ item }) => (
          <Card
            item={item}
            recommended={recommendedIds.includes(item.id)}
            recommendationLabel={recommendationLabel}
          />
        )}
        columnWrapperStyle={{ gap: COL_GAP, paddingHorizontal: SIDE }}
        contentContainerStyle={{
          paddingTop: 18,
          paddingBottom: insets.bottom + 116,
          gap: COL_GAP,
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.intro}>
            <Text style={styles.introCount}>{visible.length ? `${visible.length} homes to explore` : 'Your next home is worth the wait.'}</Text>
            <Text style={styles.introCopy}>
              {visible.length ? 'Explore the collection, or get in touch to arrange a private showing.' : 'New homes will appear here as they become available. Get in touch to talk about what you’re looking for.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(244,239,230,0.08)",
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 3,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  intro: { paddingHorizontal: SIDE, paddingTop: 4, paddingBottom: 18 },
  introCount: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 6,
  },
  introCopy: {
    fontFamily: fonts.serif,
    color: dark.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.82)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  photoWrap: {
    height: Math.round(CARD_H * 0.66),
    backgroundColor: dark.bgSurface,
    overflow: "hidden",
  },
  tag: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(8,10,9,0.62)",
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
  },
  tagDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT },
  tagText: {
    fontFamily: fonts.sansMedium,
    color: dark.text,
    fontSize: 8,
    letterSpacing: 1.6,
  },
  recommendedTag: {
    position: "absolute",
    top: 38,
    left: 10,
    right: 42,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(210,163,67,0.92)",
  },
  recommendedText: {
    fontFamily: fonts.sansSemi,
    color: brand.forestDeep,
    fontSize: 7.5,
    letterSpacing: 0.2,
  },
  heart: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(8,10,9,0.5)",
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  priceOverlay: {
    position: "absolute",
    left: 10,
    bottom: 10,
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 18,
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    justifyContent: "space-between",
  },
  neighborhood: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 2.2,
  },
  title: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  specs: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 10.5,
    letterSpacing: 0.3,
  },
});
