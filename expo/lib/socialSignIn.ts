import { Platform } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import { supabase, clearAnonymousSessionForEmailAuth, withEmailAuth } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/authErrors";
import { socialCallbackRedirect } from "@/lib/authRedirect";

WebBrowser.maybeCompleteAuthSession();

/** Google + Microsoft are on in the shipped product. Set EXPO_PUBLIC_*_SIGN_IN=false to hide. Apple stays opt-in. */
// Metro only inlines literal `process.env.EXPO_PUBLIC_*` reads, so each flag is
// read statically here; a dynamic lookup by name is always undefined in a build.
const SOCIAL_ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_GOOGLE_SIGN_IN: process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN,
  EXPO_PUBLIC_APPLE_SIGN_IN: process.env.EXPO_PUBLIC_APPLE_SIGN_IN,
  EXPO_PUBLIC_MICROSOFT_SIGN_IN: process.env.EXPO_PUBLIC_MICROSOFT_SIGN_IN,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_APP_URL: process.env.EXPO_PUBLIC_APP_URL,
};

/**
 * Public Google OAuth Web client ID (safe to ship). Used for AuthSession /
 * GIS ID-token sign-in so Google consent shows this app's origin, not supabase.co.
 * Fallback matches the client already configured in Supabase Auth → Google.
 */
const GOOGLE_WEB_CLIENT_ID =
  SOCIAL_ENV.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  "2187154705-o27aseatgl4m9ok3jlp6pd53ik55vc7k.apps.googleusercontent.com";

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

const GOOGLE_OIDC_NONCE_KEY = "google.oidc.nonce.v1";
const GOOGLE_OIDC_STATE_KEY = "google.oidc.state.v1";

function socialFlag(name: string, defaultOn: boolean): boolean {
  const raw = SOCIAL_ENV[name];
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

export type SocialSignInResult =
  | { ok: true; redirecting?: boolean }
  | { ok: false; error: string };

function webSessionGet(key: string): string | null {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function webSessionSet(key: string, value: string): void {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function webSessionClear(...keys: string[]): void {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return;
  try {
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

async function makeOidcNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  return { raw, hashed };
}

/**
 * Redirect URI registered on the Google Cloud Web client.
 * Must be the app origin (expo.app / localhost), never *.supabase.co — that is
 * what made Google's consent screen present supabase.co as the application.
 *
 * Native uses the production HTTPS callback because Google Web clients only
 * allow http(s) redirect URIs (not custom schemes).
 */
function googleIdTokenRedirectUri(): string {
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || !window.location?.origin) {
      throw new Error("Unconfigured authentication origin");
    }
    return socialCallbackRedirect(window.location.origin);
  }
  try {
    const appUrl = SOCIAL_ENV.EXPO_PUBLIC_APP_URL;
    if (appUrl) return `${new URL(appUrl).origin}/auth/callback`;
  } catch {
    /* fall through */
  }
  return "https://cdariverdepot-my-realtor.expo.app/auth/callback";
}

function parseIdTokenFromAuthUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get("id_token");
    if (fromQuery) return fromQuery;
    const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    if (!hash) return null;
    return new URLSearchParams(hash).get("id_token");
  } catch {
    return null;
  }
}

function parseStateFromAuthUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get("state");
    if (fromQuery) return fromQuery;
    const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    if (!hash) return null;
    return new URLSearchParams(hash).get("state");
  } catch {
    return null;
  }
}

async function exchangeGoogleIdToken(idToken: string, nonce: string | undefined): Promise<SocialSignInResult> {
  const sb = supabase;
  if (!sb) return { ok: false, error: "This sign-in option isn't available yet. Please use email." };
  const signed = await withEmailAuth(() =>
    sb.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
      ...(nonce ? { nonce } : {}),
    })
  );
  return signed.error ? { ok: false, error: authErrorMessage(signed.error) } : { ok: true };
}

/**
 * Finish a Google ID-token redirect that landed on /auth/callback.
 * Returns null when this URL is not a Google ID-token return (so email/OAuth
 * callback handling can continue).
 */
export async function completeGoogleIdTokenCallback(returnUrl?: string): Promise<SocialSignInResult | null> {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  // Popup flow: close the child window and hand the URL to the opener.
  try {
    const completed = WebBrowser.maybeCompleteAuthSession();
    if (completed?.type === "success") {
      return { ok: true, redirecting: true };
    }
  } catch {
    /* no opener / not a popup — continue with full-page handling */
  }

  const url = returnUrl || window.location.href;
  const idToken = parseIdTokenFromAuthUrl(url);
  if (!idToken) return null;

  const expectedState = webSessionGet(GOOGLE_OIDC_STATE_KEY);
  const returnedState = parseStateFromAuthUrl(url);
  const nonce = webSessionGet(GOOGLE_OIDC_NONCE_KEY) ?? undefined;
  webSessionClear(GOOGLE_OIDC_NONCE_KEY, GOOGLE_OIDC_STATE_KEY);

  if (expectedState && returnedState && expectedState !== returnedState) {
    return { ok: false, error: "Couldn't complete Google sign-in (state mismatch). Please try again." };
  }

  await clearAnonymousSessionForEmailAuth();
  return exchangeGoogleIdToken(idToken, nonce);
}

