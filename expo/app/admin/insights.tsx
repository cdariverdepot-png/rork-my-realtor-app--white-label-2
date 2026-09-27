import React, { useMemo } from "react";
import { backOr } from "@/lib/navIntent";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  FileSignature,
  Flame,
  Snowflake,
  Sparkles,
  TrendingDown,
  UserPlus,
  Users,
} from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useEngagement, type EngagementBucket } from "@/contexts/EngagementContext";
import { useClients } from "@/contexts/ClientsContext";
import { useListings } from "@/contexts/ListingsContext";

const BUCKET_LABEL: Record<EngagementBucket, string> = {
  hot: "HOT",
  warm: "WARM",
  cooling: "COOLING",
  cold: "QUIET",
};

const BUCKET_COLOR: Record<EngagementBucket, string> = {
  hot: "#A04A3C",
  warm: brand.gold,
  cooling: brand.muted,
  cold: brand.muted,
};

/** Editorial textures + accent colors for the weekly digest cards —
 *  same palette as the admin home digest strip. */
const DIGEST_IMAGES = {
  leads: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/c0c56eed-afa3-49a0-9867-9fa3725bbae2.png" },
  viewed: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/2195dcf4-b69b-433c-b880-1abaf83d602c.png" },
  docs: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/b545cbc8-efee-45e9-be11-e429ba2f13d7.png" },
  showings: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/c6115b16-e89d-4fab-8c83-21d095b805c7.png" },
} as const;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatRelative(ts: number): string {
  if (!ts) return "No activity yet";
  const diff = Date.now() - ts;
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return "Today";
  const days = Math.floor(diff / day);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatShowingTime(ts: number): string {
  const d = new Date(ts);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = days[d.getDay()];
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = m < 10 ? `0${m}` : String(m);
  return `${day} · ${h}:${mm} ${ap}`;
}

export default function AdminInsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    viewsThisWeek,
    newLeadsThisWeek,
    awaitingSignature,
    upcomingShowings,
    engagement,
  } = useEngagement();
  const { clients } = useClients();
  const { all: listings } = useListings();

  const clientById = useMemo(() => {
    const m = new Map<string, (typeof clients)[number]>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const listingById = useMemo(() => {
    const m = new Map<string, (typeof listings)[number]>();
    for (const l of listings) m.set(l.id, l);
    return m;
  }, [listings]);

  const topListings = viewsThisWeek.slice(0, 4);
  const hot = engagement.filter((e) => e.bucket === "hot");
  const cooling = engagement.filter((e) => e.bucket === "cooling" || e.bucket === "cold");

  const tap = (cb: () => void) => () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    cb();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
        <Pressable hitSlop={12} onPress={() => backOr(router)} style={styles.iconBtn}>
          <ArrowLeft size={18} color={brand.ivory} strokeWidth={1.5} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.brandName}>INSIGHTS</Text>
          <Text style={styles.brandSub}>THIS WEEK · ENGAGEMENT</Text>
        </View>
        <View style={styles.iconBtn}>
          <Sparkles size={16} color={brand.goldLight} strokeWidth={1.5} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>YOUR WEEK</Text>
          <Text style={styles.heroTitle}>What needs you, right now.</Text>
          <Text style={styles.heroSub}>
            A quick read on movement, momentum, and the clients leaning in.
          </Text>
        </View>

        <View style={styles.digestGrid}>
          <DigestCard
            label="NEW LEADS"
            value={newLeadsThisWeek.length}
            sub={newLeadsThisWeek.length === 0 ? "Add or import" : "added · 7d"}
            Icon={UserPlus}
            accent="#62D29A"
            image={DIGEST_IMAGES.leads}
            onPress={() => router.push("/admin/clients")}
          />
          <DigestCard
            label="MOST VIEWED"
            value={topListings.reduce((s, t) => s + t.views, 0)}
            sub={topListings.length > 0 ? `${topListings.length} listings` : "No views yet"}
            Icon={Eye}
            accent="#6FA8E5"
            image={DIGEST_IMAGES.viewed}
            onPress={() => {}}
          />
          <DigestCard
            label="AWAITING SIG"
            value={awaitingSignature.length}
            sub={awaitingSignature.length === 0 ? "All caught up" : "open envelopes"}
            Icon={FileSignature}
            accent="#C99BE5"
            image={DIGEST_IMAGES.docs}
            onPress={() => router.push("/admin/documents")}
          />
          <DigestCard
            label="SHOWINGS"
            value={upcomingShowings.length}
            sub={upcomingShowings.length === 0 ? "Nothing booked" : "next 7 days"}
            Icon={CalendarDays}
            accent="#F5B544"
            image={DIGEST_IMAGES.showings}
            onPress={() => router.push("/admin/appointments")}
          />
        </View>

        <Section label="LISTINGS VIEWED MOST" hint="Last 7 days">
          {topListings.length === 0 ? (
            <Empty title="No views yet this week." sub="Share a listing link to start the signal." />
          ) : (
            <View style={styles.listingsCol}>
              {topListings.map((row, idx) => {
                const l = listingById.get(row.listingId);
                if (!l) return null;
                return (
                  <Pressable
                    key={row.listingId}
                    onPress={tap(() => router.push(`/listing/${row.listingId}`))}
                    style={({ pressed }) => [styles.listingRow, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={styles.rank}>{String(idx + 1).padStart(2, "0")}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listingNeighborhood}>{l.neighborhood.toUpperCase()}</Text>
                      <Text style={styles.listingTitle} numberOfLines={1}>{l.title}</Text>
                      <Text style={styles.listingMeta}>{l.price} · {l.beds} bd · {l.baths} ba</Text>
                    </View>
                    <View style={styles.viewsPill}>
                      <Eye size={11} color={brand.goldDeep} strokeWidth={1.6} />
                      <Text style={styles.viewsText}>{row.views}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Section>

        <Section label="UPCOMING SHOWINGS" hint="Next 7 days">
          {upcomingShowings.length === 0 ? (
            <Empty title="No showings booked." sub="Share your booking link to fill the week." />
          ) : (
            <View style={styles.col}>
              {upcomingShowings.slice(0, 5).map((a) => {
                const recipientNames = (a.recipientIds ?? [])
                  .map((id) => clientById.get(id)?.name)
                  .filter(Boolean)
                  .join(", ");
                return (
                  <Pressable
                    key={a.id}
                    onPress={tap(() => router.push("/admin/appointments"))}
                    style={({ pressed }) => [styles.showingRow, pressed && { opacity: 0.9 }]}
                  >
                    <View style={styles.showingDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.showingTime}>{formatShowingTime(a.startsAt)}</Text>
                      <Text style={styles.showingTitle} numberOfLines={1}>
                        {a.listingTitle ?? "Private viewing"}
                      </Text>
                      <Text style={styles.showingMeta} numberOfLines={1}>
                        {recipientNames || "No client tagged"} · {a.status === "requested" ? "Pending" : "Confirmed"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Section>

        <Section label="DOCS AWAITING SIGNATURE" hint={awaitingSignature.length === 0 ? "Clear" : "Nudge as needed"}>
          {awaitingSignature.length === 0 ? (
            <Empty title="Inbox is clear." sub="Every envelope is signed or shared." />
          ) : (
            <View style={styles.col}>
              {awaitingSignature.slice(0, 5).map((d) => (
                <Pressable
                  key={d.id}
                  onPress={tap(() => router.push("/admin/documents"))}
                  style={({ pressed }) => [styles.docRow, pressed && { opacity: 0.9 }]}
                >
                  <View style={styles.docIcon}>
                    <FileSignature size={14} color={brand.ivory} strokeWidth={1.5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docName} numberOfLines={1}>{d.name}</Text>
                    <Text style={styles.docMeta}>
                      {(d.portal ?? "portal").toUpperCase()} · sent {formatRelative(d.sentAt ?? d.uploadedAt)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Section>

        <View style={styles.engagementHeader}>
          <Text style={styles.sectionLabel}>CLIENT ENGAGEMENT</Text>
          <Text style={styles.sectionHint}>Hot · warm · cooling</Text>
        </View>

        <View style={styles.bucketLegend}>
          <LegendDot color={BUCKET_COLOR.hot} label={`${hot.length} hot`} Icon={Flame} />
          <LegendDot color={BUCKET_COLOR.warm} label={`${engagement.filter(e => e.bucket === "warm").length} warm`} Icon={TrendingDown} />
          <LegendDot color={brand.muted} label={`${cooling.length} cooling`} Icon={Snowflake} />
        </View>

        {engagement.length === 0 ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Empty title="No clients yet." sub="Import or add your first client to see engagement." />
          </View>
        ) : (
          <View style={styles.col}>
            {engagement.map((e) => {
              const c = clientById.get(e.clientId);
              if (!c) return null;
              const color = BUCKET_COLOR[e.bucket];
              return (
                <Pressable
                  key={e.clientId}
                  onPress={tap(() => router.push("/admin/clients"))}
                  style={({ pressed }) => [styles.scoreRow, pressed && { opacity: 0.9 }]}
                >
                  <View style={[styles.bucketDot, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scoreName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.scoreMeta} numberOfLines={1}>
                      {c.tag ?? "—"} · last touch {formatRelative(e.lastTouchedAt)}
                    </Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${e.score}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                  <View style={[styles.bucketBadge, { borderColor: color }]}>
                    <Text style={[styles.bucketBadgeText, { color }]}>{BUCKET_LABEL[e.bucket]}</Text>
                    <Text style={styles.bucketScore}>{e.score}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.footerNote}>
          <Users size={12} color={brand.muted} strokeWidth={1.6} />
          <Text style={styles.footerText}>
            Scores update from showings, documents, pins, notes, and chat — last 21 days.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function DigestCard({
  label,
  value,
  sub,
  Icon,
  accent,
  image,
  onPress,
}: {
  label: string;
  value: number;
  sub: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  accent: string;
  image: number | { uri: string };
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.digestCard, pressed && { opacity: 0.92 }]}>
      <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(8,9,12,0.62)", "rgba(8,9,12,0.88)"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.digestIcon, { backgroundColor: brand.nightDeep, borderColor: hexToRgba(accent, 0.4) }]}>
        <Icon size={14} color={accent} strokeWidth={1.8} />
      </View>
      <Text style={styles.digestValue}>{value}</Text>
      <Text style={[styles.digestLabel, { color: accent }]}>{label}</Text>
      <Text style={styles.digestSub} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 28 }}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
    </View>
  );
}

function LegendDot({
  color,
  label,
  Icon,
}: {
  color: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}) {
  return (
    <View style={styles.legendItem}>
      <Icon size={11} color={color} strokeWidth={1.8} />
      <Text style={[styles.legendText, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.nightDeep },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: dark.bg,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,26,21,0.3)",
  },
  brandName: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 12, letterSpacing: 4 },
  brandSub: {
    fontFamily: fonts.sans,
    color: "rgba(244,239,230,0.55)",
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 2,
  },
  hero: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 18 },
  heroEyebrow: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  heroSub: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 13, lineHeight: 18 },
  digestGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 6,
  },
  digestCard: {
    width: "48.5%",
    padding: 14,
    borderWidth: 1,
    borderColor: dark.borderGoldSoft,
    backgroundColor: brand.night,
    overflow: "hidden",
  },
  digestIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    backgroundColor: brand.nightDeep,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  digestValue: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 28,
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  digestLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 6,
  },
  digestSub: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 11,
    marginTop: 3,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 10,
    letterSpacing: 3,
  },
  sectionHint: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  col: { paddingHorizontal: 16, gap: 8 },
  listingsCol: { paddingHorizontal: 16, gap: 8 },
  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: brand.night,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  rank: {
    fontFamily: fonts.serif,
    color: brand.goldLight,
    fontSize: 18,
    letterSpacing: -0.4,
    width: 28,
  },
  listingNeighborhood: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 3,
  },
  listingTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 15, letterSpacing: -0.2 },
  listingMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 3 },
  viewsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(210,163,67,0.4)",
    backgroundColor: "rgba(210,163,67,0.1)",
  },
  viewsText: {
    fontFamily: fonts.sansSemi,
    color: brand.goldLight,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  showingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: brand.night,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  showingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brand.gold,
  },
  showingTime: {
    fontFamily: fonts.sansMedium,
    color: brand.goldLight,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 3,
  },
  showingTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 15, letterSpacing: -0.2 },
  showingMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 3 },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: brand.night,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  docIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: dark.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  docName: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 14 },
  docMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 3 },
  empty: {
    marginHorizontal: 16,
    padding: 24,
    alignItems: "center",
    backgroundColor: brand.nightHi,
  },
  emptyTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 16 },
  emptySub: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 12, marginTop: 4 },
  engagementHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 24,
    marginTop: 36,
    marginBottom: 10,
  },
  bucketLegend: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 24,
    marginBottom: 14,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 1.8,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: brand.night,
    borderWidth: 1,
    borderColor: brand.nightLine,
  },
  bucketDot: { width: 10, height: 10, borderRadius: 5 },
  scoreName: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 15, letterSpacing: -0.2 },
  scoreMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 3, marginBottom: 8 },
  barTrack: {
    height: 4,
    backgroundColor: brand.nightHi,
    overflow: "hidden",
  },
  barFill: { height: 4 },
  bucketBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    alignItems: "center",
    minWidth: 56,
  },
  bucketBadgeText: { fontFamily: fonts.sansSemi, fontSize: 9, letterSpacing: 1.5 },
  bucketScore: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 16,
    marginTop: 2,
  },
  footerNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 24,
    marginTop: 28,
  },
  footerText: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, flex: 1 },
});
