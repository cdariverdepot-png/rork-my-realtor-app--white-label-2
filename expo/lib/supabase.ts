import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Supabase client used for realtime sync between realtor (admin) and clients.
 * If credentials are missing, returns null and the app runs in local-only mode.
 *
 * Resolution order (first non-empty wins):
 *   1. `process.env.EXPO_PUBLIC_*` — inlined by Metro at bundle time.
 *   2. `Constants.expoConfig.extra.*` — baked into the manifest via
 *      `app.config.js`. This is the reliable path: even when Metro's env
 *      inlining misses (stale bundle cache, certain CI paths), the value
 *      lives in the manifest itself and `expo-constants` reads it at runtime.
 */
/**
 * Hardcoded fallback. The Supabase anon key is designed to be public — RLS
 * is what protects data, not key secrecy. This guarantees the client can
 * always reach Supabase even if Rork's env injection or Metro's bundle
 * cache drops the EXPO_PUBLIC_* vars (which has happened repeatedly on
 * cold client bundles).
 */
const FALLBACK_URL = "https://xdcqjaodcvnlawqcunrr.supabase.co";
const FALLBACK_ANON =
  "sb_publishable_yAEO6l9LfHPccsDDPUR-uQ_5pRbv4Dt";

/**
 * Supabase's JS SDK expects the bare project origin (https://xxx.supabase.co).
 * Dashboards / some env setups hand out the URL with a service sub-path already
 * appended (e.g. `…supabase.co/rest/v1/`). The SDK then appends its own
 * `/rest/v1/<table>` and you get doubled paths like
 * `/rest/v1/rest/v1/realtors` → 404 on every query (and broken auth/storage).
 * Strip any trailing Supabase service sub-path and slashes so the origin is
 * always clean, no matter how the value was pasted.
 */
function sanitizeSupabaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth|realtime|storage|functions)\/v\d+$/i, "")
    .replace(/\/+$/, "");
}

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const envAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
const extraUrl = typeof extra.SUPABASE_URL === "string" && extra.SUPABASE_URL.length > 0 ? extra.SUPABASE_URL : undefined;
const extraAnon = typeof extra.SUPABASE_ANON_KEY === "string" && extra.SUPABASE_ANON_KEY.length > 0 ? extra.SUPABASE_ANON_KEY : undefined;
/**
 * The production project owns the realtor accounts, SMTP (Resend) and the
 * auth redirect allowlist. A stray EXPO_PUBLIC_SUPABASE_* value pointing at a
 * different project (e.g. one left in Rork's env) sends signups to a project
 * with the Supabase mailer and a localhost Site URL — so any configured value
 * for another project is ignored, together with its key.
 */
const configuredUrl = (envUrl && envUrl.length > 0 ? envUrl : extraUrl) || "";
const configuredAnon = (envAnon && envAnon.length > 0 ? envAnon : extraAnon) || "";
const configuredMatches = !!configuredUrl &&
  sanitizeSupabaseUrl(configuredUrl).toLowerCase() === FALLBACK_URL.toLowerCase();
if (configuredUrl && !configuredMatches) {
  console.log("[supabase] ignoring configured project; using production project", sanitizeSupabaseUrl(configuredUrl).slice(0, 40));
}
const url: string = FALLBACK_URL;
const anon: string = (configuredMatches && configuredAnon) || FALLBACK_ANON;
const urlSource: "env" | "extra" | "fallback" = configuredMatches ? (envUrl ? "env" : "extra") : "fallback";
const anonSource: "env" | "extra" | "fallback" = configuredMatches && configuredAnon ? (envAnon ? "env" : "extra") : "fallback";

/** Snapshot of what the bundle actually saw at module init — surfaced in the
 * client SYNC CHECK alert so we can diagnose missing/empty credentials without
 * console access. Values are truncated; never logs the full anon key. */
export const supabaseEnvDebug = {
  urlPresent: typeof url === "string" && url.length > 0,
  urlPreview: typeof url === "string" ? `${url.slice(0, 32)}${url.length > 32 ? "…" : ""}` : String(url),
  urlLength: typeof url === "string" ? url.length : 0,
  urlSource,
  anonPresent: typeof anon === "string" && anon.length > 0,
  anonPreview: typeof anon === "string" ? `${anon.slice(0, 12)}…(${anon.length})` : String(anon),
  anonLength: typeof anon === "string" ? anon.length : 0,
  anonSource,
} as const;

console.log("[supabase] env at init", supabaseEnvDebug);

/** Custom fetch that catches network errors before they reach console.error
 *  as raw `TypeError: Failed to fetch`. Returns a synthetic Response so the
 *  supabase-js SDK routes through its normal error pipeline (returning
 *  `{ data: null, error: … }`) instead of throwing an unhandled rejection. */
function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return fetch(input, init).catch((e) => {
      // Swallow the raw TypeError — supabase-js receives a clean 0-status
      // Response so it can surface a controlled error through its own
      // `{ data, error }` return pattern instead of throwing.
      const msg = e instanceof Error ? e.message : String(e);
      console.log("[supabase] fetch failed", msg.slice(0, 80));
      return new Response(null, { status: 503, statusText: msg });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("[supabase] fetch exception", msg.slice(0, 80));
    return Promise.resolve(new Response(null, { status: 503, statusText: msg }));
  }
}

