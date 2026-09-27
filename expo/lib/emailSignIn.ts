import { supabase, withEmailAuth } from "@/lib/supabase";
import { signupEmailRedirect, webOriginForRedirect } from "@/lib/authRedirect";
import { authErrorMessage } from "@/lib/authErrors";

export async function sendAccountCode(email: string, signupConfirmation = false) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { ok: false, error: "Enter your email address first." };
  if (!supabase) return { ok: false, error: "Please reconnect and try again." };
  const sb = supabase;
  try {
    const origin = webOriginForRedirect();
    const { error } = await withEmailAuth(async () => signupConfirmation
      ? await sb.auth.resend({ type: "signup", email: normalized, options: { emailRedirectTo: signupEmailRedirect(origin) } })
      : await sb.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: false, emailRedirectTo: signupEmailRedirect(origin) } }));
    return error ? { ok: false, error: authErrorMessage(error) } : { ok: true };
  } catch { return { ok: false, error: "Couldn't send your code. Please check your connection and try again." }; }
}

/** Confirm-signup emails use type "signup"; magic-link / email OTP uses type "email". Try the expected type first. */
export async function verifyAccountCode(email: string, token: string, signupConfirmation = false) {
  if (!/^\d{6,8}$/.test(token.trim())) return { ok: false, error: "Enter the code from your latest email." };
  if (!supabase) return { ok: false, error: "Please reconnect and try again." };
  const normalized = email.trim().toLowerCase();
  const code = token.trim();
  const types = signupConfirmation ? (["signup", "email"] as const) : (["email", "signup"] as const);
  const sb = supabase;
  try {
    const verified = await withEmailAuth(async () => {
      for (const type of types) {
        const { error } = await sb.auth.verifyOtp({ email: normalized, token: code, type });
        if (!error) return true;
      }
      return false;
    });
    if (verified) return { ok: true };
    return { ok: false, error: "That code is invalid or expired. Check your latest email or request a new code." };
  } catch { return { ok: false, error: "Couldn't confirm your code. Please try again." }; }
}
