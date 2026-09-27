import React, { useCallback, useEffect, useMemo } from "react";
import { backOr } from "@/lib/navIntent";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/contexts/ClientsContext";
import { useMessages } from "@/contexts/MessagesContext";
import EmptyState from "@/components/EmptyState";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";

const ACCENT = SCREEN_ACCENT.adminMessages;
const LINE = "rgba(244,239,230,0.12)";
const INK = "#0B0D0C";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * /admin/messages — the realtor's client inbox.
 *
 * Lists every client on the roster with a preview of their private thread,
 * the last activity time, and an unread badge. Tapping a client opens that
 * client's isolated conversation.
 */
export default function AdminMessages() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, hydrated } = useAuth();
  const { clients } = useClients();
  const { summaries, refreshSummaries, totalUnreadForRealtor } = useMessages();

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  useFocusEffect(
    useCallback(() => {
      void refreshSummaries();
    }, [refreshSummaries])
  );

  const ordered = useMemo(() => {
    const withThread = clients.filter((c) => summaries[c.id]);
    const without = clients.filter((c) => !summaries[c.id]);
    withThread.sort((a, b) => (summaries[b.id]?.lastAt ?? 0) - (summaries[a.id]?.lastAt ?? 0));
    without.sort((a, b) => a.name.localeCompare(b.name));
    return [...withThread, ...without];
  }, [clients, summaries]);

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="adminMessages" intensity="deep" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable hitSlop={12} onPress={() => backOr(router)} style={styles.back}>
          <ChevronLeft size={20} color={dark.text} strokeWidth={1.6} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>CLIENT INBOX</Text>
          <Text style={styles.title}>Messages</Text>
        </View>
        {totalUnreadForRealtor > 0 ? (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{totalUnreadForRealtor > 99 ? "99+" : totalUnreadForRealtor}</Text>
          </View>
        ) : null}
      </View>

      {clients.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            Icon={MessageSquare}
            eyebrow="QUIET INBOX"
            title="No clients yet."
            body="Add a client or share your invite code so they can text you privately from inside the app."
            accent={ACCENT}
            ctaLabel="ADD A CLIENT"
            onCtaPress={() => router.push("/admin/clients")}
          />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
          showsVerticalScrollIndicator={false}
        >
          {ordered.map((c) => {
            const s = summaries[c.id];
            const unread = s?.unreadForRealtor ?? 0;
            return (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/admin/thread/${c.id}`)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={[styles.avatar, unread > 0 && styles.avatarUnread]}>
                  <Text style={styles.avatarInitial}>
                    {c.name.trim().charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {c.name}
                    </Text>
                    {s ? <Text style={styles.time}>{timeAgo(s.lastAt)}</Text> : null}
                  </View>
                  <Text
                    style={[styles.preview, unread > 0 && styles.previewUnread]}
                    numberOfLines={1}
                  >
                    {s
                      ? `${s.lastRole === "realtor" ? "You: " : ""}${s.lastText}`
                      : "No messages yet — say hello"}
                  </Text>
                </View>
                {unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
                  </View>
                ) : (
                  <ChevronRight size={16} color={brand.muted} strokeWidth={1.6} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "rgba(8,10,9,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 3,
  },
  title: { fontFamily: fonts.serif, color: dark.text, fontSize: 24, letterSpacing: -0.3 },
  headerBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadgeText: {
    fontFamily: fonts.sansSemi,
    color: INK,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  emptyWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tint(ACCENT, 0.14),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: LINE,
  },
  avatarUnread: { borderColor: tint(ACCENT, 0.6) },
  avatarInitial: { fontFamily: fonts.serif, color: dark.text, fontSize: 20 },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 3,
  },
  name: { fontFamily: fonts.serif, color: dark.text, fontSize: 16, flex: 1 },
  time: { fontFamily: fonts.sans, color: dark.textMuted, fontSize: 11 },
  preview: { fontFamily: fonts.sans, color: dark.textMuted, fontSize: 13 },
  previewUnread: { color: dark.text, fontFamily: fonts.sansMedium },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: fonts.sansSemi,
    color: INK,
    fontSize: 10,
    letterSpacing: 0.2,
  },
});
