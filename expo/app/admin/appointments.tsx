import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Check, Clock, X, Plus, Trash2, CalendarDays } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useAppointments, type Appointment } from "@/contexts/AppointmentsContext";
import { useListings } from "@/contexts/ListingsContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useClients } from "@/contexts/ClientsContext";
import ModalChrome from "@/components/ModalChrome";
import RecipientPicker from "@/components/RecipientPicker";
import EmptyState from "@/components/EmptyState";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";

const ACCENT = SCREEN_ACCENT.adminAppointments;
const SURFACE = "rgba(14,16,15,0.72)";
const LINE = "rgba(244,239,230,0.12)";
const INK = "#0B0D0C";

const TIMES = ["10:00", "11:30", "13:00", "15:00", "16:30", "18:00"];

/** Editorial textures + accent colors — same palette as the admin
 *  Insights digest cards, so every stat strip reads as one system. */
const STAT_IMAGES = {
  showings: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/c6115b16-e89d-4fab-8c83-21d095b805c7.png" },
  leads: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/c0c56eed-afa3-49a0-9867-9fa3725bbae2.png" },
  viewed: { uri: "https://r2-pub.rork.com/projects/fifza9nelayfyi2s3um33/assets/2195dcf4-b69b-433c-b880-1abaf83d602c.png" },
} as const;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function nextDays(n: number) {
  const out: { key: string; weekday: string; day: string; month: string; date: Date }[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    out.push({
      key: dd.toISOString(),
      weekday: dd.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      day: String(dd.getDate()),
      month: dd.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      date: dd,
    });
  }
  return out;
}