function buildGoogleAuthRequest(redirectUri: string, hashedNonce: string): AuthSession.AuthRequest {
  return new AuthSession.AuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    redirectUri,
    scopes: ["openid", "email", "profile"],
    responseType: AuthSession.ResponseType.IdToken,
    usePKCE: false,
    extraParams: {
      nonce: hashedNonce,
      prompt: "select_account",
    },
  });
}

/**
 * Google via AuthSession → ID token → supabase.auth.signInWithIdToken.
 * Authorize URL is accounts.google.com with redirect_uri on the app origin,
 * so consent never routes through xdcqjaodcvnlawqcunrr.supabase.co.
 *
 * Web uses a full-page redirect (not a popup). Popup open must be synchronous
 * with the click; any await (anon clear, nonce crypto) before window.open gets
 * the popup blocked and surfaces as "Couldn't connect to the sign-in provider".
 */
async function startGoogleIdTokenSignIn(): Promise<SocialSignInResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    return {
      ok: false,
      error:
        "That sign-in provider isn't connected yet. Use email and password, or ask your admin to add Google in Supabase Auth.",
    };
  }
  const redirectUri = googleIdTokenRedirectUri();
  const { raw: nonce, hashed: hashedNonce } = await makeOidcNonce();
  const request = buildGoogleAuthRequest(redirectUri, hashedNonce);

  // Web: full-page redirect so we never race the user-gesture popup window.
  if (Platform.OS === "web") {
    const authUrl = await request.makeAuthUrlAsync(GOOGLE_DISCOVERY);
    if (!authUrl) {
      return { ok: false, error: "Couldn't start Google sign-in. Please try again." };
    }
    webSessionSet(GOOGLE_OIDC_NONCE_KEY, nonce);
    if (request.state) webSessionSet(GOOGLE_OIDC_STATE_KEY, request.state);
    window.location.assign(authUrl);
    return { ok: true, redirecting: true };
  }

  const result = await request.promptAsync(GOOGLE_DISCOVERY, { showInRecents: true });
  if (result.type === "dismiss" || result.type === "cancel") {
    return { ok: false, error: "Sign-in was cancelled. You can try again or use email." };
  }
  if (result.type === "locked") {
    return { ok: false, error: "Sign-in is already in progress. Please wait a moment and try again." };
  }
  if (result.type !== "success") {
    return { ok: false, error: `Couldn't complete Google sign-in (${result.type}). Please try again.` };
  }
  const idToken =
    result.params.id_token ||
    (typeof result.url === "string" ? parseIdTokenFromAuthUrl(result.url) : null);
  if (!idToken) {
    return { ok: false, error: "Google did not return an ID token. Check the redirect URI on the Google Web client." };
  }
  return exchangeGoogleIdToken(idToken, nonce);
}

/** Microsoft / Apple stay on Supabase OAuth (redirect still goes through supabase.co authorize). */
async function startSupabaseOAuth(provider: "apple" | "azure"): Promise<SocialSignInResult> {
  const redirectTo = Platform.OS === "web" ? socialCallbackRedirect(window.location.origin) : "rork-app://auth/callback";
  const { data, error } = await supabase!.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      ...(provider === "azure" ? { scopes: "email" } : {}),
    },
  });
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
  if (`${callback.protocol}//${callback.host}${callback.pathname}` !== redirectTo) {
    return { ok: false, error: "Couldn't complete sign-in. Please try again." };
  }
  const code = callback.searchParams.get("code");
  if (!code) return { ok: false, error: "Couldn't complete sign-in. Please try again." };
  const sb = supabase!;
  const exchanged = await withEmailAuth(() => sb.auth.exchangeCodeForSession(code));
  return exchanged.error ? { ok: false, error: authErrorMessage(exchanged.error) } : { ok: true };
}

function connectErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) {
    if (/Unconfigured authentication origin/.test(e.message)) {
      return "Google, Apple and Microsoft sign-in work in the installed app and on the published site. Use email and password here.";
    }
    if (/ERR_WEB_BROWSER_BLOCKED|Popup window was blocked/i.test(e.message)) {
      return "The sign-in window was blocked. Allow popups for this site, or try again.";
    }
    // Surface the real error temporarily so production debugging is possible.
    return `Couldn't connect to the sign-in provider (${e.message}). Please try again.`;
  }
  return "Couldn't connect to the sign-in provider. Please try again.";
}

export async function startSocialSignIn(provider: "google" | "apple" | "azure"): Promise<SocialSignInResult> {
  if (!SOCIAL_PROVIDERS.find(p => p.id === provider)?.enabled || !supabase) {
    return { ok: false, error: "This sign-in option isn't available yet. Please use email." };
  }
  if (Platform.OS !== "web" && Constants.appOwnership === "expo") {
    return { ok: false, error: "Use email sign-in in Expo Go. Social sign-in requires the installed app build." };
  }
  try {
    // Start from a clean slate so a guest session can't outlive social sign-in.
    // (Web Google uses full-page redirect after this; popup is not used there.)
    await clearAnonymousSessionForEmailAuth();
    if (provider === "google") return await startGoogleIdTokenSignIn();
    return await startSupabaseOAuth(provider);
  } catch (e) {
    return { ok: false, error: connectErrorMessage(e) };
  }
}
