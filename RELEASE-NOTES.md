# Theme preview / Expo test candidate

Includes seven distinct theme layouts, isolated sample personas and supplied portraits, shared parallax and text fading, original-image comparison, labeled theme selection, and canonical profile preservation. Photo darkening gradients and grain have been removed from theme/demo rendering and image previews.

## GitHub Pages auth return (live)

- Published web origin: `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/`
- Supabase **Site URL**: `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/`
- Redirect allowlist: Site URL, `{base}/auth/callback`, `{base}/portal`, `http://127.0.0.1:4179/`, `rork-app://auth/callback`
- Google / Microsoft social buttons stay off until `EXPO_PUBLIC_GOOGLE_SIGN_IN=true` / `EXPO_PUBLIC_MICROSOFT_SIGN_IN=true` **and** matching OAuth client IDs are configured in the Supabase Auth providers dashboard (do not invent client secrets in this repo).

## Auth (signup / login) — preview notes

Realtor accounts use Supabase email + password on `/portal`. Confirmation `emailRedirectTo` uses the current origin when Expo web is on `localhost` / `127.0.0.1` (so the confirm link returns to the same origin and can finish PKCE / session). Otherwise it uses the published GitHub Pages `/auth/callback/`. Dashboard **Invite user** always redirects to Supabase Site URL (Pages) and will not leave Expo localhost signed in — prefer password signup for Expo preview tests. After confirmation on another origin, return to Expo and sign in with the same email and password, or use the in-app email code controls on the portal.

Client accounts remain device-local (invite code + AsyncStorage). They are not shared across devices or Expo Go reinstalls.

This branch adds:

- Email confirmation / sign-in codes (`EmailCodeSignIn`, `emailSignIn.ts`)
- Safer customer-facing auth errors (`authErrors.ts`)
- PKCE OAuth callback route (`/auth/callback`) and optional social buttons (off unless env flags are set)
- `completeRealtorSignIn` after code or OAuth exchange

### Known blockers for a live preview

1. Published return URL `https://cdariverdepot-png.github.io/rork-my-realtor-app--white-label-2/` currently returns HTTP 404. Confirmation links that land there cannot complete in the browser until that host is republished or Supabase Site URL / redirect allowlist points at a working Expo web origin.
2. Email confirmation is still required in the live Supabase project (`mailer_autoconfirm` off). Without working SMTP / branded mail, or with Confirm email temporarily disabled for a preview-only project, signup will stall after account creation.
3. Anonymous sign-in is used by the app for KV sync (`ensureSupabaseSession`), but the live project may have Anonymous users disabled — enable it or KV sync stays unauthenticated.
4. Automatic native deep-link sign-in after email confirm is still not implemented.

### Fastest path to try signup today

1. In Supabase Auth settings for a preview project: either republish the Rork web app so the Site URL works, **or** temporarily turn off "Confirm email".
2. Allowlist the Site URL you actually use (published Rork and/or your Expo web origin).
3. From this branch in `expo/`: install deps, `npm test`, `npm run expo:start`, open `/portal`, create a realtor, confirm (link or email code), sign in, land on `/admin`.

## External setup / remaining acceptance checks

- Supabase Site URL should match a host that actually serves the app (not a 404).
- Redirect allowlist must include Site URL, `{base}/auth/callback/`, and for Expo preview: `http://localhost:8081/**` and `http://127.0.0.1:8081/**` (or the exact ports you use).
- Branded sender and email templates still require Supabase email/SMTP setup (domain `myrealtorapp.com` or your chosen provider). No SMTP credentials are included in this release.
- Test fresh signup, confirmation, sign-in, save/reload, and switching all seven themes on an Expo device. Real email delivery and authenticated persistence are not certified by the automated tests.
- The supplied portraits are placeholders. Inspect text contrast on bright photos now that overlays are intentionally removed.
- Do not automatically run the included historical SQL migrations against production; reconcile with migrations already applied.

## Local commands (inside expo)

Use the committed dependency lockfile with your package manager. Run `npm run typecheck`, `npm test`, and `npm run expo:start`. The existing Rork start scripts remain unchanged.

This is a source release candidate synced from the local theme-build worktree. Compare against the current target repository before publishing; preserve unrelated remote changes.
