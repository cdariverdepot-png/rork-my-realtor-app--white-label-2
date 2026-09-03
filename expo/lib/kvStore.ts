import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureSupabaseSession, supabase } from "./supabase";
import { uploadJpegToStorage } from "./imageUpload";

/**
 * Durable shared state via Supabase Postgres.
 *
 * One JSONB row per logical "blob" (listings, documents, clientFeeds, etc.)
 * keyed by string. Replaces the previous broadcast-only sync, which was
 * ephemeral and lost any update made while the other device was offline.
 *
 * SQL setup (run once in Supabase SQL editor):
 *
 *   create table if not exists public.app_kv (
 *     key text primary key,
 *     value jsonb not null,
 *     rev bigint not null default 0,
 *     updated_at timestamptz not null default now()
 *   );
 *   alter publication supabase_realtime add table public.app_kv;
 *   alter table public.app_kv enable row level security;
 *   create policy "kv read"   on public.app_kv for select using (true);
 *   create policy "kv insert" on public.app_kv for insert with check (true);
 *   create policy "kv update" on public.app_kv for update using (true) with check (true);
 *
 * Policies are intentionally open for the preview build — production would
 * gate by an `owner_id` column matched against `auth.uid()`.
 */

const TABLE = "app_kv";

export type KvRow<T> = { value: T; rev: number };

let tableMissing = false;

/**
 * In-memory ring buffer of every kvSet attempt. Surfaced on the Diagnostics
 * screen so the realtor can see — without a Mac/USB log viewer — exactly
 * which writes were attempted, the payload size, and the precise error
 * Supabase returned (or "ok" on success). This is the single source of truth
 * for "is the realtor side actually writing to Supabase?".
 */
export type KvWriteLogEntry = {
  at: number;
  key: string;
  rev: number;
  sizeKb: number;
  status: "ok" | "error" | "skipped";
  detail?: string;
};

const WRITE_LOG_CAP = 50;
const WRITE_LOG_STORAGE_KEY = "vance.kvWriteLog.v1";
let writeLog: KvWriteLogEntry[] = [];
const writeLogListeners = new Set<() => void>();
let writeLogHydrated = false;

// Hydrate from AsyncStorage so the log survives Expo Go reloads — without
// persistence, the realtor reloads after save and the log appears empty,
// making it impossible to tell whether the write was attempted.
(async () => {
  try {
    const raw = await AsyncStorage.getItem(WRITE_LOG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as KvWriteLogEntry[];
      if (Array.isArray(parsed)) {
        writeLog = parsed.slice(0, WRITE_LOG_CAP);
        writeLogListeners.forEach((fn) => fn());
      }
    }
  } catch (e) {
    console.log("[kv] writeLog hydrate error", e);
  } finally {
    writeLogHydrated = true;
  }
})();

function persistWriteLog(): void {
  if (!writeLogHydrated) return;
  AsyncStorage.setItem(WRITE_LOG_STORAGE_KEY, JSON.stringify(writeLog)).catch((e) =>
    console.log("[kv] writeLog persist error", e)
  );
}

export function recordKvWrite(entry: KvWriteLogEntry): void {
  writeLog.unshift(entry);
  if (writeLog.length > WRITE_LOG_CAP) writeLog.length = WRITE_LOG_CAP;
  persistWriteLog();
  writeLogListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.log("[kv] writeLog listener", e);
    }
  });
}

function recordWrite(entry: KvWriteLogEntry): void {
  recordKvWrite(entry);
}

export function getKvWriteLog(): readonly KvWriteLogEntry[] {
  return writeLog;
}

export function subscribeKvWriteLog(fn: () => void): () => void {
  writeLogListeners.add(fn);
  return () => {
    writeLogListeners.delete(fn);
  };
}

export function clearKvWriteLog(): void {
  writeLog.length = 0;
  persistWriteLog();
  writeLogListeners.forEach((fn) => fn());
}

function isMissingTableError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string };
  if (err.code === "42P01") return true;
  if (err.message && /relation .* does not exist/i.test(err.message)) return true;
  if (err.message && /could not find the table/i.test(err.message)) return true;
  return false;
}

export function isKvEnabled(): boolean {
  return !!supabase && !tableMissing;
}

export async function kvGet<T>(key: string): Promise<KvRow<T> | null> {
  if (!supabase || tableMissing) return null;
  try {
    await ensureSupabaseSession();
    const { data, error } = await supabase
      .from(TABLE)
      .select("value, rev")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) {
        tableMissing = true;
        console.log("[kv] table public.app_kv missing — run SQL setup. Falling back to broadcast-only sync.");
      } else {
        console.log("[kv] get error", key, error.message ?? error);
      }
      return null;
    }
    if (!data) return null;
    return { value: data.value as T, rev: Number(data.rev) };
  } catch (e) {
    if (isMissingTableError(e)) tableMissing = true;
    console.log("[kv] get exception", key, e);
    return null;
  }
}

/**
 * In-memory cache mapping a base64 image fingerprint to its uploaded
 * Storage URL. Prevents re-uploading the same legacy image on every save —
 * critical because every listing save serialises the entire listings array.
 */
const inlineUploadCache = new Map<string, string>();

/** Fingerprint a data URL cheaply (length + first/last 64 chars). */
function fingerprint(dataUrl: string): string {
  const len = dataUrl.length;
  return `${len}:${dataUrl.slice(0, 64)}:${dataUrl.slice(-64)}`;
}

