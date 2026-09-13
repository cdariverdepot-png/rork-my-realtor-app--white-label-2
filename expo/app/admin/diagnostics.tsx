import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle2, XCircle, Loader, Copy, Trash2, RefreshCw } from "lucide-react-native";

import { supabase } from "@/lib/supabase";
import {
  clearKvWriteLog,
  getKvWriteLog,
  subscribeKvWriteLog,
  type KvWriteLogEntry,
} from "@/lib/kvStore";
import { fonts } from "@/constants/colors";

/**
 * Cross-device Sync Diagnostics.
 *
 * Runs live probes against the Supabase project the app is wired to and
 * surfaces the exact reason updates aren't crossing devices. Most often the
 * culprit is one of:
 *   • EXPO_PUBLIC_SUPABASE_URL / ANON_KEY not actually set in the running build
 *   • public.app_kv table missing (cross-device JSON sync broken)
 *   • Storage bucket "app-images" missing (image uploads fall back to inline
 *     base64, which then blows past the row size limit, which then makes
 *     EVERY listing/brand save silently fail to upload)
 *
 * The screen runs each probe, shows pass/fail with the actual error, and
 * offers a one-tap "Copy SQL setup" so the realtor can paste it into the
 * Supabase SQL editor.
 */

const c = {
  bg: "#08090C",
  surface: "rgba(255,255,255,0.04)",
  hairline: "rgba(255,255,255,0.08)",
  text: "#F1ECE2",
  textMuted: "rgba(241,236,226,0.62)",
  textDim: "rgba(241,236,226,0.40)",
  gold: "#D2A343",
  green: "#62D29A",
  amber: "#F5B544",
  red: "#E5664F",
} as const;

const SETUP_SQL = `-- Run this once in Supabase Dashboard → SQL Editor.

create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter publication supabase_realtime add table public.app_kv;

alter table public.app_kv enable row level security;

drop policy if exists "kv read"   on public.app_kv;
drop policy if exists "kv insert" on public.app_kv;
drop policy if exists "kv update" on public.app_kv;

create policy "kv read"   on public.app_kv for select using (true);
create policy "kv insert" on public.app_kv for insert with check (true);
create policy "kv update" on public.app_kv for update using (true) with check (true);

-- Storage bucket policies (create the bucket first in Storage → New bucket
-- named "app-images" with "public bucket" enabled, then run this):

drop policy if exists "app-images public read" on storage.objects;
drop policy if exists "app-images anon upload" on storage.objects;

create policy "app-images public read"
  on storage.objects for select
  using (bucket_id = 'app-images');

create policy "app-images anon upload"
  on storage.objects for insert
  with check (bucket_id = 'app-images');
`;

type ProbeStatus = "pending" | "running" | "pass" | "fail";

interface Probe {
  id: string;
  label: string;
  status: ProbeStatus;
  detail?: string;
}

const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A//Z";