export default function AdminAppointments() {
  const router = useRouter();
  const { isAdmin, hydrated } = useAuth();
  const { brand: b } = useBrand();
  const firstName = b.realtor.name.split(" ")[0] ?? b.realtor.name;
  const { items, upsert, remove } = useAppointments();
  const { all } = useListings();
  const { broadcastFromRealtor } = useNotifications();
  const { clients } = useClients();

  const [creating, setCreating] = useState<boolean>(false);
  const [listingId, setListingId] = useState<string>(all[0]?.id ?? "");
  const [day, setDay] = useState<string>("");
  const [time, setTime] = useState<string>(TIMES[2]);
  const [note, setNote] = useState<string>("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);

  const days = useMemo(() => nextDays(14), []);

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  useEffect(() => {
    if (!day && days[0]) setDay(days[0].key);
  }, [day, days]);

  const tap = (cb: () => void) => () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    cb();
  };

  const sorted = [...items].sort((a, b) => a.startsAt - b.startsAt);

  const create = () => {
    if (clients.length > 0 && recipientIds.length === 0) {
      Alert.alert(
        "Choose a client",
        "Pick who this showing is for so they get the alert.",
      );
      return;
    }
    const dt = new Date(day);
    const [hh, mm] = time.split(":").map(Number);
    dt.setHours(hh, mm, 0, 0);
    const listing = all.find((l) => l.id === listingId);
    const a: Appointment = {
      id: `a_${Date.now()}`,
      listingId,
      listingTitle: listing?.title ?? "Private viewing",
      startsAt: dt.getTime(),
      durationMin: 45,
      status: "confirmed",
      createdBy: "realtor",
      recipientIds: recipientIds.length > 0 ? [...recipientIds] : undefined,
      note: note.trim() || undefined,
      updatedAt: Date.now(),
    };
    upsert(a);
    const firstNames = clients
      .filter((c) => recipientIds.includes(c.id))
      .map((c) => c.name.split(" ")[0])
      .join(", ");
    broadcastFromRealtor({
      kind: "appointment",
      title: firstNames ? `Showing booked for ${firstNames}` : `${firstName} scheduled a showing`,
      body: `${a.listingTitle} · ${dt.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`,
      listingId: a.listingId,
      recipientIds: recipientIds.length > 0 ? [...recipientIds] : undefined,
    });
    setCreating(false);
    setNote("");
    setRecipientIds([]);
  };

  const confirmDel = (a: Appointment) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Cancel this showing?")) remove(a.id);
      return;
    }
    Alert.alert("Cancel showing", "This will be removed for everyone.", [
      { text: "Keep", style: "cancel" },
      { text: "Cancel showing", style: "destructive", onPress: () => remove(a.id) },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="adminAppointments" intensity="deep" />
      <ModalChrome eyebrow="Showings · admin" />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.summary}>
          <Stat
            label="REQUESTED"
            value={String(items.filter((i) => i.status === "requested").length)}
            Icon={Clock}
            accent="#F5B544"
            image={STAT_IMAGES.showings}
          />
          <Stat
            label="CONFIRMED"
            value={String(items.filter((i) => i.status === "confirmed").length)}
            Icon={Check}
            accent="#62D29A"
            image={STAT_IMAGES.leads}
          />
          <Stat
            label="TOTAL"
            value={String(items.length)}
            Icon={CalendarDays}
            accent="#6FA8E5"
            image={STAT_IMAGES.viewed}
          />
        </View>

        {!creating ? (
          <Pressable
            onPress={tap(() => setCreating(true))}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
          >
            <Plus size={18} color={INK} strokeWidth={2} />
            <Text style={styles.ctaText}>Schedule a showing for your client</Text>
          </Pressable>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>HOME</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {all.map((l) => {
                const on = listingId === l.id;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => setListingId(l.id)}
                    style={[styles.optChip, on && styles.optChipOn]}
                  >
                    <Text style={[styles.optChipText, on && { color: brand.ivory }]}>{l.title}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.label, { marginTop: 16 }]}>DAY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map((d) => {
                const on = day === d.key;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => setDay(d.key)}
                    style={[styles.dayCard, on && styles.dayCardOn]}
                  >
                    <Text style={[styles.dayWeek, on && { color: ACCENT }]}>{d.weekday}</Text>
                    <Text style={[styles.dayNum, on && { color: brand.ivory }]}>{d.day}</Text>
                    <Text style={[styles.dayMon, on && { color: "rgba(244,239,230,0.72)" }]}>{d.month}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.label, { marginTop: 16 }]}>TIME</Text>
            <View style={styles.timeRow}>
              {TIMES.map((t) => {
                const on = time === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setTime(t)}
                    style={[styles.timePill, on && styles.timePillOn]}
                  >
                    <Text style={[styles.timeText, on && { color: brand.ivory }]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>NOTE TO CLIENT</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Optional — what to expect, where to meet…"
              placeholderTextColor={brand.muted}
              style={styles.note}
            />

            <View style={{ marginTop: 16 }}>
              <RecipientPicker
                recipientIds={recipientIds}
                onChange={setRecipientIds}
                onAddClient={() => router.push("/admin/clients")}
                label="FOR WHICH CLIENT"
              />
            </View>

            <View style={styles.formActions}>
              <Pressable onPress={() => setCreating(false)} style={[styles.formBtn]}>
                <Text style={styles.formBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={tap(create)}
                disabled={recipientIds.length === 0 && clients.length > 0}
                style={({ pressed }) => [
                  styles.formBtn,
                  styles.formBtnPrimary,
                  recipientIds.length === 0 && clients.length > 0 && { opacity: 0.4 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.formBtnPrimaryText}>
                  {recipientIds.length > 1
                    ? `Push to ${recipientIds.length} clients`
                    : "Push to client"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={[styles.label, { marginHorizontal: 24, marginTop: 18, marginBottom: 12 }]}>
          ALL APPOINTMENTS
        </Text>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {sorted.length === 0 && !creating && (
            <EmptyState
              Icon={CalendarDays}
              eyebrow="NO SHOWINGS YET"
              title="Your calendar's wide open."
              body="Schedule a private viewing for a client — they'll get a push and a calendar invite the moment you confirm."
              accent={ACCENT}
              ctaLabel="SCHEDULE A SHOWING"
              onCtaPress={() => setCreating(true)}
            />
          )}
          {sorted.map((a) => {
            const dt = new Date(a.startsAt);
            return (
              <View key={a.id} style={styles.row}>
                <View style={styles.rowDate}>
                  <Text style={styles.rowDay}>{dt.getDate()}</Text>
                  <Text style={styles.rowMon}>
                    {dt.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowStatus}>● {a.status.toUpperCase()}</Text>
                  <Text style={styles.rowTitle}>{a.listingTitle}</Text>
                  <Text style={styles.rowMeta}>
                    {dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · by{" "}
                    {a.createdBy}
                  </Text>
                </View>
                {a.status === "requested" && (
                  <Pressable
                    onPress={tap(() => upsert({ ...a, status: "confirmed" }))}
                    style={styles.iconBtn}
                  >
                    <Check size={14} color={ACCENT} strokeWidth={2} />
                  </Pressable>
                )}
                <Pressable onPress={() => confirmDel(a)} style={styles.iconBtn}>
                  <Trash2 size={14} color="#E06E5A" strokeWidth={1.5} />
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({
  label,
  value,
  Icon,
  accent,
  image,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  accent: string;
  image: { uri: string };
}) {
  return (
    <View style={styles.statTile}>
      <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(8,9,12,0.6)", "rgba(8,9,12,0.88)"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.statIcon, { borderColor: hexToRgba(accent, 0.4) }]}>
        <Icon size={13} color={accent} strokeWidth={1.9} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[styles.statLabel, { color: accent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  summary: {
    flexDirection: "row",
    marginHorizontal: 16,
    gap: 8,
    marginTop: 8,
    marginBottom: 20,
  },
  statTile: {
    flex: 1,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
    overflow: "hidden",
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(8,10,9,0.72)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statValue: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 24, letterSpacing: -0.5 },
  statLabel: { fontFamily: fonts.sansMedium, fontSize: 8.5, letterSpacing: 1.6, marginTop: 5 },
  divider: { width: 1, backgroundColor: brand.nightLine },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  ctaText: { fontFamily: fonts.sansSemi, color: INK, fontSize: 12, letterSpacing: 1.6 },
  form: { paddingHorizontal: 16, paddingTop: 8 },
  label: { fontFamily: fonts.sansMedium, color: dark.textDim, fontSize: 10, letterSpacing: 3, marginBottom: 10 },
  optChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  optChipOn: { backgroundColor: tint(ACCENT, 0.18), borderColor: tint(ACCENT, 0.6) },
  optChipText: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 13 },
  dayCard: {
    width: 60,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  dayCardOn: { backgroundColor: tint(ACCENT, 0.18), borderColor: tint(ACCENT, 0.6) },
  dayWeek: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.5, color: brand.textOnDarkMuted },
  dayNum: { fontFamily: fonts.serif, fontSize: 20, color: brand.ivory, marginVertical: 3 },
  dayMon: { fontFamily: fonts.sans, fontSize: 9, letterSpacing: 1.5, color: brand.textOnDarkMuted },
  timeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timePill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  timePillOn: { backgroundColor: tint(ACCENT, 0.18), borderColor: tint(ACCENT, 0.6) },
  timeText: { fontFamily: fonts.serif, fontSize: 14, color: brand.ivory },
  note: {
    minHeight: 80,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: LINE,
    backgroundColor: "rgba(255,255,255,0.04)",
    fontFamily: fonts.serif,
    fontSize: 14,
    color: brand.ivory,
    textAlignVertical: "top",
  },
  formActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  formBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
  },
  formBtnPrimary: { backgroundColor: ACCENT, borderColor: ACCENT },
  formBtnText: { fontFamily: fonts.sansSemi, color: brand.ivory, fontSize: 11, letterSpacing: 1.5 },
  formBtnPrimaryText: { fontFamily: fonts.sansSemi, color: INK, fontSize: 11, letterSpacing: 1.5 },
  emptyHint: { fontFamily: fonts.serif, color: brand.textOnDarkMuted, fontSize: 13, paddingHorizontal: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
    borderColor: LINE,
    backgroundColor: SURFACE,
  },
  rowDate: {
    width: 50,
    alignItems: "center",
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: LINE,
  },
  rowDay: { fontFamily: fonts.serif, fontSize: 22, color: brand.ivory },
  rowMon: { fontFamily: fonts.sans, fontSize: 9, letterSpacing: 1.5, color: brand.textOnDarkMuted },
  rowStatus: { fontFamily: fonts.sansMedium, color: ACCENT, fontSize: 9, letterSpacing: 2 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 15, color: brand.ivory, marginTop: 4 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 11, color: brand.textOnDarkMuted, marginTop: 3 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: LINE,
  },
});
