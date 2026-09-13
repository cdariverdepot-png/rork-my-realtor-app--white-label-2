import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  Apple,
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock,
  FileUp,
  Globe,
  Link as LinkIcon,
  Mail,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react-native";
import { brand, dark, fonts } from "@/constants/colors";
import ScreenBackdrop from "@/components/ScreenBackdrop";
import { SCREEN_ACCENT, tint } from "@/constants/backdrops";

const ACCENT = SCREEN_ACCENT.adminCalendar;
const SURFACE = "rgba(14,16,15,0.72)";
const SURFACE_HI = "rgba(14,16,15,0.82)";
const LINE = "rgba(244,239,230,0.12)";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCalendarFeeds,
  type CalendarFeed,
  type CalendarSource,
} from "@/contexts/CalendarFeedsContext";
import { parseICS, type ParsedEvent } from "@/lib/parseCalendar";

type Step = "list" | "source" | "method" | "url" | "review";

const SOURCE_META: Record<CalendarSource, { label: string; help: string; instructions: string[]; instructionsLink?: string }> = {
  google: {
    label: "Google Calendar",
    help: "Pulls events from any Google Calendar via its secret iCal URL.",
    instructions: [
      "Open calendar.google.com on a laptop",
      "Click the calendar's three-dot menu → Settings and sharing",
      "Scroll to Integrate calendar → copy Secret address in iCal format",
      "Paste it on the next screen",
    ],
    instructionsLink: "https://calendar.google.com",
  },
  apple: {
    label: "Apple / iCloud",
    help: "Use a public iCloud share URL or a one-off .ics export.",
    instructions: [
      "Open the Calendar app on Mac",
      "Right-click the calendar → Share Calendar → Public Calendar",
      "Copy the webcal://… link",
      "Paste it on the next screen — we'll convert it automatically",
    ],
    instructionsLink: "https://www.icloud.com",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    help: "Publish a calendar from Outlook to get an ICS subscription URL.",
    instructions: [
      "Outlook on the web → Settings → Calendar → Shared calendars",
      "Under Publish a calendar → choose your calendar",
      "Set permissions to 'Can view all details', click Publish",
      "Copy the ICS link and paste it on the next screen",
    ],
    instructionsLink: "https://outlook.office.com/calendar",
  },
  ics: {
    label: "Any ICS link",
    help: "Works with any provider that exposes a public .ics URL.",
    instructions: [
      "Find the calendar's .ics or webcal:// link in its settings",
      "Paste it on the next screen — we'll fetch and parse it",
    ],
  },
};

