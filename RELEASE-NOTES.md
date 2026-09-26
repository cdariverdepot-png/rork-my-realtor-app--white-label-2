# Theme preview / Expo test candidate

Includes seven distinct theme layouts, isolated sample personas and supplied portraits, shared parallax and text fading, original-image comparison, labeled theme selection, and canonical profile preservation. Photo darkening gradients and grain have been removed from theme/demo rendering and image previews.

Signup uses the explicitly configured local browser return URL on port 4179 and the published web app elsewhere. Native signup currently confirms through the published website; return to Expo and sign in after confirmation. Automatic native email deep-link sign-in is not implemented. Existing confirmation emails may contain obsolete destinations; use a fresh email for verification.

## External setup / remaining acceptance checks

- Supabase Site URL: https://my-realtor-app-white-label-2.rork.app
- Redirect allowlist includes that exact URL and http://127.0.0.1:4179/ (owner reports saved).
- Branded sender and email templates still require Supabase email/SMTP setup. No SMTP credentials are included in this release.
- Test fresh signup, confirmation, sign-in, save/reload, and switching all seven themes on an Expo device. Real email delivery and authenticated persistence are not certified by the automated tests.
- The supplied portraits are placeholders. Inspect text contrast on bright photos now that overlays are intentionally removed.
- Do not automatically run the included historical SQL migrations against production; reconcile with migrations already applied.

## Local commands (inside expo)

Use the committed dependency lockfile with your package manager. Run `npm run typecheck`, `npm test`, and `npm run expo:start`. The existing Rork start scripts remain unchanged.

This is a source release candidate, not evidence of GitHub synchronization or App Store readiness. Compare against the current target repository before publishing; preserve unrelated remote changes.
