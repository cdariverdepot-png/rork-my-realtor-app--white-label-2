import { supabase, clearAnonymousSessionForEmailAuth } from "@/lib/supabase";
import { signupEmailRedirect, webOriginForRedirect } from "@/lib/authRedirect";
import { authErrorMessage } from "@/lib/authErrors";

export type RealtorAuthResult =
  | { ok: true; realtorId: string }
  | { ok: false; error: string; verificationRequired?: boolean };

/** Sign up with Supabase Auth. The account record is created only after email
 * confirmation, so nobody can claim an existing realtor row by typing its email. */
export async function signUpRealtorWithAuth(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RealtorAuthResult> {
  if (!supabase) return { ok: false, error: "Connect to the internet to create your account." };
  try {
  await clearAnonymousSessionForEmailAuth();
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: { realtor_name: input.name.trim() },
      emailRedirectTo: signupEmailRedirect(webOriginForRedirect()),
    },
  });
  if (error) return { ok: false, error: authErrorMessage(error) };
  if (!data.session) {
    return {
      ok: false,
      verificationRequired: true,
      error: "Check your email to confirm your account, then return here and sign in.",
    };
  }
  return await ensureRealtorAuthRecord(input.name);
  } catch { return { ok: false, error: "Couldn't create your account. Please check your connection and try again." }; }
}

/** Email verification is required for both new and migrated realtor records. */
export async function signInRealtorWithAuth(email: string, password: string): Promise<RealtorAuthResult> {
  if (!supabase) return { ok: false, error: "Connect to the internet to sign in." };
  try {
  await clearAnonymousSessionForEmailAuth();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) return { ok: false, error: authErrorMessage(error), verificationRequired: error.code === "email_not_confirmed" };
  if (!data.session) return { ok: false, error: "Sign-in did not create a session. Please try again." };
  return await ensureRealtorAuthRecord();
  } catch { return { ok: false, error: "Couldn't sign in. Please check your connection and try again." }; }
}

export async function ensureRealtorAuthRecord(name = ""): Promise<RealtorAuthResult> {
  if (!supabase) return { ok: false, error: "The account service is unavailable." };
  try {
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user || !userResult.user.email_confirmed_at) {
    return { ok: false, verificationRequired: true, error: "Confirm your email before continuing." };
  }
  const { data, error } = await supabase.rpc("ensure_realtor_auth_record", { p_name: name });
  if (error || typeof data !== "string") {
    return { ok: false, error: error ? authErrorMessage(error) : "Couldn't load your realtor account. Please try again shortly." };
  }
  return { ok: true, realtorId: data };
  } catch { return { ok: false, error: "Couldn't open your account. Please try again shortly." }; }
}