function fmtDay(t: number): { day: string; weekday: string; month: string; time: string } {
  const d = new Date(t);
  return {
    day: String(d.getDate()),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function relTime(t?: number): string {
  if (!t) return "Never";
  const diff = Date.now() - t;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

const REFRESH_OPTIONS: { label: string; minutes: number }[] = [
  { label: "Every 15 min", minutes: 15 },
  { label: "Hourly", minutes: 60 },
  { label: "Daily", minutes: 60 * 24 },
  { label: "Manual", minutes: 0 },
];

export default function CalendarImportScreen() {
  const router = useRouter();
  const { isAdmin, hydrated } = useAuth();
  const {
    feeds,
    busyId,
    addUrlFeed,
    addFileFeed,
    syncFeed,
    setFeedEnabled,
    setAutoRefresh,
    setFeedExclusions,
    removeFeed,
  } = useCalendarFeeds();

  const [step, setStep] = useState<Step>("list");
  const [picked, setPicked] = useState<CalendarSource | null>(null);
  const [url, setUrl] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [reviewEvents, setReviewEvents] = useState<ParsedEvent[]>([]);
  const [reviewFeedId, setReviewFeedId] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Record<string, true>>({});

  useEffect(() => {
    if (hydrated && !isAdmin) router.replace("/admin/login");
  }, [hydrated, isAdmin, router]);

  const tap = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const fail = (msg: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(msg);
    } else {
      Alert.alert("Calendar", msg);
    }
  };

  const upcomingCount = useMemo(() => {
    const now = Date.now();
    let n = 0;
    feeds.forEach((f) => {
      if (f.enabled) n += f.lastEventCount ?? 0;
    });
    return { feeds: feeds.length, events: n, now };
  }, [feeds]);

  /* ---------------- helpers ---------------- */
  const beginAddFromSource = (s: CalendarSource) => {
    tap();
    setPicked(s);
    setUrl("");
    setName("");
    setStep("method");
  };

  const submitUrl = async () => {
    if (!picked) return;
    if (!url.trim()) {
      fail("Paste a calendar link first.");
      return;
    }
    setSubmitting(true);
    const res = await addUrlFeed({
      source: picked,
      url: url.trim(),
      name: name.trim() || undefined,
      autoRefreshMin: 60,
    });
    setSubmitting(false);
    if ("error" in res) {
      fail(`Couldn't subscribe: ${res.error}. Double-check the link is public and ends in .ics.`);
      return;
    }
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setReviewFeedId(res.feed.id);
    setReviewEvents(res.events);
    setExcluded({});
    setStep("review");
  };

  const importFile = async () => {
    if (!picked) return;
    tap();
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/calendar", "text/x-vcalendar", "text/plain", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const file = res.assets?.[0];
      if (!file?.uri) return;

      let text = "";
      if (Platform.OS === "web") {
        const r = await fetch(file.uri);
        text = await r.text();
      } else {
        text = await FileSystem.readAsStringAsync(file.uri, { encoding: "utf8" });
      }
      if (!text.toUpperCase().includes("BEGIN:VCALENDAR")) {
        fail("That doesn't look like an .ics calendar file.");
        return;
      }
      const events = parseICS(text);
      if (events.length === 0) {
        fail("No events found in that file.");
        return;
      }
      const feed = addFileFeed({
        source: picked,
        name: name.trim() || undefined,
        events,
      });
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReviewFeedId(feed.id);
      setReviewEvents(events);
      setExcluded({});
      setStep("review");
    } catch (e) {
      console.log("[cal-import] file", e);
      fail("Couldn't read that file. Try exporting again as .ics.");
    }
  };

  const finishReview = () => {
    if (!reviewFeedId) {
      setStep("list");
      return;
    }
    setFeedExclusions(reviewFeedId, excluded, reviewEvents);
    setStep("list");
    setPicked(null);
    setReviewEvents([]);
    setReviewFeedId(null);
  };

  /* ---------------- managing existing feeds ---------------- */

  const onRemove = (feed: CalendarFeed) => {
    const go = () => removeFeed(feed.id);
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Stop syncing ${feed.name}?`)) go();
      return;
    }
    Alert.alert("Stop syncing", `Remove ${feed.name}? Events from this calendar will be cleared.`, [
      { text: "Keep", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: go },
    ]);
  };

  const onRefresh = (feed: CalendarFeed) => {
    if (!feed.url) {
      fail("This calendar was imported from a file. Re-upload the .ics to refresh.");
      return;
    }
    void syncFeed(feed.id);
  };

  /* ---------------- render ---------------- */

  return (
    <View style={styles.root}>
      <ScreenBackdrop screen="adminCalendar" />
      <View style={styles.topBar}>
        <Pressable
          hitSlop={12}
          onPress={() => {
            if (step === "list") router.back();
            else if (step === "review") finishReview();
            else if (step === "url") setStep("method");
            else if (step === "method") setStep("source");
            else setStep("list");
          }}
          style={styles.iconBtn}
        >
          <ArrowLeft size={18} color={brand.ivory} strokeWidth={1.5} />
        </Pressable>
        <Text style={styles.topTitle}>
          {step === "list" ? "CALENDAR SYNC" : step === "review" ? "REVIEW EVENTS" : "ADD CALENDAR"}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      {step === "list" && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>YOUR SCHEDULE, EVERYWHERE</Text>
            <Text style={styles.heroTitle}>One calendar, every showing.</Text>
            <Text style={styles.heroSub}>
              Connect Google, Apple or Outlook once. We'll keep your appointments in sync — and you decide which events show up.
            </Text>
          </View>

          <View style={styles.summary}>
            <Stat label="CONNECTED" value={String(feeds.length)} />
            <View style={styles.summaryDivider} />
            <Stat label="EVENTS" value={String(upcomingCount.events)} />
            <View style={styles.summaryDivider} />
            <Stat label="LAST SYNC" value={feeds[0] ? relTime(feeds[0].lastSyncedAt) : "—"} small />
          </View>

          <Pressable
            onPress={() => {
              tap();
              setStep("source");
            }}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
          >
            <CalendarPlus size={18} color={dark.bg} strokeWidth={2} />
            <Text style={styles.ctaText}>Connect a calendar</Text>
          </Pressable>

          {feeds.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing connected yet.</Text>
              <Text style={styles.emptySub}>
                Three taps: pick a source, paste your calendar link, you're synced.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>CONNECTED CALENDARS</Text>
              {feeds.map((f) => (
                <FeedRow
                  key={f.id}
                  feed={f}
                  busy={busyId === f.id}
                  onToggleEnabled={() => {
                    tap();
                    setFeedEnabled(f.id, !f.enabled);
                  }}
                  onRefresh={() => onRefresh(f)}
                  onRemove={() => onRemove(f)}
                  onChangeRefresh={(min) => {
                    tap();
                    setAutoRefresh(f.id, min);
                  }}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {step === "source" && (
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>STEP 1 OF 3</Text>
            <Text style={styles.heroTitle}>Where does it live?</Text>
            <Text style={styles.heroSub}>Pick the service your calendar is on.</Text>
          </View>
          <SourceCard
            Icon={Mail}
            title="Google Calendar"
            sub="Most realtors. Pulls every event you publish."
            onPress={() => beginAddFromSource("google")}
          />
          <SourceCard
            Icon={Apple}
            title="Apple / iCloud"
            sub="iPhone or Mac calendars via a shared iCloud link."
            onPress={() => beginAddFromSource("apple")}
          />
          <SourceCard
            Icon={Mail}
            title="Outlook / Microsoft 365"
            sub="Office or business calendars."
            onPress={() => beginAddFromSource("outlook")}
          />
          <SourceCard
            Icon={Globe}
            title="Any ICS link"
            sub="If you've got a .ics or webcal:// URL, we can read it."
            onPress={() => beginAddFromSource("ics")}
          />
        </ScrollView>
      )}

      {step === "method" && picked && (
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>STEP 2 OF 3 · {SOURCE_META[picked].label.toUpperCase()}</Text>
            <Text style={styles.heroTitle}>How would you like to bring it in?</Text>
            <Text style={styles.heroSub}>{SOURCE_META[picked].help}</Text>
          </View>

          <Pressable
            onPress={() => {
              tap();
              setStep("url");
            }}
            style={({ pressed }) => [styles.methodCard, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.methodIcon}>
              <LinkIcon size={16} color={brand.ivory} strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.methodTitle}>Paste a calendar link</Text>
              <Text style={styles.methodSub}>
                Recommended — we'll auto-refresh new events every hour.
              </Text>
            </View>
            <ChevronRight size={16} color={brand.muted} strokeWidth={1.5} />
          </Pressable>

          <Pressable
            onPress={importFile}
            style={({ pressed }) => [styles.methodCard, pressed && { opacity: 0.92 }]}
          >
            <View style={[styles.methodIcon, { backgroundColor: ACCENT, borderColor: ACCENT }]}>
              <FileUp size={16} color={dark.bg} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.methodTitle}>Upload an .ics export</Text>
              <Text style={styles.methodSub}>One-off snapshot. No automatic refresh.</Text>
            </View>
            <ChevronRight size={16} color={brand.muted} strokeWidth={1.5} />
          </Pressable>

          <Text style={[styles.sectionLabel, { marginTop: 22 }]}>HOW TO GET YOUR LINK</Text>
          <View style={styles.guide}>
            {SOURCE_META[picked].instructions.map((line, i) => (
              <View key={i} style={styles.guideRow}>
                <Text style={styles.guideNum}>{i + 1}</Text>
                <Text style={styles.guideText}>{line}</Text>
              </View>
            ))}
            {SOURCE_META[picked].instructionsLink ? (
              <Pressable
                onPress={() => {
                  const link = SOURCE_META[picked].instructionsLink;
                  if (link) void Linking.openURL(link);
                }}
                style={styles.guideOpenBtn}
              >
                <Text style={styles.guideOpenText}>OPEN {SOURCE_META[picked].label.toUpperCase()}</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      )}

      {step === "url" && picked && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>STEP 3 OF 3</Text>
              <Text style={styles.heroTitle}>Paste the link.</Text>
              <Text style={styles.heroSub}>
                We'll fetch your events securely. The link stays on your device.
              </Text>
            </View>

            <Text style={styles.formLabel}>NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={SOURCE_META[picked].label}
              placeholderTextColor={brand.muted}
              style={styles.input}
              autoCapitalize="words"
            />

            <Text style={[styles.formLabel, { marginTop: 14 }]}>CALENDAR LINK</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://… .ics  or  webcal://…"
              placeholderTextColor={brand.muted}
              style={[styles.input, styles.inputUrl]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              multiline
            />

            <Pressable
              onPress={submitUrl}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitBtn,
                submitting && { opacity: 0.7 },
                pressed && { opacity: 0.92 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={dark.bg} size="small" />
              ) : (
                <CalendarPlus size={16} color={dark.bg} strokeWidth={2} />
              )}
              <Text style={styles.submitText}>
                {submitting ? "FETCHING…" : "SYNC CALENDAR"}
              </Text>
            </Pressable>

            <Text style={styles.privacyNote}>
              Encrypted in transit · stored only on your device · revoke any time.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {step === "review" && (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>{reviewEvents.length} EVENTS FOUND</Text>
              <Text style={styles.heroTitle}>Pick what to sync.</Text>
              <Text style={styles.heroSub}>
                Tap any event to exclude it. We'll keep the rest in sync automatically.
              </Text>
            </View>

            {reviewEvents.length === 0 && (
              <Text style={styles.emptyHint}>No upcoming events on this calendar.</Text>
            )}

            <View style={styles.reviewList}>
              {reviewEvents.map((e) => {
                const f = fmtDay(e.startsAt);
                const off = !!excluded[e.uid];
                return (
                  <Pressable
                    key={e.uid}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.selectionAsync();
                      setExcluded((prev) => {
                        const next = { ...prev };
                        if (next[e.uid]) delete next[e.uid];
                        else next[e.uid] = true;
                        return next;
                      });
                    }}
                    style={({ pressed }) => [
                      styles.reviewRow,
                      off && styles.reviewRowOff,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={styles.reviewDate}>
                      <Text style={styles.reviewWeek}>{f.weekday}</Text>
                      <Text style={styles.reviewDay}>{f.day}</Text>
                      <Text style={styles.reviewMon}>{f.month}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewTitle, off && { textDecorationLine: "line-through" }]} numberOfLines={1}>
                        {e.title}
                      </Text>
                      <Text style={styles.reviewMeta}>
                        {f.time} · {e.durationMin} min
                        {e.recurring ? " · repeats" : ""}
                      </Text>
                      {e.location ? (
                        <Text style={styles.reviewLoc} numberOfLines={1}>{e.location}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.checkbox, !off && styles.checkboxOn]}>
                      {!off ? <Check size={12} color={dark.bg} strokeWidth={2.4} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={() => setStep("list")} style={styles.cancelBtn} hitSlop={6}>
              <X size={12} color={brand.muted} strokeWidth={1.6} />
              <Text style={styles.cancelText}>BACK</Text>
            </Pressable>
            <Pressable onPress={finishReview} style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.92 }]}>
              <Check size={14} color={dark.bg} strokeWidth={2} />
              <Text style={styles.confirmText}>
                SYNC {reviewEvents.length - Object.keys(excluded).length}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/* ---------------- subcomponents ---------------- */

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text
        style={{
          fontFamily: fonts.serif,
          color: brand.ivory,
          fontSize: small ? 14 : 22,
          letterSpacing: -0.2,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: fonts.sansMedium,
          color: ACCENT,
          fontSize: 9,
          letterSpacing: 2,
          marginTop: 4,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function SourceCard({
  Icon,
  title,
  sub,
  onPress,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sourceCard, pressed && { opacity: 0.92 }]}>
      <View style={styles.sourceIcon}>
        <Icon size={16} color={brand.ivory} strokeWidth={1.5} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sourceTitle}>{title}</Text>
        <Text style={styles.sourceSub}>{sub}</Text>
      </View>
      <ChevronRight size={16} color={brand.muted} strokeWidth={1.5} />
    </Pressable>
  );
}

function FeedRow({
  feed,
  busy,
  onToggleEnabled,
  onRefresh,
  onRemove,
  onChangeRefresh,
}: {
  feed: CalendarFeed;
  busy: boolean;
  onToggleEnabled: () => void;
  onRefresh: () => void;
  onRemove: () => void;
  onChangeRefresh: (min: number) => void;
}) {
  return (
    <View style={styles.feedRow}>
      <View style={styles.feedHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.feedSource}>{feed.source.toUpperCase()}</Text>
          <Text style={styles.feedName} numberOfLines={1}>{feed.name}</Text>
          <Text style={styles.feedMeta}>
            {feed.lastEventCount ?? 0} events · {relTime(feed.lastSyncedAt)}
            {feed.lastError ? `  ·  ⚠ ${feed.lastError}` : ""}
          </Text>
        </View>
        <Pressable onPress={onToggleEnabled} style={[styles.toggle, feed.enabled && styles.toggleOn]} hitSlop={6}>
          <View style={[styles.toggleKnob, feed.enabled && styles.toggleKnobOn]} />
        </Pressable>
      </View>

      {feed.url ? (
        <View style={styles.refreshRow}>
          <Clock size={11} color={brand.muted} strokeWidth={1.6} />
          <Text style={styles.refreshLabel}>AUTO-REFRESH</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 }}>
            {REFRESH_OPTIONS.map((opt) => {
              const on = feed.autoRefreshMin === opt.minutes;
              return (
                <Pressable
                  key={opt.minutes}
                  onPress={() => onChangeRefresh(opt.minutes)}
                  style={[styles.refreshChip, on && styles.refreshChipOn]}
                >
                  <Text style={[styles.refreshChipText, on && { color: brand.ivory }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <Text style={styles.fileNote}>One-off file import — re-upload to refresh.</Text>
      )}

      <View style={styles.feedActions}>
        {feed.url ? (
          <Pressable onPress={onRefresh} disabled={busy} style={[styles.feedAction, busy && { opacity: 0.5 }]}>
            {busy ? (
              <ActivityIndicator size="small" color={brand.ivory} />
            ) : (
              <RefreshCw size={13} color={brand.ivory} strokeWidth={1.6} />
            )}
            <Text style={styles.feedActionText}>{busy ? "SYNCING" : "REFRESH"}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onRemove} style={[styles.feedAction, styles.feedActionDestructive]}>
          <Trash2 size={13} color="#E06E5A" strokeWidth={1.6} />
          <Text style={[styles.feedActionText, { color: "#E06E5A" }]}>REMOVE</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(244,239,230,0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,10,9,0.4)",
  },
  topTitle: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 11,
    letterSpacing: 3,
  },
  hero: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 18 },
  heroEyebrow: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  heroSub: {
    fontFamily: fonts.sans,
    color: brand.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  summary: {
    flexDirection: "row",
    marginHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: LINE,
    marginBottom: 18,
  },
  summaryDivider: { width: 1, backgroundColor: LINE },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: ACCENT,
    marginBottom: 22,
  },
  ctaText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  empty: {
    margin: 24,
    padding: 32,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 16,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 20, color: brand.ivory },
  emptySub: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 19,
  },
  emptyHint: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 13,
    textAlign: "center",
    marginVertical: 24,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10,
    letterSpacing: 3,
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 12,
  },
  sourceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: SURFACE,
    borderRadius: 14,
  },
  sourceIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
    backgroundColor: tint(ACCENT, 0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  sourceTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 16, letterSpacing: -0.2 },
  sourceSub: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 3, lineHeight: 15 },

  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: SURFACE,
    borderRadius: 14,
  },
  methodIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: tint(ACCENT, 0.35),
    backgroundColor: tint(ACCENT, 0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  methodTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 16, letterSpacing: -0.2 },
  methodSub: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 3, lineHeight: 15 },

  guide: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 14,
    gap: 10,
  },
  guideRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  guideNum: {
    fontFamily: fonts.sansSemi,
    color: ACCENT,
    fontSize: 11,
    letterSpacing: 1,
    width: 16,
    paddingTop: 1,
  },
  guideText: { flex: 1, fontFamily: fonts.sans, color: brand.ivory, fontSize: 13, lineHeight: 19 },
  guideOpenBtn: {
    marginTop: 4,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: tint(ACCENT, 0.4),
  },
  guideOpenText: {
    fontFamily: fonts.sansMedium,
    color: brand.ivory,
    fontSize: 10,
    letterSpacing: 1.6,
  },

  formLabel: {
    fontFamily: fonts.sansMedium,
    color: dark.textDim,
    fontSize: 10,
    letterSpacing: 3,
    marginHorizontal: 24,
    marginBottom: 8,
  },
  input: {
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    backgroundColor: SURFACE,
    fontFamily: fonts.serif,
    color: brand.ivory,
    fontSize: 15,
  },
  inputUrl: { minHeight: 70, textAlignVertical: "top" },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 22,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  submitText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  privacyNote: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 14,
    marginHorizontal: 24,
    lineHeight: 17,
  },

  feedRow: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: SURFACE,
    borderRadius: 16,
  },
  feedHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  feedSource: {
    fontFamily: fonts.sansMedium,
    color: ACCENT,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 4,
  },
  feedName: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 16, letterSpacing: -0.2 },
  feedMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 4 },
  toggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(244,239,230,0.14)",
    padding: 2,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: tint(ACCENT, 0.35) },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(244,239,230,0.5)",
  },
  toggleKnobOn: { transform: [{ translateX: 16 }], backgroundColor: ACCENT },

  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  refreshLabel: {
    fontFamily: fonts.sansMedium,
    color: brand.textOnDarkMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    marginRight: 4,
  },
  refreshChip: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
  },
  refreshChipOn: { backgroundColor: tint(ACCENT, 0.18), borderColor: tint(ACCENT, 0.5) },
  refreshChipText: { fontFamily: fonts.sansMedium, color: brand.ivory, fontSize: 10, letterSpacing: 0.6 },
  fileNote: {
    fontFamily: fonts.serif,
    color: brand.textOnDarkMuted,
    fontSize: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  feedActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  feedAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
  },
  feedActionDestructive: { borderColor: "rgba(224,110,90,0.35)" },
  feedActionText: {
    fontFamily: fonts.sansSemi,
    color: brand.ivory,
    fontSize: 10,
    letterSpacing: 1.5,
  },

  reviewList: { paddingHorizontal: 16, gap: 6 },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: SURFACE,
    borderRadius: 12,
  },
  reviewRowOff: { opacity: 0.5, backgroundColor: SURFACE_HI },
  reviewDate: {
    width: 48,
    alignItems: "center",
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: LINE,
  },
  reviewWeek: { fontFamily: fonts.sansMedium, color: brand.textOnDarkMuted, fontSize: 9, letterSpacing: 1.5 },
  reviewDay: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 22, marginVertical: 2 },
  reviewMon: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 9, letterSpacing: 1.5 },
  reviewTitle: { fontFamily: fonts.serif, color: brand.ivory, fontSize: 15 },
  reviewMeta: { fontFamily: fonts.sans, color: brand.textOnDarkMuted, fontSize: 11, marginTop: 3 },
  reviewLoc: { fontFamily: fonts.serif, color: brand.textOnDarkMuted, fontSize: 12, marginTop: 3 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.2,
    borderColor: "rgba(244,239,230,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: ACCENT, borderColor: ACCENT },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: "rgba(8,10,9,0.94)",
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: LINE,
  },
  cancelText: { fontFamily: fonts.sansMedium, fontSize: 10, color: brand.textOnDarkMuted, letterSpacing: 1.6 },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  confirmText: {
    fontFamily: fonts.sansSemi,
    color: dark.bg,
    fontSize: 12,
    letterSpacing: 1.6,
  },
});
