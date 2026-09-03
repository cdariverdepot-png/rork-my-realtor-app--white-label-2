import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Heart, Plus, ChevronRight, Trash2 } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useListings } from "@/contexts/ListingsContext";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";
import { bustedUri } from "@/lib/imageUri";

const ACCENT = SCREEN_ACCENT.favorites;

export default function FavoritesScreen() {
  const router = useRouter();
  const { lists, createList, deleteList } = useFavorites();
  const { all } = useListings();
  const [creating, setCreating] = useState<boolean>(false);
  const [name, setName] = useState<string>("");

  const onCreate = () => {
    const n = name.trim();
    if (!n) return;
    const list = createList(n);
    setName("");
    setCreating(false);
    router.push(`/watchlist/${list.id}`);
  };

  const confirmDelete = (id: string, label: string) => {
    if (id === "favorites") return;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Delete "${label}"?`)) deleteList(id);
      return;
    }
    Alert.alert("Delete watchlist", `"${label}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteList(id) },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="favorites" />
      <ModalChrome eyebrow="Saved by you" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Reveal delay={40}>
          <Text style={styles.intro}>
            Make this yours. I'll always know what you've quietly fallen for.
          </Text>
        </Reveal>

        <Reveal delay={120}>
        <View style={styles.sectionHead}>
          <Text style={styles.label}>YOUR WATCHLISTS</Text>
          <PressableScale
            hitSlop={10}
            onPress={() => setCreating((v) => !v)}
            haptic="selection"
            scaleTo={0.94}
          >
            <Text style={styles.add}>{creating ? "Cancel" : "+ New list"}</Text>
          </PressableScale>
        </View>

        {creating && (
          <View style={styles.createRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Lakefront only, under $5M"
              placeholderTextColor={dark.textDim}
              style={styles.input}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onCreate}
            />
            <PressableScale
              onPress={onCreate}
              haptic="medium"
              scaleTo={0.95}
              style={styles.createBtn}
            >
              <Text style={styles.createBtnText}>Save</Text>
            </PressableScale>
          </View>
        )}

        </Reveal>

        <Reveal delay={200}>
        <View style={styles.listsCol}>
          {lists.map((wl) => {
            const homes = wl.listingIds
              .map((id) => all.find((l) => l.id === id))
              .filter((l): l is NonNullable<typeof l> => !!l);
            const cover = bustedUri(homes[0]?.images?.[0] ?? homes[0]?.image, homes[0]?.updatedAt);
            return (
              <PressableScale
                key={wl.id}
                onPress={() => router.push(`/watchlist/${wl.id}`)}
                haptic="selection"
                scaleTo={0.985}
                style={styles.listRow}
              >
                <View style={styles.coverWrap}>
                  {cover ? (
                    <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.coverEmpty]}>
                      <Heart size={20} color={ACCENT} strokeWidth={1.5} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listName}>{wl.name}</Text>
                  <Text style={styles.listMeta}>
                    {homes.length === 0
                      ? "Empty — start saving"
                      : `${homes.length} ${homes.length === 1 ? "home" : "homes"}`}
                  </Text>
                </View>
                {wl.id !== "favorites" ? (
                  <PressableScale
                    hitSlop={10}
                    onPress={() => confirmDelete(wl.id, wl.name)}
                    haptic="light"
                    scaleTo={0.9}
                    style={styles.trash}
                  >
                    <Trash2 size={14} color={dark.textDim} strokeWidth={1.5} />
                  </PressableScale>
                ) : null}
                <ChevronRight size={16} color={dark.textDim} strokeWidth={1.5} />
              </PressableScale>
            );
          })}
        </View>

        </Reveal>

        <Reveal delay={280}>
        <PressableScale
          onPress={() => setCreating(true)}
          haptic="light"
          scaleTo={0.98}
          style={styles.newCard}
        >
          <View style={styles.newIcon}>
            <Plus size={18} color={ACCENT} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.newTitle}>Start a new watchlist</Text>
            <Text style={styles.newSub}>Pied-à-terre, beach, investment — name it your way.</Text>
          </View>
        </PressableScale>
        </Reveal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  intro: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginHorizontal: 24,
    marginBottom: 22,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 14,
  },
  label: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10,
    letterSpacing: 3,
  },
  add: {
    fontFamily: fonts.sansSemi,
    color: ACCENT,
    fontSize: 12,
    letterSpacing: 1.4,
  },
  createRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 18,
  },
  input: {
    flex: 1,
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 15,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.7)",
  },
  createBtn: {
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: tint(ACCENT, 0.18),
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.5),
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontFamily: fonts.sansSemi,
    color: ACCENT,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  listsCol: {
    paddingHorizontal: 16,
    gap: 8,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.72)",
  },
  coverWrap: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: dark.bgSurface,
    overflow: "hidden",
  },
  coverEmpty: {
    backgroundColor: tint(ACCENT, 0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  listName: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  listMeta: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  trash: { padding: 6 },
  newCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    margin: 16,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.28),
    backgroundColor: tint(ACCENT, 0.08),
  },
  newIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.5),
    backgroundColor: tint(ACCENT, 0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  newTitle: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  newSub: {
    fontFamily: fonts.sans,
    color: dark.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
