import { Platform } from "react-native";

export const PUBLISHED_AUTH_RETURN =
  "https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/auth/callback/";

/** Loopback origins used by Expo web local preview only. Must be in Supabase redirect allowlist. */
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

function localCallback(origin: string): string {
  return `${normalizeOrigin(origin)}/auth/callback`;
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
  return PUBLISHED_AUTH_RETURN;
}

/** Same rules as signup — password recovery / invite links land on /auth/callback. */
export function passwordResetRedirect(origin?: string): string {
  return signupEmailRedirect(origin);
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
