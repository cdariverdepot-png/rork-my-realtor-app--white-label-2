import { supabase, clearAnonymousSessionForEmailAuth } from "@/lib/supabase";
import { passwordResetRedirect } from "@/lib/authRedirect";

/** Password reset for verified Supabase Auth realtor accounts (link-based). */

export type ResetStep = "request" | "sent" | "set";

export type ResetOutcome = { ok: boolean; error?: string };

function originForRedirect(): string | undefined {
  return typeof window !== "undefined" ? window.location?.origin : undefined;
}

/**
 * Email a recovery **link** (not a six-digit code). Opens /auth/callback with
 * type=recovery, which routes to /reset-password?mode=set.
 * resetPasswordForEmail never creates users (same as shouldCreateUser: false).
 */
export async function requestResetLink(email: string): Promise<ResetOutcome> {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!supabase) {
    return { ok: false, error: "You're offline. Reconnect and try again." };
  }

  try {
    await clearAnonymousSessionForEmailAuth();
    const { error } = await supabase.auth.resetPasswordForEmail(e, {
      redirectTo: passwordResetRedirect(originForRedirect()),
    });
    if (error) {
      console.log("[reset] link send error", error.message);
      if (/rate|limit|seconds/i.test(error.message)) {
        return { ok: false, error: "Too many attempts. Wait a minute and try again." };
      }
      return { ok: false, error: "Couldn't send the reset link. Try again shortly." };
    }
    return { ok: true };
  } catch (err) {
    console.log("[reset] link send exception", err);
    return { ok: false, error: "Couldn't send the reset link. Try again shortly." };
  }
}

/** @deprecated Prefer requestResetLink — kept as alias for older call sites / tests. */
export async function requestResetCode(email: string): Promise<ResetOutcome> {
  return requestResetLink(email);
}

/**
 * Set a new password when a recovery/invite session already exists
 * (after clicking the email link → /auth/callback → /reset-password?mode=set).
 */
export async function setNewPasswordWhileAuthenticated(newPassword: string): Promise<ResetOutcome> {
  if (newPassword.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  if (!supabase) return { ok: false, error: "You're offline. Reconnect and try again." };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return {
        ok: false,
        error: "This reset link expired or wasn't opened here. Request a new one.",
      };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.log("[reset] set password error", error.message);
      return { ok: false, error: "Couldn't save the new password. Try again." };
    }
    return { ok: true };
  } catch (err) {
    console.log("[reset] set password exception", err);
    return { ok: false, error: "Couldn't save the new password. Try again." };
  }
}

/** Alias used by some call sites. */
export async function setNewPassword(newPassword: string): Promise<ResetOutcome> {
  return setNewPasswordWhileAuthenticated(newPassword);
}

/**
 * Legacy OTP path: verify a six-digit email code then set password.
 * Primary product path is the recovery link + setNewPasswordWhileAuthenticated.
 */
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
      type: "recovery",
    });
    if (verifyErr) {
      // Some projects still deliver email OTP under type "email".
      const fallback = await supabase.auth.verifyOtp({
        email: e,
        token: code,
        type: "email",
      });
      if (fallback.error) {
        console.log("[reset] verify error", verifyErr.message);
        if (/expired/i.test(verifyErr.message)) {
          return { ok: false, error: "That code has expired. Send a new one." };
        }
        return { ok: false, error: "That code isn't right. Check and try again." };
      }
    }
  } catch (err) {
    console.log("[reset] verify exception", err);
    return { ok: false, error: "Couldn't verify the code. Try again." };
  }

  return setNewPasswordWhileAuthenticated(input.newPassword);
}
