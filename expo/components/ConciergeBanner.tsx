import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Bell } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useBrand } from "@/contexts/BrandContext";

/**
 * Floating in-app banner that surfaces incoming concierge notifications
 * while the app is in the foreground. Auto-dismisses after a few seconds.
 */
export default function ConciergeBanner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { foreground, dismissForeground, markRead, permission, requestPermission } =
    useNotifications();
  const { brand: b, theme } = useBrand();
  const firstName = (b.realtor.name.split(" ")[0] ?? b.realtor.name).toUpperCase();

  const translate = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Ask for permission once after mount on native devices.
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (permission !== "undetermined") return;
    const t = setTimeout(() => {
      requestPermission().catch(() => {});
    }, 1400);
    return () => clearTimeout(t);
  }, [permission, requestPermission]);

  useEffect(() => {
    if (foreground) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {}
        );
      }
      Animated.parallel([
        Animated.timing(translate, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translate, {
          toValue: -160,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [foreground, opacity, translate]);

  if (!foreground) return null;

  const onTap = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    markRead(foreground.id);
    if (foreground.listingId) {
      router.push(`/listing/${foreground.listingId}`);
    } else {
      router.push("/notifications");
    }
    dismissForeground();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8, opacity, transform: [{ translateY: translate }] },
      ]}
    >
      <Pressable
        onPress={onTap}
        onLongPress={dismissForeground}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.band.deep, borderColor: theme.accent.base },
          pressed && { opacity: 0.94 },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: theme.accent.base }]}>
          <Bell size={14} color={theme.band.deep} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: theme.accent.light }]}>
            {b.realtor.brandName} PRIVATE · FROM {firstName}
          </Text>
          <Text style={[styles.title, { fontFamily: theme.display }]} numberOfLines={1}>
            {foreground.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>
            {foreground.body}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    zIndex: 9999,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.forestDeep,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.45)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 22,
    elevation: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: brand.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 1.6,
  },
  title: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 15,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  body: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.78)",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
});
