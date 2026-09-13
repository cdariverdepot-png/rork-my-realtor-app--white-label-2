import React, { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { requiredStatus } from "@/constants/sections";
import { brand, fonts } from "@/constants/colors";

export default function Ready() {
  const router = useRouter();
  const auth = useAuth();
  const saved = useBrand();
  const opacity = useRef(new Animated.Value(0)).current;
  const complete = saved.hydrated && requiredStatus(saved.brand).complete;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }).start();
  }, [opacity]);
  useEffect(() => {
    if (!auth.hydrated || !saved.hydrated || !auth.isAdmin || !complete) return;
    const timer = setTimeout(() => {
      auth.enterViewAsClient();
      router.replace("/");
    }, 3000);
    return () => clearTimeout(timer);
  }, [auth.hydrated, saved.hydrated, auth.isAdmin, complete, auth.enterViewAsClient, router]);
  if (!complete) return null;
  return <View style={{ flex: 1, backgroundColor: brand.nightDeep, justifyContent: "center", padding: 32 }}>
    <Animated.View style={{ opacity, gap: 24, alignItems: "center" }}>
      <View style={{ padding: 24, borderRadius: 60, backgroundColor: "#2E8B57" }}><Check size={42} color="white" /></View>
      <Text style={{ color: brand.goldLight, letterSpacing: 3 }}>BASE APP CREATED</Text>
      <Text style={{ fontFamily: fonts.serif, fontSize: 38, color: brand.ivory, textAlign: "center" }}>You’ve done it. Your app is ready.</Text>
      <Text style={{ color: brand.ivory, fontSize: 16, lineHeight: 25, textAlign: "center" }}>Your information now fills your own app. Take a look, keep customizing, and share it with clients when you choose.</Text>
      <Text style={{ color: brand.goldLight }}>Opening your app…</Text>
    </Animated.View>
  </View>;
}
