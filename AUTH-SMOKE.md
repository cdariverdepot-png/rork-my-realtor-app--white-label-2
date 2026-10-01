# Production auth — any realtor, any device

**Primary production web app:** `https://cdariverdepot-my-realtor.expo.app`

Email confirmation and password reset from that origin land on:

`https://cdariverdepot-my-realtor.expo.app/auth/callback`

Native apps use the app scheme for email / social returns:

`rork-app://auth/callback`

Legacy GitHub Pages callback remains allowlisted as a fallback:

`https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/auth/callback/`

Localhost redirect is **web local-dev only**.

`EXPO_PUBLIC_AUTH_BYPASS` must be **false** (or unset) in production so real login works. Bypass is env-gated only for intentional preview builds.

Google and Microsoft buttons are **visible by default** in the shipped portal. Taps still need Supabase → Authentication → Providers (Google / Azure) client IDs and secrets configured in the dashboard — this repo does not store those secrets. Set `EXPO_PUBLIC_GOOGLE_SIGN_IN=false` / `EXPO_PUBLIC_MICROSOFT_SIGN_IN=false` only if you need to hide a button. Apple shows on iOS by default (and when `EXPO_PUBLIC_APPLE_SIGN_IN=true`).

## Guest / demo client access code

Default code: **`DEMO`** (env `EXPO_PUBLIC_GUEST_ACCESS_CODE`).

On Client Login → enter code, type `DEMO` and continue. The app clears any prior session, mints a **new** personal (client) account each time (unique `guest+{uuid}@…` identity), and opens the client home under the Eliza Vance showcase. Real realtor codes and email/social signup are unchanged.

If Supabase **Anonymous Sign-Ins** is enabled (Dashboard → Authentication → Providers), each guest also gets a fresh anonymous Auth user. If it is off, the app still creates the local client session (unique email signup is attempted as a fallback; email confirmation is not required for guest entry).

Management API cannot toggle anonymous auth on project `xdcqjaodcvnlawqcunrr` with the current token — flip it in the dashboard if you want Supabase-backed guest identities.

## Production user flow

### 1) Email signup (web on Expo host)

1. Open https://cdariverdepot-my-realtor.expo.app → Realtor Login → create account.
2. Check email for the confirmation **link**.
3. Open the link **in the same browser** that signed up (best for auto-login / PKCE).
4. You land on `/auth/callback`; on success you go to `/admin`.
5. If the link opened in another browser/app: email is still confirmed — return to the portal and sign in with **password** or **email code**.

### 2) Email signup (native app)

1. Create account in the app.
2. Open the confirmation link (prefer on the same phone so `rork-app://` can deep-link).
3. If the session opens in-app, continue to admin. Otherwise open the app and sign in with password or email code.

### 3) Password reset

1. On portal / forgot-password, enter email → **Email me a link**.
2. Open the recovery link (same device/browser when possible).
3. `/auth/callback` detects recovery → `/reset-password?mode=set`.
4. Choose a new password → **Save password** → prefer `/admin` when the realtor row opens.

### 4) Day-to-day sign-in

1. Open My Realtor App (or web portal).
2. Email + password → realtor home / `/admin`.
3. Or use **Sign in with an email code** on the portal.

### 5) Google / Microsoft / Apple

1. Buttons show on portal without a local `.env`. Apple shows on iOS.
2. **Google** uses AuthSession → Google ID token → `supabase.auth.signInWithIdToken` so consent uses the Expo app origin (`cdariverdepot-my-realtor.expo.app` / localhost), **not** `*.supabase.co`.
3. On **web**, Google uses a **full-page redirect** to accounts.google.com (then back to `/auth/callback#id_token=…`). A popup after `await` is blocked by browsers and used to show "Couldn't connect to the sign-in provider".
4. **Microsoft / Apple** still use Supabase OAuth (authorize host remains supabase.co until a similar ID-token path exists). Before opening that URL, the app **probes** `/auth/v1/authorize` so a disabled provider never dumps raw Supabase JSON in the browser — users see a friendly in-app message instead.
5. Microsoft requires Supabase Auth → Azure enabled with Application (client) ID + secret from an Entra app registration (redirect `https://xdcqjaodcvnlawqcunrr.supabase.co/auth/v1/callback`). Until that is configured, the Microsoft button stays visible but shows the friendly "provider isn't connected" message. Google ID-token path stays independent.
6. Google redirect URIs must include the Expo `/auth/callback` (and localhost for web dev) on the **Google Cloud Web client**, in addition to the Supabase callback URI.
7. Cold start / logout lands on `/` (welcome). Portal without `entry=client` shows the welcome gateway — not the client code screen. Back from code clears sticky `?entry=client`.

### Google Cloud Console (required for Google ID-token)

On the existing Web application OAuth client (the same Client ID configured in Supabase Auth → Google):

**Authorized JavaScript origins**
- `https://cdariverdepot-my-realtor.expo.app`
- `http://localhost:8081`

**Authorized redirect URIs** (keep the Supabase callback too for Microsoft / legacy)
- `https://cdariverdepot-my-realtor.expo.app/auth/callback`
- `http://localhost:8081/auth/callback`
- `https://xdcqjaodcvnlawqcunrr.supabase.co/auth/v1/callback` (existing — do not remove)

**OAuth consent screen**
- App name: My Realtor App (or Little Lights Digital if that brand is preferred)
- Authorized domain / homepage as appropriate so consent no longer implies supabase.co

Ship `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (public) in `.env.production` so the web bundle embeds the Web client ID.

## Supabase dashboard (required outside this repo)

### Auth → URL configuration

- **Site URL:** `https://cdariverdepot-my-realtor.expo.app`
- Redirect allowlist:
  - `https://cdariverdepot-my-realtor.expo.app/**`
  - `https://cdariverdepot-my-realtor.expo.app/auth/callback`
  - `rork-app://auth/callback`
  - `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/**` (legacy)
  - Local web: `http://localhost:8081/**`, `http://127.0.0.1:8081/**` (and matching `/auth/callback`)

### Email templates (strongly recommended)

Use **Token Hash** links so confirm / recovery works across browsers and devices (no PKCE verifier required):

- Confirm signup / magic link / recovery: link to  
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`  
  (use `type=recovery` for reset, `type=magiclink` or `email` for OTP links as appropriate)

The app’s `/auth/callback` already calls `verifyOtp({ token_hash, type })` when those query params are present.

Also required: working SMTP so confirm and reset mail arrive; Google + Azure provider client IDs/secrets for social taps.

## Appendix — local web development only

When `window.location.origin` is literally `http://localhost:PORT` or `http://127.0.0.1:PORT` **on web**, email redirects return to that origin’s `/auth/callback` so PKCE stays on the same machine.

Do **not** use Dashboard → Invite user to test localhost (Invite always uses Site URL).
