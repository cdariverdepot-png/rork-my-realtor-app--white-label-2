# Production auth — any realtor, any device

Email confirmation and password reset land on the **published HTTPS app**:

`https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/auth/callback/`

Native apps and real users always get that callback. Localhost redirect is **web local-dev only**.

Google and Microsoft buttons are **visible by default** in the shipped portal. Taps still need Supabase → Authentication → Providers (Google / Azure) client IDs and secrets configured in the dashboard — this repo does not store those secrets. Set `EXPO_PUBLIC_GOOGLE_SIGN_IN=false` / `EXPO_PUBLIC_MICROSOFT_SIGN_IN=false` only if you need to hide a button. Apple shows on iOS by default (and when `EXPO_PUBLIC_APPLE_SIGN_IN=true`).

## Production user flow

### 1) Email signup

1. In the app or on the portal, create a realtor account with email + password.
2. Open the branded confirmation **link** from email (phone or browser is fine).
3. You land on the published `/auth/callback/` page; the app confirms the email.
4. If a realtor account opens, you go to `/admin` on web. Otherwise: open the native app and **sign in with the same email + password**.

### 2) Password reset

1. On portal / forgot-password, enter email → **Email me a link**.
2. Open the recovery link on any phone or browser.
3. Published `/auth/callback/` detects recovery → `/reset-password?mode=set`.
4. Choose a new password → **Save password**.
5. Prefer `/admin` on web when the realtor row opens; otherwise open the app and sign in with email + **new** password.

### 3) Day-to-day sign-in

1. Open My Realtor App (or web portal).
2. Email + password → realtor home / `/admin`.

### 4) Google / Microsoft / Apple (standard portal pack)

1. Google + Microsoft buttons show on portal login/signup without a local `.env`. Apple shows on iOS.
2. Until provider client IDs and secrets exist in Supabase Auth → Providers, tapping a social button shows a clear error — email path still works.
3. After dashboard secrets are added, OAuth completes via the same published `/auth/callback/` (or `rork-app://auth/callback` on standalone native).

## Supabase redirect allowlist (Auth → URL configuration)

Required for production:

- Site URL: `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/`
- `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/auth/callback`
- `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/auth/callback/`
- Native scheme (standalone builds): `rork-app://auth/callback`

Also required outside this repo: working SMTP / branded email templates so confirm and reset mail arrive; Google + Azure provider client IDs/secrets for social taps.

## Appendix — local web development only

When `window.location.origin` is literally `http://localhost:PORT` or `http://127.0.0.1:PORT` **on web**, email redirects return to that origin’s `/auth/callback` so PKCE stays on the same machine.

Allowlist for local preview (adjust port):

- `http://localhost:8081/**` and `http://127.0.0.1:8081/**`
- Exact: `http://localhost:8081/auth/callback`, `http://127.0.0.1:8081/auth/callback`

Do **not** use Dashboard → Invite user to test localhost (Invite always uses Site URL). Native and Expo Go never use localhost for email returns — production path is HTTPS Pages + password sign-in in the app.