export const supabase: SupabaseClient | null = (() => {
  // Static export runs in Node: there is no browser storage or user session.
  // Create the client only on the device, including the hydrated web app.
  if (Platform.OS === "web" && typeof window === "undefined") return null;
  try {
    return createClient(url, anon, {
      auth: {
        storage: AsyncStorage as unknown as Storage,
        autoRefreshToken: true,
        persistSession: true,
        // The callback route owns exchange and recovery routing. Auto-detection
        // here races it and can consume the one-time PKCE code twice.
        detectSessionInUrl: false,
        flowType: "pkce",
      },
      realtime: { params: { eventsPerSecond: 5 } },
      global: {
        fetch: safeFetch,
      },
    });
  } catch (e) {
    console.log("[supabase] init error", e);
    return null;
  }
})();

export const isSupabaseLive = !!supabase;

/** End private device access before discarding the JWT used to revoke it. */
export async function endPrivateSession(): Promise<void> {
  if (!supabase) return;
  if (ensurePromise) await ensurePromise;
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    const { error } = await supabase.rpc('revoke_client_identity');
    if (error) throw new Error('Reconnect before signing out so private access can be revoked.');
    const token = await AsyncStorage.getItem('myrealtor.device.pushToken');
    if (token) {
      const { error: tokenError } = await supabase.from('push_tokens').delete().eq('token',token);
      if (tokenError) throw new Error('Reconnect before signing out.');
      await AsyncStorage.removeItem('myrealtor.device.pushToken');
    }
  }
  await supabase.auth.signOut({scope:'local'});
  ensurePromise = null;
}

/** Recovery verifies email without replacing a realtor or guest app session. */
export function createClientRecoverySession(): SupabaseClient {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
      flowType: "implicit", storageKey: "myrealtor.client-recovery" },
    global: { fetch: safeFetch },
  });
}

/**
 * Ensure the Supabase client has an authenticated session. If RLS policies
 * on `public.app_kv` (or Storage) are gated to the `authenticated` role,
 * unauthenticated clients see zero rows on SELECT — which is exactly the
 * symptom the user reported (client phone shows old data even though
 * realtor writes confirmed succeeding). Anonymous sign-in gives every
 * device a real `auth.uid()` without asking the user for credentials.
 *
 * Returns the current session (or null if Supabase isn't configured /
 * anonymous auth is disabled in the project).
 */
let ensurePromise: Promise<Session | null> | null = null;

/**
 * While an email / password / callback sign-in is running, background sync
 * must not start a guest session: a late anonymous sign-in would overwrite the
 * realtor's real session in storage (they then see "confirm your email" or get
 * logged out on the next launch). Callers wait here until the sign-in settles.
 */
let emailAuthLock: Promise<void> | null = null;

export async function ensureSupabaseSession(): Promise<Session | null> {
  if (!supabase) return null;
  while (emailAuthLock) await emailAuthLock;
  if (ensurePromise) return ensurePromise;
  const sb = supabase;
  ensurePromise = (async () => {
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) console.log("[supabase] getSession error", error.message);
      if (data?.session) {
        console.log(
          "[supabase] existing session",
          data.session.user.id,
          data.session.user.is_anonymous ? "(anon)" : "(user)"
        );
        return data.session;
      }
      console.log("[supabase] no session — signing in anonymously");
      const { data: anonData, error: anonErr } = await sb.auth.signInAnonymously();
      if (anonErr) {
        console.log("[supabase] signInAnonymously error", anonErr.message);
        ensurePromise = null;
        return null;
      }
      console.log("[supabase] anon sign-in ok", anonData.session?.user.id);
      return anonData.session ?? null;
    } catch (e) {
      console.log("[supabase] ensureSession exception", e);
      ensurePromise = null;
      return null;
    }
  })();
  return ensurePromise;
}

/** Drop an anonymous session before email/password auth so signUp/signIn are not layered on anon. */
export async function clearAnonymousSessionForEmailAuth(): Promise<void> {
  if (!supabase) return;
  try {
    // Let startup finish before replacing its guest session with a real account.
    // Otherwise a late anonymous sign-in can race password/OTP authentication.
    if (ensurePromise) await ensurePromise;
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      console.log("[supabase] ending previous private device session before email auth");
      await endPrivateSession();
    }
  } catch (e) {
    console.log("[supabase] clearAnonymousSessionForEmailAuth", e);
    throw e;
  } finally {
    ensurePromise = null;
  }
}

/**
 * Run an account sign-in step (password, email code, recovery, callback
 * exchange) with guest sessions paused. Drops any anonymous session first and
 * holds background anonymous sign-in until `fn` finishes, so the real session
 * is the one that stays stored.
 */
export async function withEmailAuth<T>(fn: () => Promise<T>): Promise<T> {
  while (emailAuthLock) await emailAuthLock;
  let release: () => void = () => {};
  emailAuthLock = new Promise<void>((resolve) => { release = resolve; });
  try {
    await clearAnonymousSessionForEmailAuth();
    return await fn();
  } finally {
    ensurePromise = null;
    emailAuthLock = null;
    release();
  }
}

// A sign-out invalidates the cached session so the next sync call re-checks.
if (supabase) {
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") ensurePromise = null;
    });
  } catch (e) {
    console.log("[supabase] onAuthStateChange", e);
  }
}

// Kick off on module load so the session is ready by the time any context
// fires its first kvGet/kvSet. Failures are logged and swallowed — sync
// then falls back to whatever the open RLS policies allow.
if (supabase) {
  void ensureSupabaseSession();
}
