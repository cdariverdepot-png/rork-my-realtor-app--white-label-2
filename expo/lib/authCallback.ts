/**
 * Pure helpers for /auth/callback routing after Supabase email / OAuth redirects.
 * Kept free of React / supabase so node:test can load them.
 */

export type AuthCallbackKind = "recovery" | "invite" | "signup" | "email" | "unknown";

/** Read type from hash and query (Supabase puts it in either, depending on flow). */
export function readAuthCallbackType(
  hash: { get(name: string): string | null },
  query: { get(name: string): string | null }
): string | null {
  const raw = hash.get("type") || query.get("type");
  return raw && raw.length > 0 ? raw.toLowerCase() : null;
}

export function classifyAuthCallbackType(type: string | null): AuthCallbackKind {
  if (!type) return "unknown";
  if (type === "recovery") return "recovery";
  if (type === "invite") return "invite";
  if (type === "signup") return "signup";
  if (type === "email" || type === "magiclink") return "email";
  return "unknown";
}

/** Recovery / invite must set a password before completeRealtorSignIn. */
export function needsSetPassword(kind: AuthCallbackKind): boolean {
  return kind === "recovery" || kind === "invite";
}

/** Signup confirm (and default email confirm) may proceed to realtor session. */
export function isSignupConfirm(kind: AuthCallbackKind): boolean {
  return kind === "signup" || kind === "email" || kind === "unknown";
}
