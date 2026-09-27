import { Platform } from "react-native";

export const PUBLISHED_AUTH_RETURN =
  "https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/auth/callback/";

/** Loopback origins used by Expo web local preview only. Must be in Supabase redirect allowlist. */
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

/** Deployment base path (app.json experiments.baseUrl), derived from the published URL. */
const BASE_PATH = new URL(PUBLISHED_AUTH_RETURN).pathname.replace(/\/auth\/callback\/?$/, "");

/**
 * The production web host (EAS Hosting), from EXPO_PUBLIC_APP_URL. Web sign-in
 * started there must return to the same origin (PKCE verifier lives there).
 * Must also be in the Supabase redirect allowlist.
 */
const HOSTED_ORIGIN = (() => {
  try { return process.env.EXPO_PUBLIC_APP_URL ? new URL(process.env.EXPO_PUBLIC_APP_URL).origin : ""; }
  catch { return ""; }
})();
const isHostedOrigin = (origin: string): boolean => !!HOSTED_ORIGIN && normalizeOrigin(origin) === HOSTED_ORIGIN;

function localCallback(origin: string): string {
  // Expo serves under experiments.baseUrl in dev too; keep it when the page is under it.
  const underBase = !!BASE_PATH && typeof window !== "undefined" &&
    typeof window.location?.pathname === "string" && window.location.pathname.startsWith(BASE_PATH);
  return `${normalizeOrigin(origin)}${underBase ? BASE_PATH : ""}/auth/callback`;
}

/**
 * Destination for signup / confirm / OTP emailRedirectTo.
 *
 * Production rule (any user, any device):
 * - Native (iOS/Android): always the published HTTPS Pages callback.
 * - Web on localhost / 127.0.0.1 only: same-origin /auth/callback (local web dev).
 * - All other web (GitHub Pages, phone browsers, etc.): published HTTPS callback.
 *
 * Dashboard "Invite user" always uses Supabase Site URL and ignores this helper.
 */
export function signupEmailRedirect(origin?: string): string {
  if (Platform.OS !== "web") {
    return PUBLISHED_AUTH_RETURN;
  }
  if (origin && LOCAL_ORIGIN_RE.test(normalizeOrigin(origin))) {
    return localCallback(origin);
  }
  if (origin && isHostedOrigin(origin)) return `${HOSTED_ORIGIN}/auth/callback`;
  return PUBLISHED_AUTH_RETURN;
}

/** Same rules as signup — password recovery / invite links land on /auth/callback. */
export function passwordResetRedirect(origin?: string): string {
  return signupEmailRedirect(origin);
}

/** OAuth must return to the same origin AND deployment base path as its verifier. */
export function socialCallbackRedirect(origin: string): string {
  const published = new URL(PUBLISHED_AUTH_RETURN);
  if (normalizeOrigin(origin) === published.origin) return PUBLISHED_AUTH_RETURN;
  if (LOCAL_ORIGIN_RE.test(normalizeOrigin(origin))) return localCallback(origin);
  if (isHostedOrigin(origin)) return `${HOSTED_ORIGIN}/auth/callback`;
  throw new Error("Unconfigured authentication origin");
}
/**
 * Pass into signupEmailRedirect / passwordResetRedirect only from web.
 * Native never implies localhost — returns undefined so helpers use PUBLISHED_AUTH_RETURN.
 */
export function webOriginForRedirect(): string | undefined {
  if (Platform.OS !== "web") return undefined;
  if (typeof window === "undefined") return undefined;
  return window.location?.origin;
}
