/**
 * Access codes for My Realtor App — multi-tenant white-label.
 *
 * Each realtor gets a deterministic 6-character client code derived from
 * their email. Clients enter this code to access that realtor's tailored
 * version of the app. The code is stored in the Supabase `realtors` table
 * and cached locally for offline use.
 *
 * Guest role codes (never shown in the UI) are OWNER TEST ONLY:
 * - REALTOR → admin walkthrough → /admin/build with local builder (no account gate)
 * - CLIENT / DEMO → client walkthrough → client profile build
 * Real realtors always sign up / sign in on the portal BEFORE /admin/build.
 */

export const CLIENT_CODE_LENGTH = 6;

/** Alphabet used for all client codes — excludes ambiguous chars (0/O/1/I). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function envCode(key: string, fallback: string): string {
  const raw =
    (typeof process !== "undefined" && process.env?.[key]) || fallback;
  return String(raw).trim().toUpperCase() || fallback;
}

function cleanCode(code: string): string {
  return (code ?? "").replace(/\s+/g, "").toUpperCase();
}

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
 * Guest realtor access code (EXPO_PUBLIC_REALTOR_ACCESS_CODE).
 * Mints a fresh admin session → same 5-page walkthrough → /admin/build.
 * Never display this value in the UI.
 */
export const REALTOR_ACCESS_CODE = envCode(
  "EXPO_PUBLIC_REALTOR_ACCESS_CODE",
  "REALTOR"
);

/**
 * Primary guest client access code (EXPO_PUBLIC_CLIENT_ACCESS_CODE).
 * Mints a fresh client session → walkthrough → client profile build.
 * Never display this value in the UI.
 */
export const CLIENT_ACCESS_CODE = envCode(
  "EXPO_PUBLIC_CLIENT_ACCESS_CODE",
  "CLIENT"
);

/**
 * Legacy guest/demo client access code (EXPO_PUBLIC_GUEST_ACCESS_CODE).
 * Kept as an alias of CLIENT so existing DEMO entries still work.
 * Never display this value in the UI.
 */
export const GUEST_ACCESS_CODE = envCode(
  "EXPO_PUBLIC_GUEST_ACCESS_CODE",
  "DEMO"
);

/** True when `code` mints a guest realtor (admin) session. */
export function isRealtorAccessCode(code: string): boolean {
  const clean = cleanCode(code);
  return !!REALTOR_ACCESS_CODE && clean === REALTOR_ACCESS_CODE;
}

/**
 * True when `code` mints a guest client session (CLIENT or legacy DEMO).
 * Prefer isClientAccessCode; isGuestAccessCode remains as a synonym.
 */
export function isClientAccessCode(code: string): boolean {
  const clean = cleanCode(code);
  if (!clean) return false;
  if (CLIENT_ACCESS_CODE && clean === CLIENT_ACCESS_CODE) return true;
  if (GUEST_ACCESS_CODE && clean === GUEST_ACCESS_CODE) return true;
  return false;
}

/** @deprecated Prefer isClientAccessCode — same guest-client matching. */
export function isGuestAccessCode(code: string): boolean {
  return isClientAccessCode(code);
}
