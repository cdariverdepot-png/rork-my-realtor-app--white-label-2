# Auth smoke checklist (Expo + Supabase)

Code in this release finishes recovery → set-password → realtor session in-app.
Dashboard allowlist / OAuth / SMTP are still required outside the repo.

## Supabase redirect allowlist (Auth → URL configuration)

Add **every** origin you actually open Expo web on:

- Site URL (example published): `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/`
- Callback: `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/auth/callback`
- Callback with trailing slash (Pages): `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/auth/callback/`
- Expo web loopback (adjust port to match Metro):  
  - `http://localhost:8081/**`  
  - `http://127.0.0.1:8081/**`  
  - Exact: `http://localhost:8081/auth/callback` and `http://127.0.0.1:8081/auth/callback`
- Native scheme: `rork-app://auth/callback`

Password reset and signup confirm both redirect to `{origin}/auth/callback` when you are on localhost / 127.0.0.1; otherwise the published Pages callback.

**Do not** use Dashboard → Invite user to test Expo localhost (Invite always uses Site URL).

## OAuth (Google / Microsoft) — buttons vs secrets

Local preview `expo/.env` (see `.env.example`):

```
EXPO_PUBLIC_GOOGLE_SIGN_IN=true
EXPO_PUBLIC_MICROSOFT_SIGN_IN=true
```

That only **shows** the portal buttons. Sign-in still needs:

1. Supabase → Authentication → Providers → Google: Client ID + secret from Google Cloud (authorized redirect = Supabase callback URL shown in the provider panel).
2. Same for Azure / Microsoft.
3. Restart Metro after creating/changing `.env`.

Without provider secrets, tapping a button should show a clear error (not a crash).

## Manual smoke steps (Charlotte)

### A) Password reset link (the bug that dropped to login with no set-password UI)

1. On Expo web (`http://localhost:PORT` or `127.0.0.1`), open `/portal`, choose realtor, **Forgot your password?**
2. Enter the account email → **Email me a link**.
3. Open the email **on the same browser/origin**.
4. You should land on `/auth/callback`, then `/reset-password?mode=set` with **New password** + **Confirm** (no code field).
5. **Save password** → expect `/admin` (or portal sign-in if realtor row could not open yet).
6. Sign out, sign in with email + **new** password → `/admin`.

### B) Signup confirm (localhost redirect)

1. `/portal` → create realtor with email + password.
2. Open confirm link on the **same** Expo origin.
3. Callback should run `completeRealtorSignIn` → `/admin` (not set-password).

### C) Normal login

1. `/portal` → email + password → `/admin`.

### D) Social buttons

1. With `.env` flags set and Metro restarted, Google + Microsoft appear under realtor forms.
2. Until Supabase providers are configured, expect a friendly error — not a blank screen.

## Still blocked on dashboard (sibling / human)

- Redirect allowlist entries above
- Google + Azure provider client IDs/secrets
- Working SMTP / email templates so reset + confirm mail actually arrive
- Published Pages host must serve the app (not 404) if you test non-localhost redirects
