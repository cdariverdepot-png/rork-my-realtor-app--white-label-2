# Universal listing sources

Onboarding and Add listings use one URL field: **Bring in your listings** / **Paste the page where your listings live. We’ll figure out the rest.** Provider selectors, listing-file choices and manual listing creation are removed from this flow. Existing profile/contact uploads and backend file parsing remain available to existing callers.

The existing discovery crawler follows observed links, embeds, filtered search forms, redirects, hydration and public listing fragments across domains. It detects the provider internally. For an individual property, it connects an observed public agent inventory only when that inventory contains the original property. Otherwise it asks for a public profile or listings page. It never asks for MLS credentials or bypasses login, CAPTCHA, robots restrictions or blocked access.

Each verified realtor stores persistent sources in their scoped listing-sources.v1 row. Inventory remains in the existing scoped listings.v2 collection. The worker reconciles new homes, details, prices, photos and explicit statuses while preserving personal notes and visibility. Source metadata is separate from collection/editor writes. Writes reread current data and use revision checks.

Public source inventories are due every two hours. Legacy individual listing URLs are due every two hours for active/pending/contingent/unconfirmed homes and daily for sold/off-market homes. Failures back off and retain the last reliable values. Only two complete snapshots at least two hours apart archive a disappeared listing. Partial, blocked, paginated-incomplete or unreadable pages never archive inventory. Reappearing homes are restored. Sold status requires an explicit property-specific label.

Deterministic structured-data extraction runs first. Where necessary, the existing OpenAI service can select observed destinations and normalize up to two public inventory pages. Values must have observed evidence; missing fields stay blank. Related homes and general market results are excluded. No stock listing photos are invented.

## Deployment and activation

Deploy the updated analyze-realtor-build bundle and refresh-listings function. refresh-listings is deployed with --no-verify-jwt because it verifies account ownership or a private scheduler token itself. Set LISTING_SYNC_TOKEN as an Edge secret. Add matching Vault secrets listing_sync_token and listing_sync_project_url, then run supabase/sql/refresh_listings_cron.sql. Its five-minute dispatcher selects due sources and legacy URL collections; it does not scrape every five minutes. Check cron.job and net._http_response using the verification queries in that SQL file.

The production project currently has no listing-sync job enabled. This change has not been deployed or activated in production. Never expose the scheduler token in the app.

## Validation and limits

175 automated tests pass, including the real handler with mocked database/network, account scope, source discovery, status evidence, recurring inventory reconciliation, failure recovery, concurrent editor changes, archive/restore and AI evidence validation. App and Edge TypeScript checks pass. Expo web export succeeds with existing server-render warnings. The dispatcher selection query was checked read-only against the current production schema.

An earlier live discovery check from Cindy Carlson’s website reached the external public Flexmls office collection and found nine homes. The new source worker, scheduler and AI normalization still require staging/live deployment validation. Provider detection does not guarantee every provider permits or exposes public scraping: sites requiring sign-in, browser-only interaction or restricted access receive an actionable request for a public listings/profile link.
