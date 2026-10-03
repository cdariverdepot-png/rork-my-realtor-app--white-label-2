import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, BackHandler, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Check } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { requiredStatus } from "@/constants/sections";
import { brand, fonts } from "@/constants/colors";
import { loadBuild } from "@/lib/appBuilder/buildService";
import InvitationTools from '@/components/InvitationTools';

export default function Ready() {
  const router = useRouter();
  const auth = useAuth();
  const saved = useBrand();
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { router.dismissTo('/admin'); return true; });
    return () => subscription.remove();
  }, [router]));
  const opacity = useRef(new Animated.Value(0)).current;
  const complete = saved.hydrated && saved.isPublished && !!auth.realtorRecord?.client_code_enabled;
  const [listingLinks, setListingLinks] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }).start();
    void loadBuild().then(build => {
      if (!build) return;
      const discovered = build.draft.discoveredListings ?? [];
      setImportedCount(discovered.length);
      const ids = new Set(build.draft.potentialListingSources ?? []);
      const fromPotential = build.sources.filter(source => ids.has(source.id) &&
        (source.kind === "url" || source.kind === "listing")).map(source => source.uri);
      const fromDiscovered = discovered.map(item => item.sourceUrl).filter(Boolean);
      setListingLinks([...new Set([...fromDiscovered, ...fromPotential])]);
    }).catch(() => {});
  }, [opacity]);
  const preview = () => {
    auth.enterViewAsClient();
    router.replace("/");
  };
  if (!complete) return null;
  return <ScrollView style={{ flex: 1, backgroundColor: brand.nightDeep }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 32 }}>
    <Animated.View style={{ opacity, gap: 24, alignItems: "center" }}>
      <View style={{ padding: 24, borderRadius: 60, backgroundColor: "#2E8B57" }}><Check size={42} color="white" /></View>
      <Text style={{ color: brand.goldLight, letterSpacing: 3 }}>PUBLISHED SUCCESSFULLY</Text>
      <Text style={{ fontFamily: fonts.serif, fontSize: 38, color: brand.ivory, textAlign: "center" }}>Congratulations! Your app is live.</Text>
      <Text style={{ color: brand.ivory, fontSize: 16, lineHeight: 25, textAlign: "center" }}>Invite your first client using your permanent link or QR code. These stay the same when you publish future design changes.</Text>
      <InvitationTools />
      <Pressable onPress={() => router.dismissTo("/admin")} style={{ backgroundColor: brand.goldLight, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 28, minWidth: 220, alignItems: "center" }}>
        <Text style={{ color: brand.nightDeep, fontFamily: fonts.sansSemi }}>Go to dashboard</Text>
      </Pressable>
      <Pressable onPress={preview} style={{ borderWidth: 1, borderColor: brand.goldLight, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 28, minWidth: 220, alignItems: "center" }}>
        <Text style={{ color: brand.goldLight, fontFamily: fonts.sansSemi }}>Preview my app</Text>
      </Pressable>
      {importedCount > 0 && <Text style={{ color: brand.ivory, textAlign: "center" }}>
        {importedCount} listing{importedCount === 1 ? "" : "s"} imported from your site — review them on your dashboard.
      </Text>}
      {listingLinks.length > 0 && importedCount === 0 && <Pressable
        onPress={() => router.push({ pathname: "/admin/add", params: { sourceUrl: listingLinks[0] } })}
        style={{ paddingVertical: 12, paddingHorizontal: 24, alignItems: "center" }}>
        <Text style={{ color: brand.goldLight }}>Review a listing we found</Text>
      </Pressable>}
    </Animated.View>
  </ScrollView>;
}