function base64ToBytes(b64: string): Uint8Array {
  const buffer = (globalThis as { Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } } }).Buffer;
  const binary =
    typeof atob === "function"
      ? atob(b64)
      : buffer
      ? buffer.from(b64, "base64").toString("binary")
      : "";
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export default function DiagnosticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [probes, setProbes] = useState<Probe[]>([
    { id: "env", label: "Supabase env vars present", status: "pending" },
    { id: "client", label: "Supabase client initialised", status: "pending" },
    { id: "kvRead", label: "Read from public.app_kv", status: "pending" },
    { id: "kvWrite", label: "Write to public.app_kv", status: "pending" },
    { id: "kvRoundtrip", label: "Round-trip JSON sync", status: "pending" },
    { id: "storage", label: "Upload to Storage bucket 'app-images'", status: "pending" },
  ]);
  const [running, setRunning] = useState<boolean>(false);
  const runningRef = React.useRef(false);

  // Live write-log mirror so the realtor can SEE every kvSet attempt
  // (key, payload size, ok/error + Supabase error string) without needing
  // a Mac to view console logs. This is the definitive answer to "are
  // realtor edits actually writing to Supabase?".
  const [writeLog, setWriteLog] = useState<readonly KvWriteLogEntry[]>(getKvWriteLog());
  useEffect(() => {
    const unsub = subscribeKvWriteLog(() => {
      setWriteLog([...getKvWriteLog()]);
    });
    return unsub;
  }, []);

  // Server snapshot — reads every known sync key live from Supabase so the
  // client phone can confirm "yes, the row exists on the server with rev=X
  // updated N seconds ago." If the realtor's write log shows ok writes but
  // the client snapshot is missing/stale, you know it's a fetch problem on
  // this device, not a write problem on the other one.
  type ServerRow = {
    key: string;
    label: string;
    rev: number | null;
    updatedAt: string | null;
    sizeKb: number | null;
    error?: string;
  };
  const SYNC_KEYS: { key: string; label: string }[] = [
    { key: "listings.v2", label: "Listings (gallery, prices)" },
    { key: "brand.v2", label: "Brand (hero, note, profile)" },
    { key: "clientFeeds.v1", label: "Client feeds" },
    { key: "documents.v1", label: "Documents & transactions" },
    { key: "messages.v1", label: "Messages" },
    { key: "notifications.v1", label: "Notifications" },
    { key: "appointments.v1", label: "Appointments" },
    { key: "clients.v1", label: "Clients" },
  ];
  const [serverRows, setServerRows] = useState<ServerRow[]>(
    SYNC_KEYS.map((k) => ({ key: k.key, label: k.label, rev: null, updatedAt: null, sizeKb: null }))
  );
  const [snapshotLoading, setSnapshotLoading] = useState<boolean>(false);
  const [snapshotAt, setSnapshotAt] = useState<number | null>(null);

  const loadSnapshot = useCallback(async () => {
    if (!supabase) return;
    setSnapshotLoading(true);
    const sb = supabase;
    const results = await Promise.all(
      SYNC_KEYS.map(async ({ key, label }): Promise<ServerRow> => {
        try {
          const { data, error } = await sb
            .from("app_kv")
            .select("value, rev, updated_at")
            .eq("key", key)
            .maybeSingle();
          if (error) return { key, label, rev: null, updatedAt: null, sizeKb: null, error: error.message };
          if (!data) return { key, label, rev: null, updatedAt: null, sizeKb: null };
          let sizeKb: number | null = null;
          try {
            sizeKb = Math.round(JSON.stringify(data.value).length / 1024);
          } catch {}
          return {
            key,
            label,
            rev: Number(data.rev),
            updatedAt: data.updated_at as string | null,
            sizeKb,
          };
        } catch (e) {
          return {
            key,
            label,
            rev: null,
            updatedAt: null,
            sizeKb: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      })
    );
    setServerRows(results);
    setSnapshotAt(Date.now());
    setSnapshotLoading(false);
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const update = useCallback((id: string, patch: Partial<Probe>) => {
    setProbes((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const runAll = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setProbes((prev) => prev.map((p) => ({ ...p, status: "pending" as const, detail: undefined })));

    // 1 · env vars
    update("env", { status: "running" });
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      update("env", {
        status: "fail",
        detail: `Missing ${!url ? "EXPO_PUBLIC_SUPABASE_URL " : ""}${!anon ? "EXPO_PUBLIC_SUPABASE_ANON_KEY" : ""}. Set both in Rork → Settings → Environment Variables, then reload Expo Go.`,
      });
      setRunning(false);
      return;
    }
    update("env", { status: "pass", detail: `URL ends with …${url.slice(-24)}` });

    // 2 · client
    update("client", { status: "running" });
    if (!supabase) {
      update("client", { status: "fail", detail: "Supabase client failed to initialise." });
      setRunning(false);
      return;
    }
    update("client", { status: "pass" });

    // 3 · kv read
    update("kvRead", { status: "running" });
    const { error: readErr } = await supabase
      .from("app_kv")
      .select("key")
      .limit(1);
    if (readErr) {
      const msg = readErr.message ?? String(readErr);
      const tableMissing =
        readErr.code === "42P01" ||
        /relation .* does not exist/i.test(msg) ||
        /could not find the table/i.test(msg);
      update("kvRead", {
        status: "fail",
        detail: tableMissing
          ? "Table public.app_kv does not exist. Run the setup SQL below."
          : msg,
      });
      update("kvWrite", { status: "fail", detail: "Skipped — table not readable." });
      update("kvRoundtrip", { status: "fail", detail: "Skipped — table not readable." });
    } else {
      update("kvRead", { status: "pass" });

      // 4 · kv write
      update("kvWrite", { status: "running" });
      const probeKey = "diagnostics.probe";
      const probeRev = Date.now();
      const probeValue = { hello: "rork", ts: probeRev };
      const { error: writeErr } = await supabase.from("app_kv").upsert(
        {
          key: probeKey,
          value: probeValue,
          rev: probeRev,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
      if (writeErr) {
        update("kvWrite", { status: "fail", detail: writeErr.message ?? String(writeErr) });
        update("kvRoundtrip", { status: "fail", detail: "Skipped — write failed." });
      } else {
        update("kvWrite", { status: "pass" });

        // 5 · roundtrip
        update("kvRoundtrip", { status: "running" });
        const { data: roundData, error: roundErr } = await supabase
          .from("app_kv")
          .select("value, rev")
          .eq("key", probeKey)
          .maybeSingle();
        if (roundErr || !roundData) {
          update("kvRoundtrip", {
            status: "fail",
            detail: roundErr?.message ?? "Row not found after write.",
          });
        } else if (Number(roundData.rev) !== probeRev) {
          update("kvRoundtrip", {
            status: "fail",
            detail: `Wrote rev=${probeRev} but read rev=${roundData.rev}.`,
          });
        } else {
          update("kvRoundtrip", { status: "pass", detail: `rev=${probeRev}` });
        }
      }
    }

    // 6 · storage upload
    update("storage", { status: "running" });
    try {
      const bytes = base64ToBytes(TINY_JPEG_BASE64);
      const path = `diagnostics/${Date.now().toString(36)}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("app-images")
        .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (upErr) {
        const msg = (upErr.message ?? String(upErr)).toLowerCase();
        const bucketMissing =
          msg.includes("bucket not found") ||
          msg.includes("the resource was not found") ||
          msg.includes("not found");
        update("storage", {
          status: "fail",
          detail: bucketMissing
            ? "Bucket 'app-images' does not exist. Create it in Supabase → Storage → New bucket (public)."
            : upErr.message ?? String(upErr),
        });
      } else {
        const { data: pub } = supabase.storage.from("app-images").getPublicUrl(path);
        update("storage", { status: "pass", detail: pub?.publicUrl ?? "uploaded" });
      }
    } catch (e) {
      update("storage", { status: "fail", detail: e instanceof Error ? e.message : String(e) });
    }

    runningRef.current = false;
    setRunning(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [update]);

  useEffect(() => {
    void runAll();
  }, [runAll]);

  const copySql = async () => {
    await Clipboard.setStringAsync(SETUP_SQL);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "Paste this into Supabase → SQL Editor and run it.");
  };

  const shareReport = async () => {
    const report = [
      "Rork sync diagnostics",
      ...probes.map(
        (p) =>
          `${p.status === "pass" ? "✓" : p.status === "fail" ? "✗" : "·"} ${p.label}${p.detail ? `\n   → ${p.detail}` : ""}`
      ),
      "",
      "Write log:",
      ...(writeLog.length === 0
        ? ["  (no writes attempted)"]
        : writeLog.map(
            (e) =>
              `  [${e.status}] ${e.key} rev=${e.rev} ${e.sizeKb}KB${e.detail ? ` — ${e.detail}` : ""}`
          )),
    ].join("\n");
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(report);
        Alert.alert("Copied", "Report copied to clipboard.");
        return;
      }
      await Share.share({ message: report, title: "Sync diagnostics" });
    } catch (e) {
      console.log("[diagnostics] share", e);
    }
  };

  const allPass = probes.every((p) => p.status === "pass");
  const anyFail = probes.some((p) => p.status === "fail");

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            router.back();
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <ArrowLeft size={20} color={c.text} />
        </Pressable>
        <Text style={styles.eyebrow}>SYSTEM</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Sync Diagnostics</Text>
        <Text style={styles.sub}>
          Probes the Supabase backend this build is wired to and shows the exact
          reason cross-device updates aren't arriving.
        </Text>

        <View style={[styles.banner, allPass ? styles.bannerOk : anyFail ? styles.bannerErr : styles.bannerPending]}>
          <Text style={styles.bannerTitle}>
            {running
              ? "Running probes…"
              : allPass
              ? "All systems live"
              : anyFail
              ? "Sync is broken — see details below"
              : "Ready"}
          </Text>
          {!running && allPass && (
            <Text style={styles.bannerBody}>
              Your client devices can fetch and receive updates. If you still
              don't see new edits, force-quit and reopen the client app once.
            </Text>
          )}
          {!running && anyFail && (
            <Text style={styles.bannerBody}>
              Tap "Copy setup SQL" below, paste it into Supabase → SQL Editor,
              and create the "app-images" bucket (Storage → New bucket, mark it
              public). Then re-run.
            </Text>
          )}
        </View>

        <View style={styles.list}>
          {probes.map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.rowIcon}>
                {p.status === "pass" && <CheckCircle2 size={20} color={c.green} />}
                {p.status === "fail" && <XCircle size={20} color={c.red} />}
                {p.status === "running" && <Loader size={20} color={c.amber} />}
                {p.status === "pending" && (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: c.textDim,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{p.label}</Text>
                {p.detail && <Text style={styles.rowDetail}>{p.detail}</Text>}
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => { if (!runningRef.current) void runAll(); }}
          style={({ pressed }) => [
            styles.btn,
            running && { opacity: 0.5 },
            pressed && !running && { opacity: 0.8, transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.btnText}>{running ? "Running…" : "Re-run probes"}</Text>
        </Pressable>

        <Pressable onPress={copySql} style={styles.btnGhost}>
          <Copy size={16} color={c.gold} />
          <Text style={styles.btnGhostText}>Copy setup SQL</Text>
        </Pressable>

        <Pressable onPress={shareReport} style={styles.btnGhost}>
          <Text style={styles.btnGhostText}>Share report</Text>
        </Pressable>

        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>Server snapshot</Text>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync();
              void loadSnapshot();
            }}
            hitSlop={10}
            style={styles.logClearBtn}
          >
            <RefreshCw size={14} color={c.textMuted} />
            <Text style={styles.logClearText}>{snapshotLoading ? "…" : "Refresh"}</Text>
          </Pressable>
        </View>
        <Text style={styles.logHint}>
          What's actually in Supabase right now. Open this on the client phone
          — if a row has a recent updatedAt, the data IS on the server and the
          client just hasn't fetched it yet (pull-to-refresh on home). If a row
          is missing, the realtor side never wrote it.
          {snapshotAt ? ` Last loaded ${formatTime(snapshotAt)}.` : ""}
        </Text>
        <View style={styles.logList}>
          {serverRows.map((r) => (
            <View key={r.key} style={styles.logRow}>
              <View style={styles.logRowIcon}>
                {r.error ? (
                  <XCircle size={16} color={c.red} />
                ) : r.rev !== null ? (
                  <CheckCircle2 size={16} color={c.green} />
                ) : (
                  <XCircle size={16} color={c.amber} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.logRowHead}>
                  <Text style={styles.logRowKey} numberOfLines={1}>{r.label}</Text>
                  <Text style={styles.logRowMeta}>
                    {r.rev !== null ? `rev ${r.rev}` : "—"}
                  </Text>
                </View>
                <Text style={styles.logRowDetail}>
                  {r.error
                    ? r.error
                    : r.rev === null
                    ? "No row in Supabase yet — realtor hasn't saved this surface."
                    : `${r.sizeKb ?? "?"}KB · updated ${formatRelative(r.updatedAt)}`}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>Live write log</Text>
          <Pressable
            onPress={() => {
              clearKvWriteLog();
              setWriteLog([]);
              if (Platform.OS !== "web") Haptics.selectionAsync();
            }}
            hitSlop={10}
            style={styles.logClearBtn}
          >
            <Trash2 size={14} color={c.textMuted} />
            <Text style={styles.logClearText}>Clear</Text>
          </Pressable>
        </View>
        <Text style={styles.logHint}>
          Every time the realtor saves anything, a row appears here. “ok” = the
          write reached public.app_kv. “error” = Supabase rejected it (the
          exact reason is shown). No rows after editing = the realtor side
          isn’t even attempting to write — share this screen so we can fix it.
        </Text>

        <View style={styles.logList}>
          {writeLog.length === 0 ? (
            <Text style={styles.logEmpty}>
              No writes attempted yet. Go to Admin → edit a listing or your
              profile → Save, then come back here.
            </Text>
          ) : (
            writeLog.map((entry, idx) => (
              <View key={`${entry.at}-${idx}`} style={styles.logRow}>
                <View style={styles.logRowIcon}>
                  {entry.status === "ok" && <CheckCircle2 size={16} color={c.green} />}
                  {entry.status === "error" && <XCircle size={16} color={c.red} />}
                  {entry.status === "skipped" && <XCircle size={16} color={c.amber} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.logRowHead}>
                    <Text style={styles.logRowKey} numberOfLines={1}>{entry.key}</Text>
                    <Text style={styles.logRowMeta}>
                      {entry.sizeKb}KB · {formatTime(entry.at)}
                    </Text>
                  </View>
                  {entry.detail && (
                    <Text style={[styles.logRowDetail, entry.status === "error" && { color: c.red }]}>
                      {entry.detail}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={styles.footnote}>
          Most likely issue: the table public.app_kv or Storage bucket
          "app-images" does not exist in your Supabase project. Until both
          exist, image edits and text edits made on the realtor phone cannot
          reach the client phone — they are silently rejected by Supabase.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
  },
  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: 11,
    letterSpacing: 3,
    color: c.textMuted,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    color: c.text,
    marginBottom: 8,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: c.textMuted,
    marginBottom: 24,
  },
  banner: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 20,
  },
  bannerOk: {
    backgroundColor: "rgba(98,210,154,0.08)",
    borderColor: "rgba(98,210,154,0.32)",
  },
  bannerErr: {
    backgroundColor: "rgba(229,102,79,0.08)",
    borderColor: "rgba(229,102,79,0.32)",
  },
  bannerPending: {
    backgroundColor: c.surface,
    borderColor: c.hairline,
  },
  bannerTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: c.text,
    marginBottom: 4,
  },
  bannerBody: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: c.textMuted,
  },
  list: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    padding: 4,
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 12,
  },
  rowIcon: { width: 24, alignItems: "center", paddingTop: 1 },
  rowLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: c.text,
  },
  rowDetail: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: c.textMuted,
    marginTop: 4,
  },
  btn: {
    backgroundColor: c.gold,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  btnText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: "#0A0B0E",
    fontWeight: "600" as const,
    letterSpacing: 0.5,
  },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(210,163,67,0.32)",
    marginBottom: 10,
  },
  btnGhostText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: c.gold,
    letterSpacing: 0.4,
  },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: c.textDim,
    marginTop: 16,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 6,
  },
  logTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: c.text,
  },
  logClearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
  },
  logClearText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: c.textMuted,
  },
  logHint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: c.textMuted,
    marginBottom: 12,
  },
  logList: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    padding: 4,
    marginBottom: 12,
  },
  logEmpty: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: c.textDim,
    padding: 16,
    textAlign: "center",
  },
  logRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  logRowIcon: { width: 20, alignItems: "center", paddingTop: 1 },
  logRowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  logRowKey: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: c.text,
    flex: 1,
  },
  logRowMeta: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: c.textDim,
  },
  logRowDetail: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    color: c.textMuted,
    marginTop: 3,
  },
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
