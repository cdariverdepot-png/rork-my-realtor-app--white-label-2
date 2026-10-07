# Subscriptions — Apple App Store model

Apple handles purchase, renewal, cancellation, billing retry, payment-method problems and subscription management through StoreKit and the App Store. The app reads and verifies entitlement; the backend enforces it only for paid service actions. There is no private checkout, card entry or payment provider anywhere in the app or backend.

## Product rule

Subscription inactive = paid service actions unavailable. Subscription inactive ≠ user locked out.

- Never gated by billing: sign-in, navigation, onboarding, client profile setup, reading listings, clients, messages, documents, favorites, settings, account and subscription information, data export.
- Paid service actions (refused server-side while inactive): publishing the live design (`brand.v2`), new chat messages in either direction (history and read receipts stay writable), push delivery, new or re-established client connections, public lead capture and client showing requests.
- Existing client relationships and data are never removed or hidden because of billing state.
- Entitlement lookups that fail are "unknown", never "inactive". Unknown never affects access; paid actions wait until the server can verify.

## Model — one lifecycle, owned by Apple

- Products: $49/month and $490/year auto-renewable subscriptions. The 7-day free trial is Apple's introductory offer on those products; Apple decides eligibility, so a previous subscriber never gets another trial from local data.
- Apple introductory (free-trial) period: paid service actions on, up to 3 connected (authenticated) clients. Contacts, pending invitations and previews do not count.
- Paid period, including Apple's billing grace period: paid service actions on, unlimited connected clients.
- Never subscribed, expired, canceled and ended, refunded, or billing retry beyond grace: paid actions off; access, data, clients, relationships and history unchanged. Resubscribing or restoring through Apple restores paid actions immediately.
- There is no local trial clock or second countdown in Supabase.

## Server state (`private.realtor_entitlements`)

A row exists only after a verified Apple transaction: original transaction ID (unique: one Apple subscription per realtor), product, environment, `apple_expires_at`, `apple_in_trial` (current period is the introductory free trial), `apple_revoked_at`, `apple_auto_renew`, `apple_billing_issue`, `apple_signed_at`. Older signed data never overwrites newer. Only the service role can write it (`apple_apply`).

Account & Billing shows the verified Apple state: "7-day free trial · N days remaining · X of 3 clients connected", "Subscription active", "Billing retry · grace period until …", "Canceled — active until …", and when inactive "Start your 7-day free trial", "Expired", "Canceled", "Refunded", or Apple billing retry. A billing problem is shown only when Apple reports billing retry. Clients never receive billing details — only whether an action is available and the realtor's published business contact.

## Edge Function `apple-subscription`

- App sync (`{ action: "sync", signedTransactions }`, realtor JWT): verifies each StoreKit 2 JWS, requires the configured bundle ID, product IDs and environment, and requires `appAccountToken` (set to the realtor ID at purchase) to match the signed-in realtor. Used after purchase and for Restore Purchases.
- App Store Server Notifications V2 (`{ signedPayload }`): verifies the notification, its transaction and renewal info; applies expiry, grace period, auto-renew and billing-retry state.
- Verification (`appleJws.ts`, WebCrypto only): three-certificate x5c chain pinned to Apple Root CA - G3 (SHA-256 `63343abf…3e9179`, from support.apple.com/en-us/126047), each certificate signed by the next, valid at the signing date, Apple marker extensions on leaf and intermediate, then the ES256 signature.
- Returns 503 until configured. It never invents product IDs.

## App

- `lib/storekit.ios.ts` (expo-iap) purchases with `appAccountToken`, restores, opens Apple's subscription management, and finishes a transaction only after the server verified it. `lib/storekit.ts` is the web/Android stub.
- Account & Billing (`/admin/plans`) shows the verified Apple status (see above), Subscribe monthly/annually with App Store prices, Restore Purchases and Manage Subscription.
- Blocked actions explain the specific limitation in place and offer Account & Billing; nothing redirects or covers the app.

## App Store Connect configuration still required

1. Create an auto-renewable subscription group with a monthly ($49) and annual ($490) product, and add a 7-day free-trial introductory offer to each. This is the only trial.
2. Set build env `EXPO_PUBLIC_IOS_SUBSCRIPTION_MONTHLY_ID` and `EXPO_PUBLIC_IOS_SUBSCRIPTION_ANNUAL_ID` to those product IDs and make a new iOS build (expo-iap is native; it does not run in Expo Go).
3. Set Supabase function secrets: `APPLE_BUNDLE_ID=app.myrealtor`, `APPLE_SUBSCRIPTION_PRODUCT_IDS=<monthly>,<annual>`, optionally `APPLE_ENVIRONMENTS` (default `Production,Sandbox`).
4. In App Store Connect → App Information → App Store Server Notifications, set Version 2 Production and Sandbox URLs to `https://xdcqjaodcvnlawqcunrr.supabase.co/functions/v1/apple-subscription`.
5. Test in Sandbox/TestFlight: purchase, restore, renewal, cancellation, billing retry and refund.

## Validation

- `supabase/tests/subscriptions.test.cjs` — lifecycle on an isolated baseline: no local trial, Apple trial → paid, trial → expired, paid → expired, billing retry and grace, cancellation at period end, refund, resubscribe, 3-client trial limit, unlimited paid clients, concurrency, disconnection, stale data, cross-account isolation.
- `supabase/tests/subscriptions.live-replica.test.cjs` — the migrations applied to a replica of the captured production schema and function bodies (`live-replica-baseline.sql`), proving service actions are restricted and access never is.
- `expo/tests/appleSubscription.test.cjs` — JWS verification against a generated (synthetic) chain, root pinning, tampering, marker extensions, snapshots, and the endpoint's auth and account binding.
- `expo/tests/subscriptions.test.cjs` — no global gate, unknown ≠ inactive, accurate notice copy, no private payment path, StoreKit only in the iOS bundle.
