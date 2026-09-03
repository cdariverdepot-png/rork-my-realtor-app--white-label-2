import React, { useMemo } from "react";
import { Linking, Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { CalendarDays, CalendarPlus, Check, RotateCcw, Plus } from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import { useAppointments, type Appointment } from "@/contexts/AppointmentsContext";
import ModalChrome from "@/components/ModalChrome";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";
import PressableScale from "@/components/PressableScale";
import Reveal from "@/components/Reveal";
import { buildIcs, googleCalendarUrl, icsDataUrl } from "@/lib/buildIcs";
import { useBrand } from "@/contexts/BrandContext";

function fmtFull(t: number): { day: string; weekday: string; month: string; time: string } {
  const d = new Date(t);
  return {
    day: String(d.getDate()),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

const ACCENT = SCREEN_ACCENT.calendar;

/** Status colours are read on charcoal, so they run brighter than print tones. */
const STATUS_COPY: Record<Appointment["status"], { label: string; color: string }> = {
  requested: { label: "AWAITING CONFIRMATION", color: ACCENT },
  confirmed: { label: "CONFIRMED", color: dark.green },
  declined: { label: "DECLINED", color: dark.red },
  rescheduled: { label: "RESCHEDULED", color: "#C99BE5" },
};

export default function CalendarScreen() {
  const router = useRouter();
  const { brand: b } = useBrand();
  const realtor = b.realtor;
  const firstName = realtor.name.split(" ")[0] ?? realtor.name;
  const { items, upsert } = useAppointments();

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...items].sort((a, b) => a.startsAt - b.startsAt);
    return {
      upcoming: sorted.filter((a) => a.startsAt >= now),
      past: sorted.filter((a) => a.startsAt < now).reverse(),
    };
  }, [items]);

  const confirm = (a: Appointment) => {
    upsert({ ...a, status: "confirmed" });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const askReschedule = (a: Appointment) => {
    upsert({ ...a, status: "rescheduled" });
  };

  const addToCalendar = async (a: Appointment) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const ics = buildIcs({
      uid: a.id,
      title: a.listingTitle ?? "Private viewing",
      startsAt: a.startsAt,
      durationMin: a.durationMin,
      description: a.note,
      location: a.location,
      organizerName: realtor.name,
      organizerEmail: realtor.email,
    });
    if (Platform.OS === "web") {
      // Open Google Calendar quick-add directly on web.
      try {
        await WebBrowser.openBrowserAsync(
          googleCalendarUrl({
            uid: a.id,
            title: a.listingTitle ?? "Private viewing",
            startsAt: a.startsAt,
            durationMin: a.durationMin,
            description: a.note,
            location: a.location,
          })
        );
      } catch (e) {
        console.log("[calendar] open google", e);
      }
      return;
    }
    try {
      // Use the share sheet so the user can route to Apple Calendar / Outlook / etc.
      await Share.share({
        title: a.listingTitle ?? "Private viewing",
        message: ics,
        url: icsDataUrl(ics),
      });
    } catch (e) {
      // Fallback: try opening the data URL directly.
      try {
        await Linking.openURL(icsDataUrl(ics));
      } catch (err) {
        console.log("[calendar] add", err);
      }
    }
  };

  const renderRow = (a: Appointment) => {
    const f = fmtFull(a.startsAt);
    const s = STATUS_COPY[a.status];
    return (
      <View key={a.id} style={styles.row}>
        <View style={styles.dateBlock}>
          <Text style={styles.dateWeek}>{f.weekday}</Text>
          <Text style={styles.dateNum}>{f.day}</Text>
          <Text style={styles.dateMonth}>{f.month}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusPill, { color: s.color }]}>● {s.label}</Text>
          <Text style={styles.title}>{a.listingTitle ?? "Private viewing"}</Text>
          <Text style={styles.meta}>
            {f.time} · {a.durationMin} min · {a.createdBy === "client" ? "Requested by you" : `From ${firstName}`}
          </Text>
          {a.note ? <Text style={styles.noteText}>“{a.note}”</Text> : null}
          {a.startsAt > Date.now() && a.status !== "confirmed" && a.createdBy === "realtor" && (
            <View style={styles.actionsRow}>
              <PressableScale onPress={() => confirm(a)} haptic="medium" scaleTo={0.96} style={[styles.actBtn, styles.actPrimary]}>
                <Check size={13} color={dark.bg} strokeWidth={2} />
                <Text style={styles.actPrimaryText}>Confirm</Text>
              </PressableScale>
              <PressableScale onPress={() => askReschedule(a)} haptic="selection" scaleTo={0.96} style={styles.actBtn}>
                <RotateCcw size={13} color={dark.text} strokeWidth={1.5} />
                <Text style={styles.actText}>Reschedule</Text>
              </PressableScale>
            </View>
          )}
          {a.status === "confirmed" && a.startsAt > Date.now() && (
            <View style={styles.actionsRow}>
              <PressableScale onPress={() => addToCalendar(a)} haptic="medium" scaleTo={0.96} style={[styles.actBtn, styles.actPrimary]}>
                <CalendarPlus size={13} color={dark.bg} strokeWidth={2} />
                <Text style={styles.actPrimaryText}>Add to my calendar</Text>
              </PressableScale>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="calendar" />
      <ModalChrome eyebrow="Your private calendar" />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Reveal delay={40}>
          <Text style={styles.intro}>
            Showings, calls, and our coffees — kept simple. {firstName} will confirm anything you request.
          </Text>
        </Reveal>

        <Reveal delay={120}>
        <PressableScale
          onPress={() => router.push("/book")}
          haptic="medium"
          scaleTo={0.98}
          style={styles.cta}
        >
          <View style={styles.ctaIcon}>
            <Plus size={18} color={ACCENT} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitle}>Request a private showing</Text>
            <Text style={styles.ctaSub}>Pick a time, send it to {firstName}, done.</Text>
          </View>
        </PressableScale>
        </Reveal>

        {upcoming.length > 0 && (
          <Reveal delay={200}>
            <Text style={styles.label}>UPCOMING</Text>
            <View style={styles.list}>{upcoming.map(renderRow)}</View>
          </Reveal>
        )}

        {upcoming.length === 0 && past.length === 0 && (
          <View style={styles.empty}>
            <CalendarDays size={20} color={ACCENT} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Nothing on the books.</Text>
            <Text style={styles.emptySub}>Request your first showing above.</Text>
          </View>
        )}

        {past.length > 0 && (
          <Reveal delay={280}>
            <Text style={[styles.label, { marginTop: 28 }]}>PAST</Text>
            <View style={[styles.list, { opacity: 0.7 }]}>{past.map(renderRow)}</View>
          </Reveal>
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
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 28,
    padding: 18,
    backgroundColor: tint(ACCENT, 0.08),
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.3),
    borderRadius: 14,
  },
  ctaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tint(ACCENT, 0.14),
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.45),
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTitle: { fontFamily: fonts.serif, color: dark.text, fontSize: 18 },
  ctaSub: { fontFamily: fonts.sans, color: dark.textMuted, fontSize: 12, marginTop: 3 },
  label: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10,
    letterSpacing: 3,
    marginHorizontal: 24,
    marginBottom: 14,
  },
  list: { paddingHorizontal: 16, gap: 8 },
  row: {
    flexDirection: "row",
    gap: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: "rgba(14,16,15,0.72)",
    borderRadius: 14,
  },
  dateBlock: {
    width: 60,
    alignItems: "center",
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: dark.border,
    paddingRight: 12,
  },
  dateWeek: { fontFamily: fonts.sansMedium, color: dark.textDim, fontSize: 9, letterSpacing: 1.5 },
  dateNum: { fontFamily: fonts.serif, color: dark.text, fontSize: 26, marginVertical: 2 },
  dateMonth: { fontFamily: fonts.sans, color: dark.textDim, fontSize: 9, letterSpacing: 1.5 },
  statusPill: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 6,
  },
  title: { fontFamily: fonts.serif, color: dark.text, fontSize: 16, letterSpacing: -0.2 },
  meta: { fontFamily: fonts.sans, color: dark.textMuted, fontSize: 11, marginTop: 4 },
  noteText: {
    fontFamily: fonts.serifItalic,
    color: dark.textMuted,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  actBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 999,
  },
  actPrimary: { backgroundColor: ACCENT, borderColor: ACCENT },
  actText: { fontFamily: fonts.sansSemi, color: dark.text, fontSize: 11, letterSpacing: 1.2 },
  actPrimaryText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  empty: {
    margin: 24,
    padding: 32,
    backgroundColor: "rgba(14,16,15,0.72)",
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 22, color: dark.text, marginTop: 6 },
  emptySub: { fontFamily: fonts.serifItalic, color: dark.textMuted, fontSize: 14 },
});
