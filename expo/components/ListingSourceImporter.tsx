import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { connectListingSource } from "@/lib/listingSourceService";
import { useAuth } from "@/contexts/AuthContext";
import { useListings } from "@/contexts/ListingsContext";

/** The same public URL flow is used during setup and when connecting another source. */
export default function ListingSourceImporter({ onImported, initialUrl = "" }: { onImported?: (count: number) => void; initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const { refresh } = useListings();
  const auth = useAuth();
  const submit = async () => {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try {
      if (!auth.isAdmin || !auth.realtorId) throw new Error("Sign in to your realtor account to import listings.");
      const result = await connectListingSource(url, auth.realtorId);
      await refresh();
      const count = result.imported ?? 0;
      setMessage(`${count} listing${count === 1 ? "" : "s"} connected. We’ll keep them updated automatically.${result.warning ? ` ${result.warning}` : ""}`);
      onImported?.(count);
    } catch (e) { setError(e instanceof Error ? e.message : "We couldn’t find your listings on that page. Try pasting the page where all of your active listings are shown."); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 14 }}>
    <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "600" }}>Bring in your listings</Text>
    <Text style={{ color: "#C8D0D0", fontSize: 15, lineHeight: 22 }}>Paste the page where your listings live. We’ll figure out the rest.</Text>
    <TextInput value={url} onChangeText={setUrl} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="url"
      accessibilityLabel="Public listings or profile URL" placeholder="Your website, Zillow or Realtor.com profile, IDX page, public MLS/Flexmls page, etc."
      placeholderTextColor="#89959E" multiline style={{ color: "white", minHeight: 76, padding: 14, borderRadius: 12,
        borderWidth: 1, borderColor: "#657079", backgroundColor: "#0C1014" }} />
    <Pressable accessibilityRole="button" disabled={busy || !url.trim()} onPress={() => void submit()}
      style={{ minHeight: 54, borderRadius: 12, backgroundColor: "#C2A276", alignItems: "center", justifyContent: "center", opacity: busy || !url.trim() ? 0.6 : 1 }}>
      {busy ? <ActivityIndicator color="#172027" /> : <Text style={{ color: "#172027", fontSize: 16, fontWeight: "700" }}>Import my listings</Text>}
    </Pressable>
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: "#8FD9B4", lineHeight: 22 }}>{message}</Text>}
    {!!error && <View style={{ padding: 14, borderRadius: 12, backgroundColor: "#1A2127" }}><Text accessibilityRole="alert" style={{ color: "#FFBAA9", lineHeight: 22 }}>{error}</Text></View>}
  </View>;
}
