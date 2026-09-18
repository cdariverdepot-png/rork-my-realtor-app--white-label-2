import { supabase } from "@/lib/supabase";

/** Password reset for verified Supabase Auth realtor accounts. */

export type ResetStep = "request" | "verify";

export type ResetOutcome = { ok: boolean; error?: string };

/** Send the six-digit code. */
export async function requestResetCode(email: string): Promise<ResetOutcome> {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!supabase) {
    return { ok: false, error: "You're offline. Reconnect and try again." };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { shouldCreateUser: false },
    });
    if (error) {
      console.log("[reset] otp send error", error.message);
      if (/rate|limit|seconds/i.test(error.message)) {
        return { ok: false, error: "Too many attempts. Wait a minute and try again." };
      }
      return { ok: false, error: "Couldn't send the code. Try again shortly." };
    }
    return { ok: true };
  } catch (err) {
    console.log("[reset] otp send exception", err);
    return { ok: false, error: "Couldn't send the code. Try again shortly." };
  }
}

/** Verify the code and set the password on the authenticated user. */
export async function confirmReset(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<ResetOutcome> {
  const e = input.email.trim().toLowerCase();
  const code = input.code.replace(/\D/g, "");
  if (code.length < 6) return { ok: false, error: "Enter the 6-digit code from your email." };
  if (input.newPassword.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  if (!supabase) return { ok: false, error: "You're offline. Reconnect and try again." };

  try {
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: e,
      token: code,
      type: "email",
    });
    if (verifyErr) {
      console.log("[reset] verify error", verifyErr.message);
      if (/expired/i.test(verifyErr.message)) {
        return { ok: false, error: "That code has expired. Send a new one." };
      }
      return { ok: false, error: "That code isn't right. Check and try again." };
    }
  } catch (err) {
    console.log("[reset] verify exception", err);
    return { ok: false, error: "Couldn't verify the code. Try again." };
  }

  try {
    const { error } = await supabase.auth.updateUser({ password: input.newPassword });
    if (error) {
      console.log("[reset] write error", error.message);
      return { ok: false, error: "Couldn't save the new password. Try again." };
    }
    return { ok: true };
  } catch (err) {
    console.log("[reset] write exception", err);
    return { ok: false, error: "Couldn't save the new password. Try again." };
  }
}
