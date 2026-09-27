# Cloud web deployment

The GitHub Actions workflow **Build and deploy Expo web** installs the locked dependencies, runs the app tests, and exports the static website on GitHub's servers. No local installation is needed.

Pushes affecting the Expo app run build validation only. Production deployment is started manually from Actions.

## One-time setup

1. Create or locate the `my-realtor-app` project in your Expo account and copy its project UUID.
2. Create an Expo access token at https://expo.dev/settings/access-tokens and save it as the repository Actions secret `EXPO_TOKEN`. Never commit the token.
3. Open Actions → Build and deploy Expo web → Run workflow on `main`. Keep deployment enabled, enter the project UUID, and choose an available hosting subdomain. For a previously deployed project, use its existing subdomain.
4. After the run succeeds, use the actual production URL reported by EAS. In Supabase project `xdcqjaodcvnlawqcunrr`, add that URL followed by `/auth/callback` to Authentication → URL Configuration → Redirect URLs. Keep existing redirect entries for the mobile app.
5. Download the `expo-production-config` artifact and commit its `app.json` and `.env.production` into `expo/`. The URL and project ID are public configuration. Alternatively, have Codex commit these exact values once deployment is verified.
6. Optionally save repository Actions variables `EXPO_PROJECT_ID` and `EXPO_HOSTING_SUBDOMAIN` for later builds.

The URL is set before export, so both Booking Link and web authentication use the production site in the first deployment. The workflow checks that welcome and auth callback pages were exported, then checks their HTTP responses after deployment. Successful HTTP checks do not replace a sign-up/password-reset smoke test after the Supabase allowlist is updated.

If deployment fails because the subdomain is unavailable, choose another and rerun. The workflow does not modify Supabase automatically.

References: https://docs.expo.dev/deploy/web/ and https://docs.expo.dev/accounts/programmatic-access/
