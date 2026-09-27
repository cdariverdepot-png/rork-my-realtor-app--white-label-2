import { supabase, withEmailAuth } from "@/lib/supabase";
import { classifyAuthCallbackType } from "@/lib/authCallback";

export type CallbackInput = {
  code?: string;
  type?: string | null;
  error?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  /** From email templates that link with `{{ .TokenHash }}` — works on any device. */
  tokenHash?: string | null;
};

export type CallbackFailureReason = "other-device" | "expired" | "invalid";

/** Error carrying why a callback failed, so the screen can say something useful. */
export class AuthCallbackError extends Error {
  reason: CallbackFailureReason;
  constructor(message: string, reason: CallbackFailureReason) {
    super(message);
    this.name = "AuthCallbackError";
    this.reason = reason;
  }
}

/**
 * PKCE links can only be exchanged in the browser/app that requested them (the
 * code verifier lives there). Supabase has already confirmed the email by the
 * time it redirects, so this failure means "open it where you started" — not
 * "your account is broken".
 */
function isMissingVerifier(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; code?: string; message?: string };
  return e.name === "AuthPKCECodeVerifierMissingError" ||
    e.code === "pkce_code_verifier_not_found" ||
    e.code === "flow_state_not_found" ||
    /code verifier|flow state|code challenge/i.test(e.message ?? "");
}

const OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
type OtpType = (typeof OTP_TYPES)[number];

/** Only callback credentials can complete a callback; an unrelated saved session cannot. */
export async function completeAuthCallback(input: CallbackInput) {
  if (!supabase || input.error) throw new AuthCallbackError("Invalid sign-in callback", "expired");
  const sb = supabase;
  return withEmailAuth(async () => {
    let kind = classifyAuthCallbackType(input.type ?? null);
    const otpType = (input.type ?? "").toLowerCase() as OtpType;
    if (input.tokenHash && OTP_TYPES.includes(otpType)) {
      const result = await sb.auth.verifyOtp({ token_hash: input.tokenHash, type: otpType });
      if (result.error || !result.data.session) throw new AuthCallbackError("Sign-in link expired", "expired");
    } else if (input.code) {
      const result = await sb.auth.exchangeCodeForSession(input.code);
      if (result.error || !result.data.session) {
        throw new AuthCallbackError("Sign-in link expired", isMissingVerifier(result.error) ? "other-device" : "expired");
      }
      // The installed SDK returns this marker, though its public result type omits it.
      if ("redirectType" in result.data && result.data.redirectType === "recovery") kind = "recovery";
    } else if (input.accessToken && input.refreshToken) {
      const result = await sb.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken });
      if (result.error || !result.data.session) throw new AuthCallbackError("Sign-in link expired", "expired");
    } else {
      throw new AuthCallbackError("Missing sign-in credentials", "invalid");
    }
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) {
      throw new AuthCallbackError("Verified account required", "invalid");
    }
    return kind;
  });
}
