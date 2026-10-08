import { listingStatusLabel } from "@/lib/listingStatusLabel";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { backOr } from "@/lib/navIntent";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronLeft,
  Plus,
  Pencil,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  ChevronUp,
  ChevronDown,
} from "lucide-react-native";
import { fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useListings, type ListingStatus, type ManagedListing } from "@/contexts/ListingsContext";

/** Shares the dashboard's dark palette so the full portfolio view reads as a
 *  natural extension of the command center (it's pushed from "VIEW ALL"). */
const admin = {
  bg: "#08090C",
  surface: "rgba(255,255,255,0.035)",
  surfaceHi: "rgba(255,255,255,0.06)",
  hairline: "rgba(255,255,255,0.08)",
  hairlineGold: "rgba(210,163,67,0.32)",
  goldSoft: "rgba(210,163,67,0.12)",
  text: "#F1ECE2",
  textMuted: "rgba(241,236,226,0.62)",
  textDim: "rgba(241,236,226,0.40)",
  gold: "#D2A343",
  goldLight: "#EBC776",
  green: "#62D29A",
  amber: "#F5B544",
  red: "#E5664F",
} as const;

const PAD = 22;

const STATUS_META: Record<ListingStatus, { label: string; color: string }> = {
  active: { label: "ACTIVE", color: admin.green },
  pending: { label: "PENDING", color: admin.amber },
  contingent: { label: "CONTINGENT", color: admin.amber },
  sold: { label: "SOLD", color: admin.red },
  off_market: { label: "OFF MARKET", color: admin.red },
};

function formatRefreshed(ts?: number): string {
  if (!ts) return "Never synced";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just synced";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `Synced ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Synced ${h}h ago`;
  return `Synced ${Math.floor(h / 24)}d ago`;
}

