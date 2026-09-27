# Cloud web deployment

Production: https://cdariverdepot-my-realtor.expo.app

Expo account: `jtaylor537`  
Project: `my-realtor-app`  
Project ID: `b715c6fd-84ee-4f15-86c4-eba1467262c4`

The project ID is committed in `expo/app.json`, and `expo/.env.production` sets the Booking Link and web authentication origin. Native authentication keeps its existing GitHub Pages callback.

## Publish an update

Open GitHub Actions → **Build and deploy Expo web** → **Run workflow** on `main`. Keep deployment enabled and use the existing `cdariverdepot-my-realtor` subdomain. The project ID input can be left blank because it is already committed.

The workflow installs the locked dependencies, runs the app tests, exports all static pages, and deploys to production. Everything runs on GitHub's servers. The saved Actions secret `EXPO_TOKEN` authenticates with Expo; never commit its value.

Ordinary app pushes run build validation only. The **Check Expo hosting** workflow can also be run manually to verify the root, welcome, and callback URLs. Checks retry for propagation delays observed on the first deployment.

## Supabase authentication

In Supabase project `xdcqjaodcvnlawqcunrr`, open Authentication → URL Configuration → Redirect URLs and add:

```text
https://cdariverdepot-my-realtor.expo.app/auth/callback
```

Keep existing redirect entries for the mobile app. This setting must be saved in Supabase; deploying the website does not configure it.

After saving, verify sign-up confirmation, password recovery, and enabled social sign-in from the production site. HTTP route checks do not verify those account flows.

References: https://docs.expo.dev/deploy/web/ and https://docs.expo.dev/accounts/programmatic-access/
