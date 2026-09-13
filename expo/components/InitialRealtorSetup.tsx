import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBrand, type Brand } from "@/contexts/BrandContext";
import { REQUIRED_FIELDS, requiredStatus } from "@/constants/sections";
import { toPortableImage } from "@/lib/portableImage";

export default function InitialRealtorSetup() {
  const { brand, hydrated, saveBrand } = useBrand();
  const [draft, setDraft] = useState(brand);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useEffect(() => { if (!dirty) setDraft(brand); }, [brand, dirty]);
  const change = (mut: (b: Brand) => Brand) => { setDirty(true); setDraft(mut); };
  const identity = (key: keyof Brand["realtor"], value: string) =>
    change(b => ({ ...b, realtor: { ...b.realtor, [key]: value } }));
  const license = (key: "number" | "state" | "brokerage", value: string) =>
    change(b => ({ ...b, credentials: { ...b.credentials, license: { ...b.credentials.license, [key]: value } } }));
  const field = (label: string, value: string, onChangeText: (value: string) => void) =>
    <View key={label} style={{ gap: 8, marginTop: 12 }}>
      <Text style={{ color: "#CBD0D6" }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} autoCorrect={false}
        style={{ minHeight: 48, borderWidth: 1, borderColor: "#555C64", borderRadius: 8, padding: 12, color: "white" }} />
    </View>;
  const pick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.92 });
      if (result.canceled) return;
      const uri = await toPortableImage(result.assets[0].uri, 1600);
      change(b => ({ ...b, portraitUrl: uri }));
    } catch { Alert.alert("Couldn’t load image", "Please try another image."); }
  };
  const complete = requiredStatus(draft).complete;
  const save = async (continueToApp: boolean) => {
    if (saving || (continueToApp && !complete)) return;
    setSaving(true);
    try {
      await saveBrand(draft);
      setDirty(false);
      if (continueToApp) router.replace("/admin/ready");
      else Alert.alert("Progress saved", "Your setup will be here when you return.");
    } catch { Alert.alert("Couldn’t save", "Your edits are still here. Please try again."); }
    finally { setSaving(false); }
  };
  if (!hydrated) return null;
  return <ScrollView style={{ flex: 1, backgroundColor: "#101419" }} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
    <Text style={{ color: "white", fontSize: 30 }}>Let’s create your app.</Text>
    <Text style={{ color: "#CBD0D6", marginTop: 12, lineHeight: 23 }}>Complete these six sections. Your sharing credentials become available after setup; you choose when to share them.</Text>
    {REQUIRED_FIELDS.map((item, index) => <View key={item.id} style={{ marginTop: 24, padding: 18, borderRadius: 14, backgroundColor: "#20262D" }}>
      <Text style={{ color: "white", fontSize: 19 }}>{index + 1}. {item.label}{item.met(draft) ? " ✓" : ""}</Text>
      {item.id === "name" && field("Full name", draft.realtor.name, v => identity("name", v))}
      {item.id === "portrait" && <Pressable onPress={pick} accessibilityRole="button" style={{ paddingVertical: 16 }}>
        {draft.portraitUrl ? <Image source={{ uri: draft.portraitUrl }} style={{ height: 180, borderRadius: 8 }} contentFit="contain" /> : null}
        <Text style={{ color: "#9ECFFF", marginTop: 12 }}>Choose portrait</Text>
      </Pressable>}
      {item.id === "city" && field("City or region", draft.realtor.city, v => identity("city", v))}
      {item.id === "contact" && <>{field("Phone", draft.realtor.phone, v => identity("phone", v))}{field("Email", draft.realtor.email, v => identity("email", v))}<Text style={{ color: "#CBD0D6", marginTop: 8 }}>Provide at least one contact method.</Text></>}
      {item.id === "heroLine" && field("Opening line", draft.realtor.heroMessage || draft.realtor.tagline, v => identity("heroMessage", v))}
      {item.id === "license" && <>{field("Brokerage", draft.credentials.license.brokerage, v => license("brokerage", v))}{field("License number", draft.credentials.license.number, v => license("number", v))}{field("License state or jurisdiction", draft.credentials.license.state, v => license("state", v))}</>}
    </View>)}
    <Pressable accessibilityRole="button" disabled={!complete || saving} onPress={() => void save(true)}
      style={{ marginTop: 24, minHeight: 54, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: complete ? "#287D4D" : "#3D444C", opacity: saving ? 0.6 : 1 }}>
      <Text style={{ color: "white", fontSize: 17 }}>{saving ? "Saving…" : "Save & Continue"}</Text>
    </Pressable>
    <Pressable disabled={saving || !dirty} onPress={() => void save(false)} style={{ minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={{ color: "#CBD0D6" }}>Save progress for later</Text></Pressable>
  </ScrollView>;
}
