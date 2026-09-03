import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { useRouter, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Home as HomeIcon,
  Heart,
  MessageCircle,
  CalendarDays,
  User,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, dark, fonts } from "@/constants/colors";
import { useBrand } from "@/contexts/BrandContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useMessages } from "@/contexts/MessagesContext";

/** Floating concierge tab bar — sticks low on the screen so returning
 *  clients can jump straight to a watchlist, message thread or showing. */
type TabKey = "home" | "watchlist" | "messages" | "showings" | "account";

const TABS: { key: TabKey; label: string; path: string; Icon: typeof HomeIcon }[] = [
  { key: "home", label: "Home", path: "/", Icon: HomeIcon },
  { key: "watchlist", label: "Saved", path: "/favorites", Icon: Heart },
  { key: "messages", label: "Concierge", path: "/messages", Icon: MessageCircle },
  { key: "showings", label: "Showings", path: "/calendar", Icon: CalendarDays },
  { key: "account", label: "Account", path: "/account", Icon: User },
];

export const BOTTOM_NAV_HEIGHT = 64;

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme } = useBrand();
  const { totalFavorites } = useFavorites();
  const { messages } = useMessages();
  const unreadMsgs = messages.filter((m) => m.role === "realtor" && !m.read).length;

  const mount = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(mount, {
      toValue: 1,
      tension: 60,
      friction: 9,
      useNativeDriver: true,
    }).start();
  }, [mount]);

  const handle = (path: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    if (path === "/") {
      router.replace("/");
    } else {
      router.push(path as never);
    }
  };

  const translateY = mount.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  const activeKey: TabKey =
    pathname === "/" || pathname === ""
      ? "home"
      : pathname.startsWith("/favorites") || pathname.startsWith("/watchlist")
      ? "watchlist"
      : pathname.startsWith("/messages") || pathname.startsWith("/message")
      ? "messages"
      : pathname.startsWith("/calendar") || pathname.startsWith("/book")
      ? "showings"
      : pathname.startsWith("/account")
      ? "account"
      : "home";

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          opacity: mount,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.bar,
          {
            borderColor: theme.onBand.veilLine,
            backgroundColor: Platform.OS === "web" ? theme.onBand.scrimStrong : "transparent",
          },
        ]}
        pointerEvents="auto"
      >
        {Platform.OS !== "web" ? (
          <BlurView
            tint="dark"
            intensity={50}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={[styles.barTint, { backgroundColor: theme.onBand.scrimSoft }]} />
        <View style={styles.row}>
          {TABS.map(({ key, label, path, Icon }) => {
            const active = key === activeKey;
            const badge =
              key === "watchlist" && totalFavorites > 0
                ? totalFavorites
                : key === "messages" && unreadMsgs > 0
                ? unreadMsgs
                : 0;
            return (
              <Pressable
                key={key}
                onPress={() => handle(path)}
                style={styles.tab}
                hitSlop={6}
              >
                <View style={styles.iconWrap}>
                  <Icon
                    size={20}
                    color={active ? theme.accent.base : theme.onBand.muted}
                    strokeWidth={active ? 2 : 1.6}
                  />
                  {badge > 0 ? (
                    <View style={[styles.badge, { backgroundColor: theme.accent.base }]}>
                      <Text style={styles.badgeText}>
                        {badge > 9 ? "9+" : String(badge)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.label,
                    { color: active ? theme.accent.light : theme.onBand.muted },
                  ]}
                >
                  {label}
                </Text>
                {active ? (
                  <View style={[styles.activeDot, { backgroundColor: theme.accent.base }]} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  bar: {
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  barTint: {
    ...StyleSheet.absoluteFillObject,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 4,
  },
  iconWrap: { position: "relative" },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  activeDot: {
    position: "absolute",
    bottom: -2,
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 9,
    letterSpacing: 0.3,
  },
});
