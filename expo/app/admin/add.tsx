import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { backOr } from "@/lib/navIntent";
import ListingSourceImporter from "@/components/ListingSourceImporter";

export default function AddListing() {
  const router = useRouter(), insets = useSafeAreaInsets();
  const { sourceUrl } = useLocalSearchParams<{ sourceUrl?: string }>();
  return <ScrollView style={{ flex: 1, backgroundColor: "#101419" }} keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ padding: 24, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 }}>
    <Pressable accessibilityRole="button" onPress={() => backOr(router)} style={{ paddingVertical: 12, alignSelf: "flex-start" }}>
      <Text style={{ color: "#C2A276", fontSize: 16 }}>Back</Text>
    </Pressable>
    <View style={{ marginTop: 24 }}><ListingSourceImporter initialUrl={sourceUrl} /></View>
  </ScrollView>;
}
