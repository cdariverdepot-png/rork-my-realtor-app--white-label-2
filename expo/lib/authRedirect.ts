export const PUBLISHED_AUTH_RETURN =
  "https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/auth/callback/";

/** Loopback origins used by Expo web preview. Must also be in Supabase redirect allowlist. */
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, "");
}

function localCallback(origin: string): string {
  return `${normalizeOrigin(origin)}/auth/callback`;
}

/**
 * Destination for signup / confirm / OTP emailRedirectTo.
 * - On Expo web localhost/127.0.0.1: return to the same origin so confirm links
 *   establish the session where the user is testing (PKCE verifier lives there).
 * - Otherwise: published GitHub Pages callback (safe when mail is opened on
 *   another device). Dashboard "Invite user" always uses Supabase Site URL and
 *   ignores this helper — never use dashboard Invite to test Expo localhost.
 */
export function signupEmailRedirect(origin?: string): string {
  if (origin && LOCAL_ORIGIN_RE.test(normalizeOrigin(origin))) {
    return localCallback(origin);
  }
  return PUBLISHED_AUTH_RETURN;
}