/**
 * Recursively walk a value and replace any `data:image/...;base64,...`
 * strings with uploaded Storage URLs. Mutates a deep clone — the original
 * stays untouched so local state isn't disturbed.
 *
 * Legacy listings/brand data persisted before the Storage flow shipped is
 * full of huge inline base64 blobs. Those silently blow past Supabase's REST
 * payload limit ("request entity too large") on every upsert, which is the
 * actual reason cross-device sync isn't working. Sanitising here means the
 * fix applies to every context (listings, brand, documents, etc.) at once,
 * without touching each one individually, and self-heals existing data the
 * first time it's saved after this update.
 */
async function sanitizeInlineImages<T>(value: T): Promise<{ value: T; replaced: number; skipped: number }> {
  let replaced = 0;
  let skipped = 0;

  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === "string") {
      if (v.startsWith("data:image/") && v.length > 2000) {
        const fp = fingerprint(v);
        const cached = inlineUploadCache.get(fp);
        if (cached) {
          replaced++;
          return cached;
        }
        const commaIdx = v.indexOf(",");
        if (commaIdx < 0) return v;
        const b64 = v.slice(commaIdx + 1);
        try {
          const url = await uploadJpegToStorage(b64);
          if (url) {
            inlineUploadCache.set(fp, url);
            replaced++;
            return url;
          }
        } catch (e) {
          console.log("[kv] inline upload failed", e);
        }
        skipped++;
        return v;
      }
      return v;
    }
    if (Array.isArray(v)) {
      const out: unknown[] = new Array(v.length);
      for (let i = 0; i < v.length; i++) out[i] = await walk(v[i]);
      return out;
    }
    if (v && typeof v === "object") {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src)) out[k] = await walk(src[k]);
      return out;
    }
    return v;
  };

  const sanitized = (await walk(value)) as T;
  return { value: sanitized, replaced, skipped };
}

export async function kvSet<T>(key: string, value: T, rev: number): Promise<void> {
  if (!supabase || tableMissing) {
    recordWrite({
      at: Date.now(),
      key,
      rev,
      sizeKb: 0,
      status: "skipped",
      detail: !supabase ? "Supabase client not initialised (env vars missing?)" : "public.app_kv table missing",
    });
    return;
  }
  try {
    await ensureSupabaseSession();
    // Up-front: strip any inline base64 images out to Storage so the JSON
    // blob stays tiny. Without this, legacy data persisted before the
    // Storage flow shipped causes every upsert to fail with HTTP 413
    // "request entity too large" — which is silent from the user's POV.
    const { value: sanitized, replaced, skipped } = await sanitizeInlineImages(value);
    if (replaced > 0 || skipped > 0) {
      console.log(`[kv] sanitized "${key}": ${replaced} inline image(s) → Storage URL, ${skipped} kept inline`);
    }

    let approxBytes = 0;
    try {
      approxBytes = JSON.stringify(sanitized).length;
    } catch {}
    if (approxBytes > 900_000) {
      console.log(
        `[kv] WARNING: payload for "${key}" is ${(approxBytes / 1024).toFixed(0)}KB even after sanitization — Supabase will likely reject this. Check for non-image inline data.`
      );
    }
    const { error } = await supabase.from(TABLE).upsert(
      {
        key,
        value: sanitized as unknown as Record<string, unknown>,
        rev,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) {
      const errMsg = error.message ?? String(error);
      if (isMissingTableError(error)) {
        tableMissing = true;
        console.log("[kv] table public.app_kv missing — run SQL setup.");
        recordWrite({ at: Date.now(), key, rev, sizeKb: Math.round(approxBytes / 1024), status: "error", detail: "Table public.app_kv missing" });
      } else {
        const msgLower = errMsg.toLowerCase();
        if (msgLower.includes("too large") || msgLower.includes("413")) {
          const detail = `PAYLOAD TOO LARGE (~${(approxBytes / 1024).toFixed(0)}KB). Storage upload likely failed — confirm 'app-images' bucket exists & is public.`;
          console.log(`[kv] ${detail}`);
          recordWrite({ at: Date.now(), key, rev, sizeKb: Math.round(approxBytes / 1024), status: "error", detail });
        } else {
          console.log("[kv] set error", key, errMsg, `(payload ~${(approxBytes / 1024).toFixed(0)}KB)`);
          recordWrite({ at: Date.now(), key, rev, sizeKb: Math.round(approxBytes / 1024), status: "error", detail: errMsg });
        }
      }
      return;
    }
    console.log(`[kv] set ok "${key}" rev=${rev} size=${(approxBytes / 1024).toFixed(0)}KB`);
    recordWrite({ at: Date.now(), key, rev, sizeKb: Math.round(approxBytes / 1024), status: "ok" });
  } catch (e) {
    if (isMissingTableError(e)) tableMissing = true;
    const detail = e instanceof Error ? e.message : String(e);
    console.log("[kv] set exception", key, e);
    recordWrite({ at: Date.now(), key, rev, sizeKb: 0, status: "error", detail: `Exception: ${detail}` });
  }
}

export function kvSubscribe<T>(
  key: string,
  onChange: (row: KvRow<T>) => void
): () => void {
  if (!supabase || tableMissing) return () => {};
  const sb = supabase;
  // Realtime channels also respect RLS — establish a session before joining.
  void ensureSupabaseSession();
  const ch = sb
    .channel(`kv:${key}`)
    .on(
      // @ts-expect-error supabase-js types don't always expose postgres_changes literal
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: `key=eq.${key}` },
      (payload: { new?: { value: unknown; rev: number } | null; old?: { value: unknown; rev: number } | null }) => {
        const row = payload.new ?? payload.old;
        if (!row) return;
        onChange({ value: row.value as T, rev: Number(row.rev) });
      }
    )
    .subscribe();
  return () => {
    try {
      sb.removeChannel(ch);
    } catch (e) {
      console.log("[kv] unsubscribe", e);
    }
  };
}
