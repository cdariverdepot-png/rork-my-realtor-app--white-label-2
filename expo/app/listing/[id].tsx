import { useWorkflowBack } from '@/hooks/useWorkflowBack';
import { listingStatusLabel } from "@/lib/listingStatusLabel";
import React, { useEffect, useMemo } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import PortraitImage from "@/components/PortraitImage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Bed,
  Bath,
  Maximize,
  CalendarDays,
  MessageSquare,
  Heart,
} from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { avatarPlaceholder } from "@/constants/assets";
import { useBrand } from "@/contexts/BrandContext";
import { useListings } from "@/contexts/ListingsContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useEngagement } from "@/contexts/EngagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { useClientFeed } from "@/contexts/ClientFeedContext";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";
import { ListingDetailSkeleton } from "@/components/Skeleton";
import ListingPhotoGallery from "@/components/ListingPhotoGallery";
import { hasValue, specParts, sizeLabel } from "@/lib/listingSpecs";

const { height: H } = Dimensions.get("window");

/** Detail modal for a single curated listing, with the realtor's personal take. */
export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const back = useWorkflowBack();
  const insets = useSafeAreaInsets();
  const { brand: b } = useBrand();
  const realtor = b.realtor;
  const firstName = realtor.name.split(" ")[0] ?? realtor.name;
  const { all, hydrated } = useListings();
  const { isFavorited, toggleListing } = useFavorites();
  const { recordView } = useEngagement();
  const { currentClientId } = useAuth();
  const { getFeed } = useClientFeed();
  const recommendedIds = useMemo(
    () => (currentClientId ? getFeed(currentClientId).pinnedListingIds : []),
    [currentClientId, getFeed],
  );
  // Never fall back to a different home: a stale link must not show (or book) the wrong listing.
  const item = all.find((l) => l.id === id);
  const recommended = !!item && recommendedIds.includes(item.id);

  useEffect(() => {
    if (item?.id) recordView(item.id);
  }, [item?.id, recordView]);

  if (!hydrated) {
    return <ListingDetailSkeleton />;
  }
  if (!item) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center", padding: 32 }]}>
        <Text style={{ fontFamily: fonts.serif, color: brand.ink, fontSize: 20, textAlign: "center" }}>This home is no longer available.</Text>
        <PressableScale onPress={() => back()} haptic="selection" style={{ marginTop: 18 }}>
          <Text style={{ fontFamily: fonts.sansSemi, color: brand.ink, fontSize: 14, letterSpacing: 1.4 }}>GO BACK</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ListingPhotoGallery images={item.images} cover={item.image} title={item.title} updatedAt={item.updatedAt} height={H * 0.62}>
          <LinearGradient
            colors={["rgba(8,26,21,0.6)", "rgba(8,26,21,0)", "rgba(8,26,21,0.85)"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
            <PressableScale
              onPress={() => back()}
              hitSlop={12}
              haptic="light"
              scaleTo={0.9}
              style={styles.back}
            >
              <ArrowLeft size={18} color={brand.ivory} strokeWidth={1.5} />
            </PressableScale>
            <View style={styles.topRight}>
              <PressableScale
                hitSlop={12}
                onPress={() => toggleListing("favorites", item.id)}
                haptic="light"
                scaleTo={0.9}
                style={styles.back}
              >
                <Heart
                  size={16}
                  color={isFavorited(item.id) ? brand.gold : brand.ivory}
                  fill={isFavorited(item.id) ? brand.gold : "transparent"}
                  strokeWidth={1.8}
                />
              </PressableScale>
              {!!listingStatusLabel(item) && <View style={styles.tag}>
                <View style={styles.tagDot} />
                <Text style={styles.tagText}>{listingStatusLabel(item).toUpperCase()}</Text>
              </View>}
            </View>
          </View>
          <View style={styles.heroBottom}>
            {recommended ? (
              <View style={styles.recommendedTag}>
                <Text style={styles.recommendedText}>Recommended by {firstName || "your realtor"}</Text>
              </View>
            ) : null}
            <Text style={styles.neighborhood}>{item.neighborhood.toUpperCase()}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.price}>{item.price}</Text>
          </View>
        </ListingPhotoGallery>

        <Reveal delay={60}>
        <View style={styles.specsRow}>
          {[
            hasValue(item.beds) ? <Spec key="beds" icon={<Bed size={18} color={brand.forest} strokeWidth={1.5} />} label={`${item.beds} bedrooms`} /> : null,
            hasValue(item.baths) ? <Spec key="baths" icon={<Bath size={18} color={brand.forest} strokeWidth={1.5} />} label={`${item.baths} baths`} /> : null,
            specParts({ sqft: item.sqft }).length ? <Spec key="size" icon={<Maximize size={18} color={brand.forest} strokeWidth={1.5} />} label={sizeLabel(item.sqft)} /> : null,
          ].filter(Boolean).flatMap((spec, i) => i ? [<View key={`divider-${i}`} style={styles.specDivider} />, spec] : [spec])}
        </View>
        </Reveal>

        {!!item.description && <View style={styles.descriptionBlock}>
          <Text style={styles.detailsKicker}>ABOUT THIS PROPERTY</Text>
          <Text style={styles.descriptionBody}>{item.description}</Text>
        </View>}

        {!!item.elizaTake?.trim() && <Reveal delay={140}>
        <View style={styles.takeCard}>
          <View style={styles.takeHead}>
            {b.portraitUrl ? (
              <PortraitImage uri={b.portraitUrl} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Image source={avatarPlaceholder} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
            )}
            <View>
              <Text style={styles.takeKicker}>{firstName.toUpperCase()}'S TAKE</Text>
              <Text style={styles.takeName}>From {firstName}, personally</Text>
            </View>
          </View>
          <Text style={styles.takeBody}>{item.elizaTake}</Text>
        </View>
        </Reveal>}

        <Reveal delay={220}>
        <View style={styles.detailsBlock}>
          <Text style={styles.detailsKicker}>THE FACTS</Text>
          <Detail label="Neighborhood" value={item.neighborhood} />
          <Detail label="Price" value={item.price} />
          {hasValue(item.beds) ? <Detail label="Bedrooms" value={String(item.beds)} /> : null}
          {hasValue(item.baths) ? <Detail label="Bathrooms" value={String(item.baths)} /> : null}
          {specParts({ sqft: item.sqft }).length ? <Detail label="Interior" value={sizeLabel(item.sqft)} /> : null}
          {!!listingStatusLabel(item) && <Detail label="Status" value={listingStatusLabel(item)} />}
          {!!item.listingNumber && <Detail label="MLS number" value={item.listingNumber} />}
          {!!item.propertyType && <Detail label="Property type" value={item.propertyType} />}
          {Object.entries(item.facts ?? {}).map(([label, value]) => <Detail key={label} label={label} value={value} />)}
          <Detail label="Showings" value="Private · by appointment" last />
        </View>
        </Reveal>

        <View style={{ height: insets.bottom + 120 }} />
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}>
        <PressableScale
          onPress={() => router.replace("/messages")}
          haptic="light"
          style={styles.dockSecondary}
        >
          <MessageSquare size={16} color={brand.ivory} strokeWidth={1.5} />
          <Text style={styles.dockSecondaryText}>Ask {firstName}</Text>
        </PressableScale>
        {!item.sourceArchived && item.status !== "sold" && item.status !== "off_market" && <PressableScale
          onPress={() => router.replace({ pathname: "/book", params: { listingId: item.id } })}
          haptic="medium"
          scaleTo={0.96}
          style={styles.dockPrimary}
        >
          <CalendarDays size={16} color={brand.forestDeep} strokeWidth={2} />
          <Text style={styles.dockPrimaryText}>Book private showing</Text>
        </PressableScale>}
      </View>
    </View>
  );
}

