import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Heart } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useListings } from "@/contexts/ListingsContext";
import ModalChrome from "@/components/ModalChrome";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";
import { bustedUri } from "@/lib/imageUri";

export default function WatchlistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { lists, toggleListing } = useFavorites();
  const { all } = useListings();

  const list = lists.find((l) => l.id === id);
  const homes =
    list?.listingIds
      .map((lid) => all.find((l) => l.id === lid))
      .filter((l): l is NonNullable<typeof l> => !!l) ?? [];

  const candidates = all.filter((l) => !list?.listingIds.includes(l.id));

  const tap = (cb: () => void) => () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    cb();
  };

  if (!list) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <ModalChrome eyebrow={list.name} />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {homes.length === 0 ? (
          <Reveal delay={60}>
          <View style={styles.empty}>
            <Heart size={20} color={brand.gold} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Nothing here yet.</Text>
            <Text style={styles.emptySub}>
              Save homes from below and they'll appear here for our next conversation.
            </Text>
          </View>
          </Reveal>
        ) : (
          <View style={{ paddingHorizontal: 24, gap: 18 }}>
            <Reveal delay={60}>
              <Text style={styles.label}>SAVED · {homes.length}</Text>
            </Reveal>
            {homes.map((h, idx) => (
              <Reveal key={h.id} delay={120 + idx * 70}>
              <PressableScale
                onPress={() => router.push(`/listing/${h.id}`)}
                haptic="selection"
                scaleTo={0.985}
                style={styles.bigCard}
              >
                <Image
                  source={{ uri: bustedUri(h.images?.[0] ?? h.image, h.updatedAt) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
                <LinearGradient
                  colors={["rgba(8,26,21,0)", "rgba(8,26,21,0.85)"]}
                  locations={[0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <Pressable
                  onPress={tap(() => toggleListing(list.id, h.id))}
                  style={styles.heartChip}
                  hitSlop={10}
                >
                  <Heart size={16} color={brand.gold} strokeWidth={2} fill={brand.gold} />
                </Pressable>
                <View style={styles.bigBody}>
                  <Text style={styles.bigHood}>{h.neighborhood.toUpperCase()}</Text>
                  <Text style={styles.bigTitle}>{h.title}</Text>
                  <Text style={styles.bigPrice}>{h.price}</Text>
                </View>
              </PressableScale>
              </Reveal>
            ))}
          </View>
        )}

        {candidates.length > 0 && (
          <Reveal delay={200}>
          <View style={{ marginTop: 36, paddingHorizontal: 24 }}>
            <Text style={styles.label}>ADD TO {list.name.toUpperCase()}</Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              {candidates.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={tap(() => toggleListing(list.id, c.id))}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: brand.ivoryWarm }]}
                >
                  <Image
                    source={{ uri: bustedUri(c.images?.[0] ?? c.image, c.updatedAt) }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowHood}>{c.neighborhood.toUpperCase()}</Text>
                    <Text style={styles.rowTitle}>{c.title}</Text>
                    <Text style={styles.rowPrice}>{c.price}</Text>
                  </View>
                  <View style={styles.addPill}>
                    <Heart size={13} color={brand.forestDeep} strokeWidth={2} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
          </Reveal>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.paper },
  empty: {
    margin: 24,
    padding: 32,
    backgroundColor: brand.ivoryWarm,
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 22, color: brand.ink, marginTop: 8 },
  emptySub: {
    fontFamily: fonts.serifItalic,
    color: brand.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  label: { fontFamily: fonts.sansMedium, color: brand.goldDeep, fontSize: 10, letterSpacing: 3 },
  bigCard: {
    height: 220,
    backgroundColor: brand.forest,
    overflow: "hidden",
  },
  heartChip: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(8,26,21,0.5)",
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  bigBody: { position: "absolute", left: 18, right: 18, bottom: 18 },
  bigHood: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  bigTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 24, letterSpacing: -0.4 },
  bigPrice: { fontFamily: fonts.serifItalic, color: brand.goldLight, fontSize: 16, marginTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: brand.hairline,
    backgroundColor: "#fff",
  },
  thumb: { width: 56, height: 56, backgroundColor: brand.forest },
  rowHood: { fontFamily: fonts.sansMedium, color: brand.goldDeep, fontSize: 9, letterSpacing: 2 },
  rowTitle: { fontFamily: fonts.serif, color: brand.ink, fontSize: 15, marginTop: 2 },
  rowPrice: { fontFamily: fonts.sans, color: brand.muted, fontSize: 12, marginTop: 2 },
  addPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: brand.gold,
    alignItems: "center",
    justifyContent: "center",
  },
});
