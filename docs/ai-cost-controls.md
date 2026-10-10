# Importer AI reliability and cost controls

Personalized copy stays on the existing GPT-4.1 baseline. No automatic model downgrade, billing-price change, shortened trial, or UI redesign is part of this change.

## Shipped contracts

- A gateway coalesces identical concurrent requests and returns completed results before checking its new-call allowance. Calls and conservative uncached input/output reservations are taken before provider work, not after responses. Explicit output bounds apply to every stage. These reservations are estimates, not invoices; document/image requests reserve a large context envelope and can require a larger approved staging allowance.
- Provider request IDs, known usage, unresolved reservations and stage costs are returned/logged. Timeouts and unreadable response streams retain their reservation. Campaign accounting includes unresolved amounts.
- `OPENAI_API_KEY_STAGING` works without a production key. Deterministic setup routes do not require any AI key. Staging only uses a shared key under the existing explicit opt-in.
- Expired subscriptions retain setup/import access, consistent with the subscription contract; publishing, messaging and other paid boundaries remain authoritative.
- Production anonymous imports require server-owned `app_metadata.importer_test_access === true`. A client-supplied guest flag or user metadata is not authorization. Staging keeps its existing anonymous QA flow. Never mint production tester entitlements from client code.
- Profile output and validated normalizer responses can be reused across requests when durable mode is enabled. Cache identity includes stage, full request content (including source identity, scope, prompt/schema and model), and intent; the database additionally isolates tenant and channel. Valid empty normalizer answers expire after ten minutes. Profile results expire after one day. Failed/incomplete/invalid answers are not durable successes. Intentional copy variation is not stored in the durable success cache.
- Checkpoints store raw provider responses privately and always rerun caller validation. They do not publish an app, overwrite edited copy, or mark unknown inventory complete. Build saves compare the starting `updated_at` to prevent a slow response overwriting a newer website or draft edit.
- Deterministic rendering and provider acquisition precede unknown-markup normalization. Empty shells and markup without property evidence do not buy interpretation. Accepted/empty/unavailable fallbacks are recorded in discovery stages. Known adapters, ownership and coverage rules remain in force.

## Deployment and rollback

1. Apply `20261009074313_importer_ai_checkpoints.sql` to the intended environment using the normal migration review/deployment process. It is additive and does not change billing tables. Its tables are in `private`, have RLS enabled, and are accessible only to the service role; the RPC wrappers are security-invoker and service-role-only.
2. Deploy the functions from the tested commit. Set `AI_DURABLE_REUSE=1` in staging first. Missing migration/RPC access fails before paid inference. Keep separate staging/production provider projects and keys.
3. Staging's durable daily default is $3 (`AI_STAGING_DAILY_USD`). Production has no routine daily cap unless `AI_PRODUCTION_DAILY_USD` is explicitly configured. `AI_ACTOR_DAILY_USD` is optional; choose an abuse threshold from measured legitimate usage rather than a small customer quota. Build and refresh use the realtor ID when one exists, so their actor accounting shares a tenant.
4. Validate changed-source misses, exact-content hits, A→B→A, intentional variations, user-edit conflicts, unknown-charge recovery, and anonymous access on staging. Monitor real accepted listing yield, stage costs, p95 latency and failed imports.
5. Roll back reuse with `AI_DURABLE_REUSE=0`, or restore the previous function bundle. Retain checkpoint/attempt rows for reconciliation. Disabling durable mode also disables its cross-request daily reservations; request-local controls remain. Production rollout remains a separate deployment action.

The database serializes admission across a channel and counts outstanding reservations, including unresolved charges from prior days. A three-minute running lease prevents duplicate workers. An interrupted worker's reservation remains charged to the admission budget even if a later lease is acquired. Explicit uncertain results wait for reconciliation rather than automatically buying the same work again. `import_ai_finish` is idempotent for settled attempts and accepts later settlement of unknown attempts. Reconcile using the stored attempt and provider request ID; do not discard unknown reservations as zero. No reconciliation job guesses provider charges.

Retain unresolved attempts until reconciled. Operational retention should remove expired completed cache rows and settled usage older than the accounting retention period (for example 90 days), while retaining aggregate invoices; no destructive retention job is enabled by this patch. Bump the request fingerprint version in the gateway whenever a semantic validator/extractor change invalidates older cached results.

## Validation

`npm test` in `expo` runs the permanent offline suite. The CI job also installs pinned PGlite 0.5.8 and executes `node --test supabase/tests/ai-checkpoints.test.cjs` against local Postgres semantics, without a production database. It checks tenant separation, budget reservations, free reuse, idempotent settlement, unknown-charge behavior and denied authenticated-role access.

Reader replay compares the unchanged semantic AI input; the new output token bound is checked separately by gateway tests, rather than rewriting capture expectations. New fallback fixtures are labeled synthetic contracts and replay across unrelated domains. Existing live capture expectations are preserved.

## Quality comparison still required

These are code and offline correctness improvements, not proof that a cheaper model is equivalent. Retain the report's 12-pack comparison (baseline, optimized baseline, one cheaper contender), six fresh end-to-end confirmations, and maximum $6 inference reservation. Do not run it on ordinary CI pushes. No provider top-up is automated. Keep current billing prices and trial semantics until explicitly choosing those product terms; no production payment activation is included.
