import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUpRight, Check, Link2, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Pressable from "./TactilePressable";
import { SCREEN_BG } from "@/constants/backdrops";
import { useReducedMotion } from "@/hooks/useThemeMotion";

export default function BuildUrlEntry({
  url,
  onChange,
  onSubmit,
  busy = false,
  preparing = false,
  error,
  listingCount = 0,
  onViewListings,
  validationState = "empty",
}: {
  url: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  preparing?: boolean;
  error?: string;
  listingCount?: number;
  onViewListings?: () => void;
  validationState?: "empty" | "valid" | "invalid" | "checking" | "missing";
}) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const { reduced } = useReducedMotion();
  const [notice, setNotice] = useState<string | null>(null);
  const [urlFocused, setUrlFocused] = useState(false);
  const [ctaHot, setCtaHot] = useState(false);
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
    if (validationState === "checking") {
      setNotice("Finishing a quick check of that website…");
      return;
    }
    if (validationState === "invalid" || validationState === "missing") {
      setNotice(validationState === "missing" ? "We couldn’t reach that website. Check the address and try again." : "That website address doesn’t look complete yet.");
      inputRef.current?.focus();
      return;
    }
    setNotice(null);
    onSubmit();
  };
  const feedback = error || notice;
  const drift = reduced
    ? 0
    : scrollY.interpolate({
        inputRange: [-140, 0, 520],
        outputRange: [-22, 0, 42],
        extrapolate: "clamp",
      });
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#071A21" }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: -120,
          bottom: -160,
          transform: [{ translateY: drift }],
        }}
      >
        <Image
          source={SCREEN_BG.listings}
          contentFit="cover"
          transition={0}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      </Animated.View>
      <LinearGradient
        colors={["#071A2160", "#071A2155", "#071A21D0", "#071A21"]}
        locations={[0, 0.35, 0.72, 1]}
        style={{ position: "absolute", left: 0, right: 0, top: -120, bottom: -180 }}
        pointerEvents="none"
      />
      <Animated.ScrollView
        keyboardShouldPersistTaps="handled"
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 26,
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 48,
        }}
        style={Platform.OS === "web" ? (webScroll as any) : undefined}
      >
        <View style={{ alignItems: "center" }}>
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
        <View style={styles.glassShadow}>
          <View style={styles.glassClip}>
            <BlurView pointerEvents="none" intensity={52} tint="dark" style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={styles.glassTint} />
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0.05)", "rgba(255,255,255,0)"]}
              locations={[0, 0.16, 0.42]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.glassBody}>
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
                  borderColor: validationState === "valid" ? "rgba(116,211,164,0.92)" : validationState === "invalid" || validationState === "missing" ? "rgba(255,157,137,0.92)" : urlFocused ? "rgba(225,206,173,0.95)" : "rgba(203,218,209,0.42)",
                  paddingBottom: 12,
                  transform: [{ translateY: urlFocused ? -1 : 0 }],
                  ...(Platform.OS === "web" ? { transitionProperty: "border-color, transform", transitionDuration: "180ms" } : null),
                }}
              >
                <Link2 size={21} color={urlFocused ? "#F3E6CC" : "#DBC5A1"} />
                <TextInput
                  ref={inputRef}
                  accessibilityLabel="Your listings URL"
                  editable={!busy}
                  value={url}
                  onChangeText={(value) => { setNotice(null); onChange(value); }}
                  onFocus={() => setUrlFocused(true)}
                  onBlur={() => setUrlFocused(false)}
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
                <View pointerEvents="none" style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
                  {validationState === "checking" ? <ActivityIndicator size="small" color="#E3D6BB" /> : validationState === "valid" ? <Check size={21} color="#74D3A4" strokeWidth={2.8} /> : validationState === "invalid" || validationState === "missing" ? <X size={21} color="#FF9D89" strokeWidth={2.5} /> : null}
                </View>
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
                onFocus={() => setCtaHot(true)}
                onBlur={() => setCtaHot(false)}
                style={{
                  marginTop: 20,
                  minHeight: 58,
                  borderRadius: 18,
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {({ pressed }) => (
                  <LinearGradient
                    colors={pressed ? ["#D7C196", "#C4AD84", "#B89A6E"] : ["#F8F1E0", "#E6D3B0", "#CDB58A"]}
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={[styles.cta, ctaHot && styles.ctaHot, pressed && styles.ctaPressed]}
                  >
                    <Text style={styles.ctaLabel}>
                      {busy ? "Connecting…" : "Import my listings"}
                    </Text>
                    {busy ? (
                      <ActivityIndicator color="#122028" />
                    ) : (
                      <View style={{ transform: [{ translateX: pressed ? 3 : 0 }, { translateY: pressed ? -3 : 0 }] }}>
                        <ArrowUpRight size={22} color="#122028" strokeWidth={2.4} />
                      </View>
                    )}
                  </LinearGradient>
                )}
              </Pressable>
            </View>
          </View>
        </View>
        {listingCount > 0 && onViewListings ? <Pressable accessibilityRole="button" onPress={onViewListings} style={{ padding: 18, marginTop: 12 }}>
          <Text style={{ color: "#E7E9E5", textAlign: "center" }}>{listingCount} listings already saved · View listings</Text>
        </Pressable> : null}
        <View style={{ height: 56 }} />
      </Animated.ScrollView>
    </KeyboardAvoidingView>
  );
}

const webScroll = { overscrollBehaviorY: "auto" } as const;

const styles = StyleSheet.create({
  glassShadow: {
    borderRadius: 26,
    boxShadow: "0px 22px 50px rgba(0, 0, 0, 0.28)",
  },
  glassClip: {
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  glassTint: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(8, 22, 32, 0.38)",
  },
  glassBody: {
    padding: 20,
  },
  cta: {
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    boxShadow: "0px 12px 24px rgba(62, 40, 14, 0.32), inset 0px 1px 0px rgba(255,255,255,0.72)",
  },
  ctaHot: {
    boxShadow: "0px 0px 0px 3px rgba(225,206,173,0.38), 0px 14px 28px rgba(62, 40, 14, 0.36), inset 0px 1px 0px rgba(255,255,255,0.8)",
  },
  ctaPressed: {
    borderColor: "rgba(255,255,255,0.35)",
  },
  ctaLabel: {
    color: "#122028",
    fontSize: 17,
    letterSpacing: 0.15,
    fontFamily: "Inter_600SemiBold",
  },
});
