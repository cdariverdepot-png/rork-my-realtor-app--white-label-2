import React, { useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import Pressable from "./TactilePressable";
import ThemeCarousel from "./ThemeCarousel";
import ThemePreviewModal from "./ThemePreviewModal";

/** Review the same draft and inventory that will be published, without publishing. */
export default function SetupReviewActions({ draft, listings, onChoose, disabled = false }: {
  draft: Brand; listings: ManagedListing[]; onChoose: (next: Brand) => void; disabled?: boolean;
}) {
  const [themes, setThemes] = useState(false);
  const [preview, setPreview] = useState(false);
  const insets = useSafeAreaInsets();
  return <>
    <View style={{ marginTop: 24 }}>
      <Text style={{ color: "white", fontSize: 19, fontWeight: "600" }}>Make it yours</Text>
      <Text style={{ color: "#C8D0D0", lineHeight: 22, marginTop: 8 }}>
        Explore themes with your imported content and listings, or preview the client experience. Publish whenever you’re ready.
      </Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Explore Themes" disabled={disabled} onPress={() => setThemes(true)}
          style={{ flex: 1, minHeight: 60, padding: 12, borderRadius: 14, backgroundColor: "#C2A276", justifyContent: "center", opacity: disabled ? 0.55 : 1 }}>
          <Text style={{ color: "#172027", fontSize: 16, fontWeight: "700", textAlign: "center" }}>Explore Themes</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Preview My App" disabled={disabled} onPress={() => setPreview(true)}
          style={{ flex: 1, minHeight: 60, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#C2A276", justifyContent: "center", opacity: disabled ? 0.55 : 1 }}>
          <Text style={{ color: "#E6D0AC", fontSize: 16, fontWeight: "600", textAlign: "center" }}>Preview My App</Text>
        </Pressable>
      </View>
    </View>
    <Modal visible={themes} animationType="slide" onRequestClose={() => setThemes(false)}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#101419", paddingTop: insets.top }}>
        <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "600" }}>Explore Themes</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to app review" onPress={() => setThemes(false)} style={{ padding: 12 }}>
            <Text style={{ color: "#E6D0AC", fontWeight: "600" }}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 16 }}>
          <ThemeCarousel compact draft={draft} listings={listings} onChoose={next => { onChoose(next); setThemes(false); }} />
        </ScrollView>
      </GestureHandlerRootView>
    </Modal>
    <ThemePreviewModal visible={preview} title="Your client app" brand={draft} listings={listings} onClose={() => setPreview(false)} browserHistory />
  </>;
}
