# Subscription implementation — test only

The approved standard offer is $49/month or $490/year, billed annually. Both include identical standard features and unlimited connected clients. Annual billing charges $490 upfront; $40.83/month is an equivalent, not monthly installments. Annual savings are $98, or two monthly payments. Approved amounts live in `expo/constants/subscriptionPricing.ts`; the server rejects provider prices that differ.

The custom service has a separate $499 setup/build-and-launch fee and requires the same ongoing subscription. Hosting, standard platform updates and bug fixes are included. Additional custom design and features are separately quoted. Publication is directly through the realtor's own Apple Developer account; membership is separate. Appropriate developer access, delivery details and support response commitments must be agreed for each project. Store approval is not guaranteed. The existing inquiry email drafts a request; it does not charge or automate app publication.

## Server behavior

Postgres owns the connection ledger, using the existing `(realtor_id, client_id)` account identity. Authentication, entitlement checks and activation execute in a locked transaction. Evaluation has all standard features for 7 days from the server-owned trial start, with up to three active connected accounts and no payment details required to start. After day 7, an active $49/month or $490/year subscription is required regardless of connected-client count. Contacts, pending invitations and previews do not consume seats. Failed authentication does not activate a relationship. A capacity refusal keeps a newly created account so the same invitation and account can retry login later.

Disconnection preserves the relationship and records, releases its seat, and revokes private reads/writes, booking and notification eligibility. Reconnection reuses the account and requires current entitlement. Client identity remains resumable when service is inactive, but identity alone grants no private access.

Verified provider invoices establish paid-through dates. Checkout return parameters never establish paid access. Webhooks verify the signature on the raw body, accept only test-mode events, retrieve canonical subscription state, deduplicate events and use revision checks to retry stale reconciliations. Refresh also discovers a completed subscription if its webhook is delayed. Checkout reservations, idempotency keys and existing-subscription checks prevent accidental duplicate subscriptions.

Cancellation schedules period-end cancellation and can be reversed before it takes effect. Already paid access continues through its verified date. `ever_paid` persists; expiry never returns former subscribers to evaluation. Payment recovery uses the provider portal, separately from cancellation. The implementation offers an explicit `paid_period` policy: retain already paid service, with no additional grace period. Checkout remains disabled until that policy is explicitly configured.

Inactivity gates ordinary server records, listing imports/refresh, builds, booking, pushes and authenticated storage. The app covers cached ordinary pages while retaining account/billing, password, sign-out and export actions. Clients see only availability and the realtor's published business contact, not billing details. Reactivation restores previously active relationships; individually disconnected relationships stay disconnected. No retention timer or destructive cleanup is introduced.

The export is scoped to the verified owner and includes saved KV records (designs, listings, contacts, messages, documents metadata/references, appointments, favorites), preserved relationships and listing source definitions. Authentication records, password derivatives and source headers are excluded. It is JSON metadata, not a backup of uploaded binary files. Draft cloud build inputs are included. Published images remain publicly accessible under the app's pre-existing public storage design; subscription gating does not claim to revoke downloaded copies or public media URLs.

## Remaining test-provider configuration

Use a separate Supabase staging project with the existing schema and this migration. Do not apply test fixtures to staging or production. Migration preflight stops if an existing account has more than three authenticated connections; reconcile legitimate paid entitlements before applying, without silently disconnecting clients or granting unpaid unlimited access.

Configure server secrets in staging only:

```dotenv
BILLING_TEST_ENABLED=true
STRIPE_TEST_SECRET_KEY=sk_test_...
STRIPE_TEST_WEBHOOK_SECRET=whsec_...
STRIPE_TEST_MONTH_PRICE_ID=price_...
STRIPE_TEST_YEAR_PRICE_ID=price_...
BILLING_WEB_ORIGIN=https://your-staging-web-origin.example
BILLING_PAYMENT_FAILURE_POLICY=paid_period
```

Create two **Stripe test-mode** recurring USD prices: 4900 cents every month and 49000 cents every year, interval count 1. Their IDs must be different. Provider keys and IDs stay on the server. Do not put secrets in Expo configuration. Configure the test billing portal with payment method recovery and subscription management. Only the approved monthly/annual prices should be selectable. Portal cancellation must be at period end. Tax handling, refund terms and support response commitments require business decisions before public activation.

Deploy `billing` to staging with JWT gateway verification disabled (`supabase/config.toml`); the handler itself verifies user JWT ownership, while Stripe deliveries require webhook signatures. Register the staging `/functions/v1/billing` endpoint for:

- `checkout.session.completed`
- `customer.subscription.created`, `.updated`, `.deleted`
- `invoice.paid`, `invoice.payment_failed`

Use the pinned API version `2025-06-30.basil`. Verify a real test checkout with Stripe test cards, invoice payment, duplicate delivery, delayed webhook, cancellation/resume, expiry and recovery in staging. Current automated provider tests use fixtures; no payment has been processed against Stripe yet because test credentials and staging have not been supplied.

## Native and production activation

Native purchases and external billing links are disabled. Apple and Google rules differ by storefront and program; an external web checkout is not assumed to be permitted in every native app. A compliant StoreKit/Play Billing integration or approved storefront-specific external purchase program, including verified server notifications and entitlement mapping, is still required before native purchases can be enabled.

Policy references checked during implementation:

- [Apple App Review Guidelines, payment rules](https://developer.apple.com/app-store/review/guidelines/#payments)
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)
- [Google Play billing policy guidance](https://support.google.com/googleplay/android-developer/answer/10281818)
- [Stripe webhook handling](https://docs.stripe.com/webhooks)
- [Stripe cancellation](https://docs.stripe.com/billing/subscriptions/cancel)
- [Stripe invoice object for the pinned API](https://docs.stripe.com/api/invoices/object?api-version=2025-06-30.basil)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

Before production: approve retention duration (no duration is promised here), recovery policy, refund/tax/support terms and native storefront strategy; complete staging tests; review a deliberate production-provider implementation (the current handler rejects live keys/events); coordinate the migration before the new app/Edge gates; then deploy only with explicit production authorization. Do not merge this branch into the current auto-deploying `main` during test implementation.

## Validation

`expo/tests/subscriptions.test.cjs` tests approved prices, equivalent access, signature verification, unpaid/prorated invoices, network refusal, stable identity, working custom inquiry, owner isolation, duplicate checkout, delayed reconciliation and canonical event handling. Existing app tests also check that inactive users cannot bypass imports using guest payloads or the listing scheduler.

`supabase/tests/subscriptions.test.cjs` executes the production migration against an isolated baseline fixture. Locally it uses PostgreSQL via PGlite; CI uses a separate PostgreSQL 17 server and distinct concurrent connections. It covers the evaluation allowance, authentication, duplicates, disconnect/reconnect, saved history, paid plans, cancellation/resume, expiry, recovery, reactivation, export and cross-account isolation. The fixture intentionally simplifies pre-existing credential hashing and is never a production migration.

The branch CI builds/type-checks Expo and checks the Deno billing handler. It does not deploy to production and needs no production secrets.
