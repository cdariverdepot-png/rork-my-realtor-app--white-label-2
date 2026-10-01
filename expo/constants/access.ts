/**
 * Client access codes for My Realtor App — multi-tenant white-label.
 *
 * Each realtor gets a deterministic 6-character client code derived from
 * their email. Clients enter this code to access that realtor's tailored
 * version of the app. The code is stored in the Supabase `realtors` table
 * and cached locally for offline use.
 *
 * There is no longer a universal "realtor access code" — realtors sign up
 * and sign in with email + password directly through the portal.
 */

export const CLIENT_CODE_LENGTH = 6;

/** Alphabet used for all client codes — excludes ambiguous chars (0/O/1/I). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Visual format helper. */
export function formatCode(code: string): string {
  return code.replace(/[^A-Z0-9-]/gi, "").toUpperCase();
}

/** Deterministic client code from email seed. Mirrors the Supabase SQL function. */
export function deriveClientCode(email: string): string {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return "AAAAAA";

  let h1 = 2166136261 >>> 0;
  let h2 = 2216829733 >>> 0;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = ((h1 ^ ch) * 16777619) >>> 0;
    h2 = ((h2 ^ ch) * 16777619) >>> 0;
  }
  const alpha = CODE_ALPHABET;
  const n = alpha.length;
  let out = "";
  for (let i = 0; i < CLIENT_CODE_LENGTH; i++) {
    const source = i % 2 === 0 ? h1 : h2;
    out += alpha[source % n];
    if (i % 2 === 0) {
      h1 = ((h1 ^ (h1 >>> 13)) * 16777619) >>> 0;
    } else {
      h2 = ((h2 ^ (h2 >>> 17)) * 16777619) >>> 0;
    }
  }
  return out;
}

/**
 * Generate a random 6-char code. Only used as a fallback placeholder.
 */
export function generateClientCode(): string {
  let out = "";
  for (let i = 0; i < CLIENT_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Default demo/guest client access code (EXPO_PUBLIC_GUEST_ACCESS_CODE).
 * Entering this on the client code screen skips email signup and creates a
 * fresh personal (client) account every time — not a reused user.
 * Falls back to "DEMO" when the env var is unset so production deploys that
 * rewrite .env.production still keep the feature.
 */
export const GUEST_ACCESS_CODE = (
  (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_GUEST_ACCESS_CODE) ||
  "DEMO"
)
  .trim()
  .toUpperCase() || "DEMO";

/** True when `code` matches the configured guest/demo access code. */
export function isGuestAccessCode(code: string): boolean {
  const clean = (code ?? "").replace(/\s+/g, "").toUpperCase();
  return !!GUEST_ACCESS_CODE && clean === GUEST_ACCESS_CODE;
}
