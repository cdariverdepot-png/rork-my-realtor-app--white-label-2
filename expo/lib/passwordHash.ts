import * as Crypto from "expo-crypto";

/**
 * One-way password hashing for realtor + client accounts.
 *
 * Replaces the previous reversible base64 "obfuscation". Hashes are computed
 * with SHA-256 over a peppered, email-salted input so:
 *   - identical passwords across different accounts produce different hashes
 *   - the stored value cannot be trivially decoded back to the password
 *
 * This is verified client-side against the hash stored in Supabase. For a
 * fully hardened build you would move account auth to Supabase Auth (bcrypt /
 * scrypt on the server); this is the strongest option available while the app
 * verifies credentials itself.
 */

/** App-wide pepper. Changing this invalidates every stored hash. */
const PEPPER = "myrealtor.v1";

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Compute the canonical password hash for an account. */
export async function hashPassword(email: string, password: string): Promise<string> {
  const input = `${PEPPER}|${normEmail(email)}|${password}`;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

/**
 * Legacy base64 "obfuscation" used by builds before SHA-256 hashing shipped.
 * Kept only so accounts created on older builds can still sign in; on next
 * successful login the caller can transparently upgrade them.
 */
export function legacyObfuscate(password: string): string {
  try {
    if (typeof globalThis.btoa === "function") return globalThis.btoa(`mr:${password}`);
  } catch {}
  return `mr:${password}`;
}

/**
 * Verify a password against a stored hash. Accepts either the modern SHA-256
 * hash or a legacy obfuscated value. Returns whether it matched and whether
 * the stored value should be upgraded to the modern hash.
 */
export async function verifyPassword(
  email: string,
  password: string,
  storedHash: string
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  const modern = await hashPassword(email, password);
  if (storedHash === modern) return { ok: true, needsUpgrade: false };
  if (storedHash === legacyObfuscate(password)) return { ok: true, needsUpgrade: true };
  return { ok: false, needsUpgrade: false };
}
