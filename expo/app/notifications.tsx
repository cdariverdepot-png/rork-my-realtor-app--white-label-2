import React, { useCallback, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useBrand } from '@/contexts/BrandContext';
import { Bell, BellOff, Home, TrendingDown, MessageCircle, CalendarCheck } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useNotifications, type NotifKind } from "@/contexts/NotificationsContext";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";

const KIND_ICON: Record<NotifKind, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  new: Home,
  price: TrendingDown,
  status: Home,
  personal: MessageCircle,
  appointment: CalendarCheck,
};

const KIND_LABEL: Record<NotifKind, string> = {
  new: "NEW LISTING",
  price: "PRICE CHANGE",
  status: "STATUS",
  personal: "FROM ELIZA",
  appointment: "SHOWING",
};

function rel(t: number): string {
  const ms = Date.now() - t;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { items, permission, requestPermission, markRead, markAllRead } = useNotifications();
  const { brand: currentBrand } = useBrand();
  const markAllReadRef = useRef(markAllRead);
  markAllReadRef.current = markAllRead;
  // Mark once on blur, not on every callback identity change. The old cleanup
  // wrote a new revision, recreated its dependency, then wrote again forever.
  useFocusEffect(useCallback(() => () => markAllReadRef.current(), []));

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="notifications" />
      <ModalChrome eyebrow="Concierge alerts" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Reveal delay={40}>
        <Text style={styles.intro}>
          Curated, never spam. Just the moments worth your attention.
        </Text>
        </Reveal>

        {permission !== "granted" && (
          <Reveal delay={120}>
          <View style={styles.permCard}>
            <View style={styles.permIcon}>
              {permission === "denied" ? (
                <BellOff size={18} color={brand.ivory} strokeWidth={1.5} />
              ) : (
                <Bell size={18} color={brand.ivory} strokeWidth={1.5} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>Stay in the loop, quietly.</Text>
              <Text style={styles.permSub}>
                Allow notifications and I'll send you only the things I'd call you about myself.
              </Text>
            </View>
            <PressableScale onPress={requestPermission} haptic="medium" scaleTo={0.96} style={styles.permBtn}>
              <Text style={styles.permBtnText}>Allow</Text>
            </PressableScale>
          </View>
          </Reveal>
        )}

        {items.length === 0 ? (
          <Reveal delay={180}>
          <View style={styles.empty}>
            <Bell size={20} color={brand.gold} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>You're all caught up.</Text>
            <Text style={styles.emptySub}>I'll be in touch when something matters.</Text>
          </View>
          </Reveal>
        ) : (
          <View style={styles.list}>
            {items.map((n, i) => {
              const Icon = KIND_ICON[n.kind];
              return (
                <Reveal key={n.id} delay={160 + i * 60}>
                <PressableScale
                  onPress={() => {
                    markRead(n.id);
                    if (n.listingId) router.push(`/listing/${n.listingId}`);
                  }}
                  haptic="selection"
                  scaleTo={0.99}
                  style={[styles.row, !n.read && styles.rowUnread]}
                >
                  {!n.read && <View style={styles.dot} />}
                  <View style={styles.rowIcon}>
                    <Icon size={16} color={brand.ivory} strokeWidth={1.5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.kind}>{n.kind === 'personal' ? `FROM ${(currentBrand.realtor.name.split(' ')[0] || 'YOUR REALTOR').toUpperCase()}` : KIND_LABEL[n.kind]}</Text>
                    <Text style={styles.title}>{n.title}</Text>
                    <Text style={styles.body} numberOfLines={3}>
                      {n.body}
                    </Text>
                    <Text style={styles.time}>{rel(n.createdAt)}</Text>
                  </View>
                </PressableScale>
                </Reveal>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  intro: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginHorizontal: 24,
    marginBottom: 22,
  },
  permCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 22,
    padding: 16,
    backgroundColor: "rgba(14,16,15,0.72)",
    borderWidth: 1,
    borderColor: dark.border,
  },
  permIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: dark.borderGold,
    backgroundColor: dark.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  permTitle: { fontFamily: fonts.serif, color: dark.text, fontSize: 15 },
  permSub: { fontFamily: fonts.sans, color: dark.textMuted, fontSize: 11, marginTop: 2, lineHeight: 16 },
  permBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: dark.gold,
    borderRadius: 6,
  },
  permBtnText: { fontFamily: fonts.sansSemi, color: dark.bg, fontSize: 11, letterSpacing: 1.5 },
  list: { paddingHorizontal: 16, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 14,
    paddingLeft: 22,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.7)",
  },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: brand.gold },
  dot: {
    position: "absolute",
    left: 8,
    top: 22,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: brand.gold,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.goldSoft,
    borderWidth: 1,
    borderColor: dark.borderGold,
    alignItems: "center",
    justifyContent: "center",
  },
  kind: { fontFamily: fonts.sansMedium, color: dark.gold, fontSize: 9, letterSpacing: 2 },
  title: { fontFamily: fonts.serif, color: dark.text, fontSize: 16, marginTop: 4, letterSpacing: -0.2 },
  body: { fontFamily: fonts.sans, color: dark.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  time: { fontFamily: fonts.sans, color: dark.textDim, fontSize: 11, marginTop: 6 },
  empty: { margin: 24, padding: 32, backgroundColor: dark.bgCard, borderWidth: 1, borderColor: dark.border, borderRadius: 12, alignItems: "center", gap: 10 },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 22, color: dark.text, marginTop: 6 },
  emptySub: { fontFamily: fonts.serifItalic, color: dark.textMuted, fontSize: 14 },
});
