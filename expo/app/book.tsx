import React, { useState, useMemo } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, dark, fonts } from "@/constants/colors";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";
import { useBrand } from "@/contexts/BrandContext";
import { useListings } from "@/contexts/ListingsContext";
import { useAppointments } from "@/contexts/AppointmentsContext";
import { useAuth } from "@/contexts/AuthContext";
import { appendLeadAppointment, isRealtorRef } from "@/lib/leadBooking";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";

const ACCENT = SCREEN_ACCENT.book;

const TIMES = ["10:00", "11:30", "13:00", "15:00", "16:30", "18:00"];

function nextDays(n: number): { key: string; weekday: string; day: string; month: string }[] {
  const out: { key: string; weekday: string; day: string; month: string }[] = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    out.push({
      key: dd.toISOString(),
      weekday: dd.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      day: String(dd.getDate()),
      month: dd.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    });
  }
  return out;
}

/** Modal flow for booking a private showing. */
export default function BookShowing() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { brand: b } = useBrand();
  const realtor = b.realtor;
  const firstName = realtor.name.split(" ")[0] ?? realtor.name;
  const params = useLocalSearchParams<{ listingId?: string; invite?: string; ref?: string; leadId?: string; leadName?: string; leadContact?: string }>();
  const invited = params.invite === "1";
  const { visible } = useListings();
  const { upsert } = useAppointments();
  const { isAdmin, isClient, currentClientId } = useAuth();
  const listings = visible.length ? visible : [];
  const days = useMemo(() => nextDays(10), []);

  const [listingId, setListingId] = useState<string>(
    params.listingId ?? listings[0]?.id ?? ""
  );
  const [day, setDay] = useState<string>(days[0].key);
  const [time, setTime] = useState<string>(TIMES[2]);
  const [done, setDone] = useState<boolean>(false);

  const confirm = () => {
    // A realtor previewing their app must not create a real request in their own calendar.
    if (isAdmin && !isClient) {
      Alert.alert("Preview only", "In your clients' app this sends you a viewing request with their name.");
      return;
    }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const dt = new Date(day);
    const [hh, mm] = time.split(":").map(Number);
    dt.setHours(hh, mm, 0, 0);
    const listing = listings.find((l) => l.id === listingId);
    // Visitor from a realtor's public booking link: the request goes to that realtor.
    if (!isClient && !isAdmin && isRealtorRef(params.ref)) {
      void appendLeadAppointment(params.ref, {
        id: `a_${Date.now()}`,
        listingId,
        listingTitle: listing?.title ?? "Private viewing",
        startsAt: dt.getTime(),
        durationMin: 45,
        status: "requested",
        createdBy: "client",
        recipientIds: params.leadId ? [params.leadId] : undefined,
        note: [params.leadName, params.leadContact].filter(Boolean).join(" · ") || undefined,
        updatedAt: Date.now(),
      }).catch((e) => console.log("[book] lead appointment", e));
      setDone(true);
      setTimeout(() => router.replace("/calendar"), 1600);
      return;
    }
    upsert({
      id: `a_${Date.now()}`,
      listingId,
      listingTitle: listing?.title ?? "Private viewing",
      startsAt: dt.getTime(),
      durationMin: 45,
      status: "requested",
      createdBy: "client",
      // Who asked — so the realtor can see and confirm with the right client.
      recipientIds: currentClientId ? [currentClientId] : undefined,
      updatedAt: Date.now(),
    });
    setDone(true);
    setTimeout(() => router.replace("/calendar"), 1600);
  };

  if (done) {
    return (
      <View style={styles.doneRoot}>
        <ScreenBackdrop screen="book" intensity="deep" />
        <View style={styles.checkBubble}>
          <Check size={28} color={brand.nightDeep} strokeWidth={2} />
        </View>
        <Text style={styles.doneTitle}>You're on the books.</Text>
        <Text style={styles.doneSub}>
          {firstName} will confirm your private viewing within the hour.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="book" />
      <ModalChrome eyebrow="A private showing" />
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        <Reveal delay={40}>
        <Text style={styles.intro}>
          {invited
            ? "You're in. Pick a time that works — we'll text the confirmation to the number you just shared."
            : `Pick a time that works. ${firstName} will personally walk you through the home — no broker, no buyer's agent unless you bring one.`}
        </Text>
        </Reveal>

        <Reveal delay={120}>
        <Text style={styles.label}>WHICH HOME</Text>
        <View style={styles.listingsCol}>
          {listings.map((l) => {
            const on = listingId === l.id;
            return (
              <PressableScale
                key={l.id}
                onPress={() => setListingId(l.id)}
                haptic="selection"
                scaleTo={0.99}
                style={[styles.listingRow, on && styles.listingRowOn]}
              >
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lTitle, on && { color: dark.text }]}>
                    {l.title}
                  </Text>
                  <Text style={[styles.lSub, on && { color: dark.textMuted }]}>
                    {l.neighborhood} · {l.price}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>

        </Reveal>

        <Reveal delay={200}>
        <Text style={styles.label}>WHICH DAY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
        >
          {days.map((d) => {
            const on = day === d.key;
            return (
              <PressableScale
                key={d.key}
                onPress={() => setDay(d.key)}
                haptic="selection"
                scaleTo={0.94}
                style={[styles.dayCard, on && styles.dayCardOn]}
              >
                <Text style={[styles.dayWeek, on && { color: ACCENT }]}>
                  {d.weekday}
                </Text>
                <Text style={[styles.dayNum, on && { color: dark.text }]}>{d.day}</Text>
                <Text style={[styles.dayMon, on && { color: dark.textMuted }]}>
                  {d.month}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        </Reveal>

        <Reveal delay={280}>
        <Text style={styles.label}>WHICH TIME</Text>
        <View style={styles.times}>
          {TIMES.map((t) => {
            const on = time === t;
            return (
              <PressableScale
                key={t}
                onPress={() => setTime(t)}
                haptic="selection"
                scaleTo={0.94}
                style={[styles.timePill, on && styles.timePillOn]}
              >
                <Text style={[styles.timeText, on && { color: ACCENT }]}>{t}</Text>
              </PressableScale>
            );
          })}
        </View>
        </Reveal>
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + 14 }]}>
        <PressableScale
          onPress={confirm}
          haptic="medium"
          scaleTo={0.97}
          style={styles.confirm}
        >
          <Text style={styles.confirmText}>Request private viewing</Text>
        </PressableScale>
      </View>
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
    marginBottom: 28,
  },
  label: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10,
    letterSpacing: 3,
    marginHorizontal: 24,
    marginBottom: 14,
    marginTop: 20,
  },
  listingsCol: { paddingHorizontal: 24, gap: 8 },
  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.7)",
  },
  listingRowOn: {
    backgroundColor: tint(ACCENT, 0.12),
    borderColor: tint(ACCENT, 0.45),
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: dark.textDim,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: ACCENT },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
  lTitle: { fontFamily: fonts.serif, fontSize: 16, color: dark.textMuted },
  lSub: { fontFamily: fonts.sans, fontSize: 12, color: dark.textDim, marginTop: 3 },
  dayCard: {
    width: 64,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.7)",
  },
  dayCardOn: {
    backgroundColor: tint(ACCENT, 0.14),
    borderColor: tint(ACCENT, 0.5),
  },
  dayWeek: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.5, color: dark.textDim },
  dayNum: { fontFamily: fonts.serif, fontSize: 22, color: dark.textMuted, marginVertical: 4 },
  dayMon: { fontFamily: fonts.sans, fontSize: 9, letterSpacing: 1.5, color: dark.textDim },
  times: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 24,
  },
  timePill: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.7)",
  },
  timePillOn: {
    backgroundColor: tint(ACCENT, 0.14),
    borderColor: tint(ACCENT, 0.5),
  },
  timeText: { fontFamily: fonts.serif, fontSize: 15, color: dark.textMuted },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "rgba(8,10,9,0.94)",
    borderTopWidth: 1,
    borderTopColor: dark.border,
  },
  confirm: {
    paddingVertical: 17,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    fontFamily: fonts.sansSemi,
    color: brand.nightDeep,
    fontSize: 13,
    letterSpacing: 2,
  },
  doneRoot: {
    flex: 1,
    backgroundColor: dark.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  checkBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  doneTitle: {
    fontFamily: fonts.serif,
    color: dark.text,
    fontSize: 36,
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: "center",
  },
  doneSub: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
});