export default function AdminListings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, hydrated } = useAuth();
  const { brand: brandData } = useBrand();
  const { all, toggleHidden, remove, move, refreshFromSource } = useListings();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const brandName = (brandData.realtor.brandName || "PORTFOLIO").replace(/_/g, " ");
  const liveCount = useMemo(() => all.filter((l) => !l.hidden).length, [all]);
  const hiddenCount = all.length - liveCount;

  const tap = (cb: () => void) => () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    cb();
  };

  const handleRefresh = useCallback(
    async (l: ManagedListing) => {
      if (!l.sourceUrl) {
        Alert.alert(
          "No source URL",
          `"${l.title}" wasn't imported from a link, so there's nothing to refresh. Add a source URL by editing it.`
        );
        return;
      }
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setRefreshingId(l.id);
      try {
        const res = await refreshFromSource(l.id);
        if (!res.ok) Alert.alert("Couldn't refresh", res.error ?? "Please try again in a moment.");
        else if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } finally {
        setRefreshingId(null);
      }
    },
    [refreshFromSource]
  );

  const confirmDelete = useCallback(
    (l: ManagedListing) => {
      const doRemove = () => {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        remove(l.id);
      };
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.confirm(`Delete "${l.title}"?`)) doRemove();
        return;
      }
      Alert.alert("Delete listing", `"${l.title}" will be removed permanently.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doRemove },
      ]);
    },
    [remove]
  );

  if (!hydrated || !isAdmin) {
    return <View style={{ flex: 1, backgroundColor: admin.bg }} />;
  }

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.ambientGlow}>
        <LinearGradient
          colors={["rgba(210,163,67,0.16)", "rgba(210,163,67,0.03)", "transparent"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable onPress={tap(() => backOr(router))} hitSlop={10} style={styles.iconBtn}>
          <ChevronLeft size={18} color={admin.goldLight} strokeWidth={1.7} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>{brandName} · PORTFOLIO</Text>
          <Text style={styles.headerTitle}>All listings</Text>
        </View>
        <Pressable onPress={tap(() => router.push("/admin/add"))} hitSlop={10} style={styles.addBtn}>
          <Plus size={14} color={admin.bg} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          <Text style={{ color: admin.text }}>{liveCount}</Text> live
          {hiddenCount > 0 ? (
            <Text>
              {"   ·   "}
              <Text style={{ color: admin.text }}>{hiddenCount}</Text> hidden
            </Text>
          ) : null}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: insets.bottom + 60, paddingTop: 6 }}
        showsVerticalScrollIndicator={false}
      >
        {all.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No listings yet</Text>
            <Text style={styles.emptySub}>Import your first home from any public listing link.</Text>
            <Pressable onPress={tap(() => router.push("/admin/add"))} style={styles.emptyCta}>
              <Plus size={13} color={admin.bg} strokeWidth={2.4} />
              <Text style={styles.emptyCtaText}>ADD A LISTING</Text>
            </Pressable>
          </View>
        ) : (
          all.map((item, idx) => (
            <ListingRow
              key={item.id}
              item={item}
              isFirst={idx === 0}
              isLast={idx === all.length - 1}
              refreshing={refreshingId === item.id}
              onOpen={tap(() => router.push(`/admin/edit/${item.id}`))}
              onToggleHidden={tap(() => toggleHidden(item.id))}
              onDelete={() => confirmDelete(item)}
              onRefresh={() => handleRefresh(item)}
              onMoveUp={tap(() => move(item.id, "up"))}
              onMoveDown={tap(() => move(item.id, "down"))}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ListingRow({
  item,
  isFirst,
  isLast,
  refreshing,
  onOpen,
  onToggleHidden,
  onDelete,
  onRefresh,
  onMoveUp,
  onMoveDown,
}: {
  item: ManagedListing;
  isFirst: boolean;
  isLast: boolean;
  refreshing: boolean;
  onOpen: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const status: ListingStatus = item.status ?? "active";
  const meta = STATUS_META[status];
  return (
    <View style={[styles.card, item.hidden && styles.cardHidden]}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.cardMain, pressed && { opacity: 0.92 }]}>
        <View style={styles.thumb}>
          <Image source={{ uri: item.images[0] ?? item.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
          {item.hidden ? (
            <View style={styles.thumbHidden}>
              <EyeOff size={14} color={admin.text} strokeWidth={1.7} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cardTopRow}>
            <View style={[styles.statusBadge, { borderColor: meta.color }]}>
              <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
              <Text style={[styles.statusText, { color: meta.color }]}>{listingStatusLabel(item).toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardHood} numberOfLines={1}>
            {item.neighborhood.toUpperCase()}
          </Text>
          <View style={styles.cardMetaRow}>
            <Text style={styles.cardPrice}>{item.price}</Text>
            <Text style={styles.cardDot}>·</Text>
            <Text style={styles.cardSpec}>
              {item.beds} BD · {item.baths} BA
            </Text>
          </View>
          {item.ownership === "featured" ? (
            <Text style={styles.cardSync} numberOfLines={1}>
              {`Featured · listed by ${item.listingOffice ?? "another office"} · not shown as yours`}
            </Text>
          ) : null}
          <Text style={styles.cardSync} numberOfLines={1}>
            {item.sourceArchived ? "Archived after repeated source checks" : item.syncState === "unavailable" ? "Couldn’t verify source — retrying automatically" : item.syncState === "status-unconfirmed" ? "Details checked · status not provided by source" : item.sourceUrl ? formatRefreshed(item.lastRefreshedAt) : "No source URL"}
          </Text>
        </View>
        <View style={styles.reorderCol}>
          <Pressable onPress={onMoveUp} disabled={isFirst} hitSlop={6} style={[styles.reorderBtn, isFirst && { opacity: 0.3 }]}>
            <ChevronUp size={15} color={admin.goldLight} strokeWidth={1.8} />
          </Pressable>
          <Pressable onPress={onMoveDown} disabled={isLast} hitSlop={6} style={[styles.reorderBtn, isLast && { opacity: 0.3 }]}>
            <ChevronDown size={15} color={admin.goldLight} strokeWidth={1.8} />
          </Pressable>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <ActionBtn label="EDIT" Icon={Pencil} onPress={onOpen} />
        <View style={styles.actionDivider} />
        <ActionBtn
          label="SYNC"
          Icon={RefreshCw}
          gold
          loading={refreshing}
          disabled={refreshing || !item.sourceUrl}
          onPress={onRefresh}
        />
        <View style={styles.actionDivider} />
        <ActionBtn label={item.hidden ? "SHOW" : "HIDE"} Icon={item.hidden ? EyeOff : Eye} onPress={onToggleHidden} />
        <View style={styles.actionDivider} />
        <ActionBtn label="DELETE" Icon={Trash2} danger onPress={onDelete} />
      </View>
    </View>
  );
}

function ActionBtn({
  label,
  Icon,
  onPress,
  gold,
  danger,
  loading,
  disabled,
}: {
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
  gold?: boolean;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  const color = danger ? admin.red : gold ? admin.goldLight : admin.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.actionBtn, disabled && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}
      hitSlop={4}
    >
      {loading ? <ActivityIndicator size="small" color={admin.goldLight} /> : <Icon size={12} color={color} strokeWidth={1.8} />}
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: admin.bg },
  ambientGlow: { position: "absolute", top: -80, left: -60, right: -60, height: 320 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: PAD,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: admin.hairlineGold,
    backgroundColor: admin.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerEyebrow: { fontFamily: fonts.sansMedium, color: admin.goldLight, fontSize: 9, letterSpacing: 2.4, marginBottom: 3 },
  headerTitle: { fontFamily: fonts.serif, color: admin.text, fontSize: 22, letterSpacing: -0.3 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: admin.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  countRow: { paddingHorizontal: PAD, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: admin.hairline },
  countText: { fontFamily: fonts.sansMedium, color: admin.textDim, fontSize: 11, letterSpacing: 1.4 },

  card: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: admin.hairline,
    backgroundColor: admin.surface,
    borderRadius: 14,
    overflow: "hidden",
  },
  cardHidden: { opacity: 0.72 },
  cardMain: { flexDirection: "row", gap: 14, padding: 14 },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: admin.surfaceHi,
  },
  thumbHidden: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,6,8,0.55)" },
  cardTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontFamily: fonts.sansSemi, fontSize: 8, letterSpacing: 1.2 },
  cardTitle: { fontFamily: fonts.serif, color: admin.text, fontSize: 16, letterSpacing: -0.2 },
  cardHood: { fontFamily: fonts.sansMedium, color: admin.textDim, fontSize: 9.5, letterSpacing: 1.6, marginTop: 3 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 7 },
  cardPrice: { fontFamily: fonts.sansSemi, color: admin.goldLight, fontSize: 13 },
  cardDot: { color: admin.textDim, fontSize: 13 },
  cardSpec: { fontFamily: fonts.sans, color: admin.textMuted, fontSize: 11 },
  cardSync: { fontFamily: fonts.sans, color: admin.textDim, fontSize: 9.5, marginTop: 6 },
  reorderCol: { justifyContent: "center", gap: 8 },
  reorderBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: admin.hairline,
    alignItems: "center",
    justifyContent: "center",
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: admin.hairline,
  },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  actionText: { fontFamily: fonts.sansSemi, fontSize: 9.5, letterSpacing: 1.3 },
  actionDivider: { width: 1, height: 20, backgroundColor: admin.hairline },

  empty: {
    marginTop: 40,
    alignItems: "center",
    gap: 8,
    paddingVertical: 40,
    borderWidth: 1,
    borderColor: admin.hairline,
    borderRadius: 16,
    backgroundColor: admin.surface,
  },
  emptyTitle: { fontFamily: fonts.serif, color: admin.text, fontSize: 19 },
  emptySub: { fontFamily: fonts.sans, color: admin.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 30 },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: admin.gold,
  },
  emptyCtaText: { fontFamily: fonts.sansSemi, color: admin.bg, fontSize: 11, letterSpacing: 1.6 },
});
