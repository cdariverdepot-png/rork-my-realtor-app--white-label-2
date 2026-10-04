import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, ArrowUpRight, Link2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Pressable from "./TactilePressable";
import { SCREEN_BG } from "@/constants/backdrops";

export default function BuildUrlEntry({
  url,
  onChange,
  onSubmit,
  onExit,
  busy = false,
  preparing = false,
  error,
  listingCount = 0,
  onViewListings,
}: {
  url: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onExit: () => void;
  busy?: boolean;
  preparing?: boolean;
  error?: string;
  listingCount?: number;
  onViewListings?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submit = () => {
    if (busy) return;
    if (!url.trim()) {
      setNotice("Enter a public listings page URL above to start your import.");
      inputRef.current?.focus();
      return;
    }
    if (preparing) {
      setNotice("Your realtor session is still loading. Please try again in a moment.");
      return;
    }
    setNotice(null);
    onSubmit();
  };
  const feedback = error || notice;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#071A21" }}
    >
      <Image
        source={SCREEN_BG.listings}
        contentFit="cover"
        transition={0}
        style={StyleSheet.absoluteFill}
        accessible={false}
      />
      <LinearGradient
        colors={["#071A2170", "#071A2166", "#071A21E8", "#071A21"]}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 26,
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit app builder"
            onPress={onExit}
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 22,
              backgroundColor: "#FFFFFF13",
              borderWidth: 1,
              borderColor: "#FFFFFF33",
            }}
          >
            <ArrowLeft color="#F7F3E8" size={20} />
          </Pressable>
          <Text
            style={{
              fontSize: 10,
              letterSpacing: 3,
              color: "#E3D6BB",
              fontFamily: "Inter_500Medium",
            }}
          >
            MY REALTOR / STUDIO
          </Text>
        </View>
        <View
          style={{
            flexGrow: 1,
            flexShrink: 0,
            minHeight: 160,
            justifyContent: "flex-end",
            paddingTop: 50,
            paddingBottom: 34,
          }}
        >
          <View
            style={{
              height: 1,
              width: 48,
              backgroundColor: "#DBC5A1",
              marginBottom: 24,
            }}
          />
          <Text
            style={{
              color: "#F7F4EB",
              fontSize: 47,
              lineHeight: 50,
              letterSpacing: -1.6,
              fontFamily: "CormorantGaramond_500Medium",
              maxWidth: 420,
            }}
          >
            Bring in{"\n"}your listings
          </Text>
          <Text
            style={{
              color: "#E7E9E5",
              fontSize: 16,
              lineHeight: 25,
              marginTop: 18,
              maxWidth: 340,
            }}
          >
            Paste the page where your listings live. We’ll figure out the rest.
          </Text>
        </View>
        <View
          style={{
            borderRadius: 24,
            padding: 20,
            backgroundColor: "#071B27B8",
            borderWidth: 1,
            borderColor: "#CEE0D83D",
            boxShadow: "0px 20px 50px rgba(0,0,0,0.22)",
          }}
        >
          <Text style={{ color: "#F7F3E8", fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 8 }}>
            Listings page URL
          </Text>
          <Text style={{ color: "#CBDAD1", fontSize: 14, lineHeight: 21, marginBottom: 12 }}>
            Use your website, a public IDX or MLS page, Zillow, Realtor.com, or an individual property page.
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              borderBottomWidth: 1,
              borderColor: "#CBDAD17A",
              paddingBottom: 12,
            }}
          >
            <Link2 size={21} color="#DBC5A1" />
            <TextInput
              ref={inputRef}
              accessibilityLabel="Your listings URL"
              editable={!busy}
              value={url}
              onChangeText={(value) => { setNotice(null); onChange(value); }}
              placeholder="https://your-website.com"
              placeholderTextColor="#B4C0C6"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={submit}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 48,
                color: "#FFFFFF",
                fontSize: 15,
                paddingVertical: 10,
              }}
            />
          </View>
          {feedback ? (
            <View
              accessibilityRole="alert"
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                backgroundColor: "#F2AE9320",
              }}
            >
              <Text style={{ color: "#FFD6C4", fontSize: 14, lineHeight: 21 }}>
                {feedback}
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import my listings"
            onPress={submit}
            disabled={busy}
            style={{
              marginTop: 20,
              minHeight: 58,
              borderRadius: 16,
              paddingHorizontal: 20,
              backgroundColor: "#E1CEAD",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: busy ? 0.55 : 1,
            }}
          >
            <Text
              style={{
                color: "#11222B",
                fontSize: 16,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              {busy ? "Connecting…" : "Import my listings"}
            </Text>
            {busy ? (
              <ActivityIndicator color="#11222B" />
            ) : (
              <ArrowUpRight size={23} color="#11222B" />
            )}
          </Pressable>
        </View>
        {listingCount > 0 && onViewListings ? <Pressable accessibilityRole="button" onPress={onViewListings} style={{ padding: 18, marginTop: 12 }}>
          <Text style={{ color: "#E7E9E5", textAlign: "center" }}>{listingCount} listings already saved · View listings</Text>
        </Pressable> : null}
        <View style={{ height: 42 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
