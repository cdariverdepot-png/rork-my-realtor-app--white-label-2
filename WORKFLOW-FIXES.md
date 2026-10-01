# Workflow and onboarding repairs

The REALTOR and CLIENT owner testing codes still open their test experiences without an account login.

## Changes

- Client signup waits for server registration; duplicate accounts lead back to sign-in/recovery. Sign-in distinguishes service outages from missing accounts and verifies current server credentials.
- Client password recovery verifies email and preserves the existing client ID, profile and history.
- Completed profile edits remain drafts until saved; exits explicitly discard edits or confirm sign-out. Phone is required only for phone/text contact preferences.
- Booking reports success only after saving, preserves request IDs across retries, and uses the realtor and canonical lead identity from public invitations. Invalid links, failed lookups and empty listings have explicit states.
- Realtor setup restores unpublished drafts. Back and Save for later retain progress; Exit explicitly confirms sign-out.
- Tours are scoped to each account on each device; the legacy realtor tour reuses the current tour. Completing a tour on its destination route no longer leaves the transition overlay stuck.
- Calendar import and showing-request wording reflects current behavior. Explicit theme choices count as completed, including the defaults.

## Recovery rollout

Apply `supabase/migrations/20261001061727_client_recovery.sql` before deploying the recovery UI. This commit does not change the live database.

Confirm the Supabase Auth redirect allowlist permits the existing `/auth/callback` URL with recovery query parameters. Recovery supports the emailed magic link and an email OTP when the template includes one. Verify actual email delivery and callback behavior on the deployed web/native targets before release. The isolated verification session does not replace the app's realtor or guest session.

## Validation

- `pnpm --dir expo test`: 99 tests passed, including eight new workflow regression tests.
- `pnpm --dir expo typecheck`: passed.
- Expo web production export: passed.
- Additional mocked component checks passed for booking target/failure/retry behavior, setup draft persistence, account-specific tours and public-link loading/error states.
- Migration executed twice in an isolated PostgreSQL fixture: unauthorized/unverified/anonymous requests denied; correct email/account reset preserves identity, clears lockout and leaves other accounts unchanged. The fixture stubs pgcrypto; the live schema was checked read-only for the required extension/functions.

Device UI and real email delivery have not been exercised end to end. The live Supabase advisory scan also reported pre-existing public security-definer RPC exposure and mutable search paths; this patch does not expand those unrelated functions. Review those separately using [Supabase's RPC advisory guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
