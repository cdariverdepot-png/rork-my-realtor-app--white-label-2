import { supabase } from "@/lib/supabase";
import { classifyAuthCallbackType } from "@/lib/authCallback";

export type CallbackInput = { code?: string; type?: string | null; error?: string | null; accessToken?: string | null; refreshToken?: string | null };

/** Only callback credentials can complete a callback; an unrelated saved session cannot. */
export async function completeAuthCallback(input: CallbackInput) {
  if (!supabase || input.error) throw new Error("Invalid sign-in callback");
  let kind = classifyAuthCallbackType(input.type ?? null);
  if (input.code) {
    const result = await supabase.auth.exchangeCodeForSession(input.code);
    if (result.error || !result.data.session) throw new Error("Sign-in link expired");
    // The installed SDK returns this marker, though its public result type omits it.
    if ("redirectType" in result.data && result.data.redirectType === "recovery") kind = "recovery";
  } else if (input.accessToken && input.refreshToken) {
    const result = await supabase.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken });
    if (result.error || !result.data.session) throw new Error("Sign-in link expired");
  } else {
    throw new Error("Missing sign-in credentials");
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) throw new Error("Verified account required");
  return kind;
}
