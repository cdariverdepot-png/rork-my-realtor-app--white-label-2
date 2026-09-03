import { hashPassword } from "@/lib/passwordHash";
import { supabase } from "@/lib/supabase";

/**
 * Password reset for realtor accounts.
 *
 * Passwords are stored as one-way SHA-256 hashes, so nobody — including us —
 * can recover the original. That is the correct design, but it means a
 * forgotten password is a permanent lockout unless there is a reset path. A
 * realtor locked out of their own brand, listings and client roster with no
 * way back is the kind of failure that ends the relationship.
 *
 * We prove the person controls the mailbox using Supabase Auth's one-time
 * email code, then write a new hash. Supabase Auth is used purely as an email
 * verifier here — the account model itself stays where it is, so nothing has
 * to be migrated for this to work.
 *
 * The server function refuses to write unless the caller holds a genuine,
 * non-anonymous session whose email matches the account being reset, so
 * possession of the public anon key is not enough to hijack an account.
 */

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

  // Confirm an account exists before mailing anything. Supabase would happily
  // create a brand new auth user for an unknown address, which would send a
  // code that could never reset anything.
  try {
    const { data, error } = await supabase
      .from("realtors")
      .select("id")
      .eq("email", e)
      .maybeSingle();
    if (error) console.log("[reset] lookup error", error.message);
    if (!data) {
      return { ok: false, error: "No account found for that email." };
    }
  } catch (err) {
    console.log("[reset] lookup exception", err);
    return { ok: false, error: "Couldn't reach the server. Try again." };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { shouldCreateUser: true },
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

/** Verify the code and write the new password hash. */
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
    const hash = await hashPassword(e, input.newPassword);
    const { data, error } = await supabase.rpc("reset_realtor_password", {
      p_email: e,
      p_hash: hash,
    });
    if (error) {
      console.log("[reset] write error", error.message);
      return { ok: false, error: "Couldn't save the new password. Try again." };
    }
    const row = data as Record<string, unknown> | null;
    if (row?.ok !== true) {
      const reason = String(row?.reason ?? "");
      if (reason === "no_account") return { ok: false, error: "No account found for that email." };
      return { ok: false, error: "Couldn't save the new password. Try again." };
    }
    return { ok: true };
  } catch (err) {
    console.log("[reset] write exception", err);
    return { ok: false, error: "Couldn't save the new password. Try again." };
  }
}
