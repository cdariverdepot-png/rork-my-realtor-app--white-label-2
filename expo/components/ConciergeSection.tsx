import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowUpRight } from "lucide-react-native";
import { brand, fonts } from "@/constants/colors";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useMessages } from "@/contexts/MessagesContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useBrand } from "@/contexts/BrandContext";
import PressableScale from "./PressableScale";

/**
 * Editorial concierge index — numbered, serif, hairline-divided rows.
 * Replaces the icon-tile grid for a magazine-spread feel.
 */
export default function ConciergeSection() {
  const router = useRouter();
  const { totalFavorites } = useFavorites();
  const { messages } = useMessages();
  const { unreadCount } = useNotifications();
  const { brand: b, theme } = useBrand();
  const firstName = (b.realtor.name.split(" ")[0] ?? b.realtor.name).trim();
  const unreadMsgs = messages.filter((m) => m.role === "realtor" && !m.read).length;

  const go = (path: string) => () => {
    router.push(path as never);
  };

  const rows: {
    key: string;
    label: string;
    sub: string;
    meta?: string;
    path: string;
  }[] = [
    {
      key: "fav",
      label: "Watchlists",
      sub: "Curated against your taste",
      meta: totalFavorites > 0 ? `${totalFavorites} saved` : undefined,
      path: "/favorites",
    },
    {
      key: "chat",
      label: "Direct line",
      sub: firstName ? `Message ${firstName}` : "Send a private message",
      meta: unreadMsgs > 0 ? `${unreadMsgs} new` : undefined,
      path: "/messages",
    },
    {
      key: "cal",
      label: "Private showings",
      sub: "Off-market & by appointment",
      path: "/calendar",
    },
    {
      key: "docs",
      label: "Paperwork",
      sub: "Contracts, disclosures, signatures",
      path: "/documents",
    },
    {
      key: "ins",
      label: "Field notes",
      sub: "What I'm seeing on the ground",
      path: "/insights",
    },
    {
      key: "notif",
      label: "Concierge alerts",
      sub: "Curated, never spam",
      meta: unreadCount > 0 ? `${unreadCount} new` : undefined,
      path: "/notifications",
    },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.eyebrowRow}>
          <View style={[styles.rule, { backgroundColor: theme.surface.hairline }]} />
          <Text style={[styles.eyebrow, { color: theme.accent.deep }]}>
            {b.concierge.eyebrow.trim() || "Your private concierge"}
          </Text>
        </View>
        <Text style={[styles.title, { fontFamily: theme.display }]}>
          {b.concierge.title.trim() ? b.concierge.title : "Everything in one place."}
        </Text>
      </View>

      <View style={[styles.list, { borderBottomColor: theme.surface.hairline }]}>
        {rows.map((r, i) => (
          <PressableScale
            key={r.key}
            onPress={go(r.path)}
            haptic="selection"
            scaleTo={0.99}
            style={[
              styles.row,
              { borderTopColor: theme.surface.hairline },
              i === 0 && styles.rowFirst,
            ]}
          >
            <Text
              style={[
                styles.num,
                { color: theme.accent.base, fontFamily: theme.displayItalic },
              ]}
            >
              {String(i + 1).padStart(2, "0")}
            </Text>
            <View style={styles.body}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { fontFamily: theme.display }]}>{r.label}</Text>
                {r.meta ? (
                  <View style={[styles.pill, { backgroundColor: theme.band.base }]}>
                    <Text style={[styles.pillText, { color: theme.onBand.text }]}>{r.meta}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.sub}>{r.sub}</Text>
            </View>
            <ArrowUpRight size={14} color={brand.muted} strokeWidth={1.5} />
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 56, paddingBottom: 8 },
  header: { paddingHorizontal: 24, marginBottom: 22 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  rule: { width: 28, height: 1, marginRight: 10 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    color: brand.ink,
  },
  list: {
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    gap: 18,
    borderTopWidth: 1,
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  num: {
    fontSize: 13,
    letterSpacing: 1,
    width: 22,
  },
  body: { flex: 1 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  label: {
    fontFamily: fonts.serif,
    color: brand.ink,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: fonts.sans,
    color: brand.muted,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
});
