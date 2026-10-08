import { listingStatusLabel } from "@/lib/listingStatusLabel";
import React, { useMemo } from "react";
import {
  Dimensions,
  useWindowDimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowUpRight, Heart } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { type ManagedListing } from "@/contexts/ListingsContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useBrand } from "@/contexts/BrandContext";
import { useEditMode } from "@/contexts/EditModeContext";
import { bustedUri } from "@/lib/imageUri";
import EditableText from "./EditableText";
import SectionLabel from "./SectionLabel";
import PressableScale from "./PressableScale";
import { specLine } from "@/lib/listingSpecs";

const { width: W } = Dimensions.get("window");
const CARD_W = W * 0.84;
const CARD_H = Math.min(W * 1.32, 560);
// Photo dominates ~70% of the card; copy lives on cream below.
const PHOTO_H = Math.round(CARD_H * 0.7);

const ListingCard = React.memo(function ListingCard({
  item,
  index,
  editing,
  onEditField,
}: {
  item: ManagedListing;
  index: number;
  editing: boolean;
  onEditField: (id: string, patch: Partial<ManagedListing>) => void;
}) {
  const router = useRouter();
  const { theme, brand: profile } = useBrand();
  const { width } = useWindowDimensions();
  const coastal = profile.layoutId === "coastal-personal";
  const coastalWidth = Math.min(340, Math.max(260, width * 0.68));
  const { isFavorited, toggleListing } = useFavorites();
  const liked = isFavorited(item.id);
  const handlePress = () => {
    if (editing) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.push(`/listing/${item.id}`);
  };
  const handleHeart = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleListing("favorites", item.id);
  };
  return (
    <PressableScale
      onPress={handlePress}
      haptic="selection"
      scaleTo={0.97}
      style={[
        styles.card,
        { marginLeft: index === 0 ? 24 : 16, backgroundColor: theme.surface.panel },
        coastal && { width: coastalWidth, height: undefined, minHeight: 330, borderRadius: 18, shadowOpacity: 0.06 },
      ]}
    >
      {/* Cinematic photo — full-bleed top */}
      <View style={[styles.photoWrap, { backgroundColor: theme.band.base }, coastal && { height: 215 }]}>
        <Image
          source={{ uri: bustedUri(item.images?.[0] ?? item.image, item.updatedAt) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
        />
        <></>
        <View
          style={[
            styles.tag,
            { backgroundColor: theme.onBand.veil, borderColor: theme.onBand.veilLine },
          ]}
        >
          <View style={[styles.tagDot, { backgroundColor: theme.accent.light }]} />
          <Text style={[styles.tagText, { color: theme.onBand.text }]}>
            {listingStatusLabel(item).toUpperCase()}
          </Text>
        </View>
        <Pressable
          hitSlop={8}
          onPress={handleHeart}
          style={[
            styles.heart,
            { backgroundColor: theme.onBand.veil, borderColor: theme.onBand.veilLine },
          ]}
        >
          <Heart
            size={16}
            color={liked ? theme.accent.base : theme.onBand.text}
            fill={liked ? theme.accent.base : "transparent"}
            strokeWidth={1.8}
          />
        </Pressable>
        <View style={styles.priceOverlay}>
          <EditableText
            editing={editing}
            value={item.price}
            onSave={(v) => onEditField(item.id, { price: v })}
            label="Price"
            accent={theme.accent.light}
            style={[
              styles.priceOverlayText,
              { color: theme.onBand.text, fontFamily: theme.display },
            ]}
          />
        </View>
      </View>

      {/* Slim editorial copy block — paper, hairline, no extra borders */}
      <View style={styles.body}>
        <Text style={[styles.neighborhood, { color: theme.accent.deep }]} numberOfLines={1}>
          {item.ownership === "featured" ? `FEATURED${item.neighborhood ? ` · ${item.neighborhood.toUpperCase()}` : ""}` : item.neighborhood.toUpperCase()}
        </Text>
        {item.ownership === "featured" && item.listingOffice ? (
          <Text style={styles.courtesy} numberOfLines={1}>Listing courtesy of {item.listingOffice}</Text>
        ) : null}
        <EditableText
          editing={editing}
          value={item.title}
          onSave={(v) => onEditField(item.id, { title: v })}
          label="Listing title"
          style={[styles.title, { fontFamily: theme.display }]}
          numberOfLines={1}
        />
        <View style={styles.metaRow}>
          <Text style={styles.specs}>
            {specLine(item)}
          </Text>
          <View style={[styles.arrow, { backgroundColor: theme.band.deep }]}>
            <ArrowUpRight size={13} color={theme.onBand.text} strokeWidth={2} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
});

export default React.memo(function CuratedListings() {
  const { brand: b, theme } = useBrand();
  const { width } = useWindowDimensions();
  const coastal = b.layoutId === "coastal-personal";
  const { editing, setListing, previewListings } = useEditMode();
  const visible = useMemo(() => previewListings.filter((l) => !l.hidden && !l.sourceArchived), [previewListings]);
  const Header = (
    <SectionLabel
      eyebrow={b.curated.eyebrow || "Curated for you"}
      title={b.curated.title || "Homes I'm watching."}
    />
  );

  // No listings yet. This is the one section that must never disappear — the
  // collection is the reason a client opens the app at all, so an absence here
  // would read as a broken app rather than a spare one. A finished "coming
  // soon" panel holds the slot and sets an expectation, where the old skeleton
  // was a loading state that never resolved.
  if (!visible || visible.length === 0) {
    return (
      <View style={styles.section}>
        {Header}
        <View
          style={[
            styles.soon,
            { backgroundColor: theme.surface.panel, borderColor: theme.surface.hairline },
          ]}
        >
          <View style={[styles.soonRule, { backgroundColor: theme.accent.base }]} />
          <Text style={[styles.soonTitle, { fontFamily: theme.display }]}>
            New listings coming soon.
          </Text>
          <Text style={styles.soonBody}>
            I&rsquo;m putting this collection together now. When something worth your time comes
            up, it lands here first.
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.section, coastal && { marginHorizontal: 12, borderRadius: 28, backgroundColor: "#FFFDFA", paddingTop: 22, paddingBottom: 18 }]}>
      {Header}
      <FlatList
        horizontal
        data={visible}
        keyExtractor={(it) => it.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <ListingCard item={item} index={index} editing={editing} onEditField={setListing} />
        )}
        contentContainerStyle={{ paddingRight: 24, paddingBottom: 12 }}
        snapToInterval={(coastal ? Math.min(340, Math.max(260, width * 0.68)) : CARD_W) + 16}
        decelerationRate="fast"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    paddingTop: 40,
    paddingBottom: 8,
    backgroundColor: "transparent",
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  photoWrap: {
    height: PHOTO_H,
    overflow: "hidden",
  },
  tag: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  tagText: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 2,
  },
  heart: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  priceOverlay: {
    position: "absolute",
    left: 16,
    bottom: 16,
  },
  priceOverlayText: {
    fontSize: 28,
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  body: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    justifyContent: "space-between",
  },
  courtesy: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: brand.ink,
    opacity: 0.6,
    marginTop: -2,
    marginBottom: 6,
  },
  neighborhood: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 2.6,
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  specs: {
    flex: 1,
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 11.5,
    letterSpacing: 0.4,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  soon: {
    marginHorizontal: 24,
    borderWidth: 1,
    paddingVertical: 34,
    paddingHorizontal: 26,
  },
  soonRule: { width: 34, height: 1, marginBottom: 18 },
  soonTitle: {
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  soonBody: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 13.5,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 320,
  },
});