function Spec({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.spec}>
      {icon}
      <Text style={styles.specLabel}>{label}</Text>
    </View>
  );
}

function Detail({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.paper },
  heroImg: { width: "100%", backgroundColor: brand.forest },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,26,21,0.35)",
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(8,26,21,0.5)",
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.25)",
  },
  tagDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: brand.goldLight },
  tagText: { fontFamily: fonts.sansMedium, color: brand.ivory, fontSize: 10, letterSpacing: 2 },
  heroBottom: { position: "absolute", left: 24, right: 24, bottom: 28 },
  recommendedTag: {
    alignSelf: "flex-start",
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(210,163,67,0.92)",
  },
  recommendedText: {
    fontFamily: fonts.sansSemi,
    color: brand.forestDeep,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  neighborhood: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 11,
    letterSpacing: 3,
    marginBottom: 12,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  price: {
    fontFamily: fonts.serifItalic,
    color: brand.goldLight,
    fontSize: 22,
  },
  specsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 24,
    backgroundColor: brand.paper,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairline,
    justifyContent: "space-between",
  },
  spec: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  specDivider: { width: 1, height: 22, backgroundColor: brand.hairline },
  specLabel: {
    fontFamily: fonts.sans,
    color: brand.ink,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  takeCard: {
    margin: 24,
    padding: 22,
    backgroundColor: brand.forest,
  },
  takeHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(244,239,230,0.18)",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: brand.gold,
  },
  avatarFallback: {
    backgroundColor: "#07070A",
    overflow: "hidden",
  },
  takeKicker: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 4,
  },
  takeName: {
    fontFamily: fonts.serifItalic,
    color: brand.ivory,
    fontSize: 14,
  },
  takeBody: {
    fontFamily: fonts.serifItalic,
    color: brand.ivory,
    fontSize: 17,
    lineHeight: 26,
  },
  detailsBlock: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  descriptionBlock: { padding: 24 },
  descriptionBody: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 25, color: brand.ink },
  detailsKicker: {
    fontFamily: fonts.sansMedium,
    color: brand.goldDeep,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: brand.hairline,
  },
  detailLabel: { fontFamily: fonts.sans, color: brand.muted, fontSize: 13 },
  detailValue: { fontFamily: fonts.serif, color: brand.ink, fontSize: 14, flex: 1, textAlign: 'right', marginLeft: 16 },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    flexDirection: "row",
    gap: 10,
    backgroundColor: brand.forestDeep,
    borderTopWidth: 1,
    borderTopColor: "rgba(244,239,230,0.12)",
  },
  dockSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
  },
  dockSecondaryText: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  dockPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    backgroundColor: brand.ivory,
  },
  dockPrimaryText: {
    fontFamily: fonts.sansSemi,
    color: brand.forestDeep,
    fontSize: 12,
    letterSpacing: 1.8,
  },
});
