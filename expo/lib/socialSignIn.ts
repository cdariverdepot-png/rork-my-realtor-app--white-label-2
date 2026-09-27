import { Platform } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { supabase, ensureSupabaseSession } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/authErrors";
import { socialCallbackRedirect } from "@/lib/authRedirect";

/** Google + Microsoft are on in the shipped product. Set EXPO_PUBLIC_*_SIGN_IN=false to hide. Apple stays opt-in. */
function socialFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name];
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  return defaultOn;
}

/** Standard white-label portal pack: Google + Microsoft always; Apple on iOS (or when env forces on). */
export const SOCIAL_PROVIDERS = [
  { id: "google" as const, label: "Google", enabled: socialFlag("EXPO_PUBLIC_GOOGLE_SIGN_IN", true) },
  {
    id: "apple" as const,
    label: "Apple",
    enabled: socialFlag("EXPO_PUBLIC_APPLE_SIGN_IN", Platform.OS === "ios"),
  },
  { id: "azure" as const, label: "Microsoft", enabled: socialFlag("EXPO_PUBLIC_MICROSOFT_SIGN_IN", true) },
];
export async function startSocialSignIn(provider: "google" | "apple" | "azure") {
  if (!SOCIAL_PROVIDERS.find(p => p.id === provider)?.enabled || !supabase) return { ok: false, error: "This sign-in option isn't available yet. Please use email." };
  if (Platform.OS !== "web" && Constants.appOwnership === "expo") return { ok: false, error: "Use email sign-in in Expo Go. Social sign-in requires the installed app build." };
  try {
    await ensureSupabaseSession();
    // PKCE verifier is stored on this origin; never send a local flow to a different site.
    const redirectTo = Platform.OS === "web" ? socialCallbackRedirect(window.location.origin) : "rork-app://auth/callback";
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true, ...(provider === "azure" ? { scopes: "email" } : {}) } });
    if (error || !data?.url) {
      const msg =
        (error && typeof error === "object" && "message" in error
          ? String((error as { message?: string }).message)
          : "") || "";
      if (
        !data?.url ||
        /provider is not enabled|unsupported provider|validation_failed|not configured/i.test(msg)
      ) {
        return {
          ok: false,
          error:
            "That sign-in provider isn't connected yet. Use email and password, or ask your admin to add Google, Microsoft, or Apple in Supabase Auth.",
        };
      }
      return { ok: false, error: authErrorMessage(error) };
    }
    if (Platform.OS === "web") {
      window.location.assign(data.url);
      return { ok: true, redirecting: true };
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return { ok: false, error: "Sign-in was cancelled. You can try again or use email." };
    const callback = new URL(result.url);
    if (`${callback.protocol}//${callback.host}${callback.pathname}` !== redirectTo) return { ok: false, error: "Couldn't complete sign-in. Please try again." };
    const code = callback.searchParams.get("code");
    if (!code) return { ok: false, error: "Couldn't complete sign-in. Please try again." };
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    return exchanged.error ? { ok: false, error: authErrorMessage(exchanged.error) } : { ok: true };
  } catch { return { ok: false, error: "Couldn't connect to the sign-in provider. Please try again." }; }
}
