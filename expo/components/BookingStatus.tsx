import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

export default function BookingStatus({ loading, message, retry }: {
  loading?: boolean; message?: string; retry: () => void;
}) {
  const router = useRouter();
  return <View style={{ flex: 1, backgroundColor: "#101419", padding: 32, justifyContent: "center", gap: 24 }}>
    {loading && <ActivityIndicator color="white" />}
    <Text accessibilityRole={loading ? undefined : "alert"} style={{ color: "white", fontSize: 18 }}>
      {loading ? "Loading your realtor's booking page…" : message}
    </Text>
    {!loading && <Pressable accessibilityRole="button" onPress={retry}><Text style={{ color: "#E0BC72" }}>Try again</Text></Pressable>}
    <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace("/portal")}>
      <Text style={{ color: "white" }}>Back</Text>
    </Pressable>
  </View>;
}
