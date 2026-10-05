# Importer compatibility engine

The shared discovery engine selects versioned extraction strategies by observable architecture. Customer domains are examples in the regression corpus, never extraction switches. Onboarding and refresh continue using the same shared engine.

## Runtime contract

`supabase/functions/analyze-realtor-build/listingDiscovery.ts` contains `LISTING_EXTRACTION_STRATEGIES`. Each entry declares an ID, version, observable evidence, rationale, matching predicate, reader, and extraction phase. Platform readers run first to preserve their scope and status exclusions. Empty or failed readers fall through; schema data, inert JSON and property cards provide framework-independent fallbacks. Metadata is last.

`meta.compatibility` records a bounded observation for each discovered page: response versus rendered DOM, detected interfaces, navigation patterns, attempted strategies, record counts, and whether the page matched a known pattern, was navigation-only, was excluded as market inventory, needed a new strategy, or relied on an external normalizer. Matching a vendor name alone is not extraction success. Existing meta persistence/response paths carry the new report without a database migration.

The dsIDXpress reader now recognizes its actual property fields on unbranded installations. Empty `root`, `app`, and `__next` application shells can use the existing optional rendering callback. If no renderer is configured, they report `requires-rendering` instead of claiming a successful empty import. This does not provision a renderer or imply support for every React/Vue/Next/Nuxt serialization format.

A published SHA-1 cookie interstitial (nonce, difficulty, and `cf_pow` / `cf_pass` assignments) is solved once and the same response is reread with that cookie. Difficulty above 5 is not brute-forced. Lofty/Chime shells are recognized by `chimeroi` / `chime.me` script hosts or `sitePageJSON` / `pageJsonAndGlobalData`, plus a published `listingSource`. The request keeps that source and the client's own split: `featureListingName` is the scope after the leading `digit+`, and `listingType` is `featured-listing` unless the label is sold or a single-property promotion. An unscoped `all listings` source is the market and is not imported. `public-json` reads street, price, photos (`previewPicture` or pipe-delimited `listingPictures`), and status. The same markers apply on any customer domain. A `Robot Validate` or other challenge document is `requires-rendering` with no invented listings — reCAPTCHA is not solved. A puzzle page that does not unlock is `script-gate`, not `needs-strategy`.

`meta.inventoryStatus` is separate from `meta.outcome` and from `meta.enrichment`. A complete collection stays `inventory_complete` when an optional detail page fails. `enrichAll` schedules every discovered listing and does not spend the collection page budget; callers that omit it keep the previous detail cap. `meta.obstacles` uses distinct codes (`script_gate`, `requires_rendering`, `captcha_required`, `rate_limited`, `authentication_required`, `access_denied`, `temporarily_unavailable`, `render_failed`). A blocked import keeps `meta.resume` (seeds and pending URLs only — never cookies or tokens). `meta.candidates` ranks platform families from structural evidence before a strategy wins. Rendering is an escalation: after a shell renders, same-origin JSON and published search URLs are preferred over card scraping. HTTP 429 and 502/503/504 are retried with bounded backoff. A user-authorized `sessionCookie` is sent and never written into reports. reCAPTCHA is not solved. The Edge bundle's discovery IIFE is this file with `export` removed. A regression test fails if that copy drifts. Production discovery passes `enrichAll: true`.

## Permanent learning loop

Use Node 24 and run from `expo`:

```sh
npm run audit:compatibility
npm run audit:compatibility -- --url https://public-agent.example/ --name "New example"
npm run test:compatibility
npm test
```

The audit captures every successfully priced and photographed active collection it tests, preserving decoded public responses, final URLs, fragment requests, failed requests, extraction evidence and exact expected normalized records. It writes a new immutable JSON case in `tests/fixtures/listing-compatibility/` after verifying offline replay and replay on an unfamiliar customer hostname. `--record-dir PATH` selects a different output directory. Existing fixtures are never overwritten. Partial inventories remain explicitly partial: a successful showcase is not proof of complete inventory.

Every saved JSON case is automatically discovered by the offline test runner. It checks all normalized fields, photos, status, coverage, outcome, expected count, issues and winning strategy IDs. Unrecorded requests fail even if discovery catches the fetch exception. The runner never fetches a live website. Cases declaring `rehostOrigin` are also replayed on two unfamiliar domains; provider transport hosts retain their actual protocol contract. The registry coverage test rejects a strategy with no successful permanent case.

Live audit expectations are observations, not independently verified truth. Inspect the property identities, scope, fields and rationale before committing a new capture; a priced, photographed result can still contain an extraction error. Correct those assertions with evidence instead of accepting output merely because replay agrees with itself. If a strategy changes, add the new case and preserve all older cases. Explain intentional baseline corrections in review.

This is an executable, growing compatibility library with an automated audit capture workflow. Runtime imports emit evidence; they do not autonomously write source code or commit test fixtures to the repository. Run the capture audit for each newly solved production example to promote it into permanent regression coverage. Novel architectures still require a reviewed reader or transport implementation. An external normalizer result is explicitly marked and is not promoted to a reusable deterministic strategy merely because it returned records.

## Adding an architecture

1. Inspect the compatibility report and captured responses. Identify the actual data contract, request scope, rendering requirements, navigation and property identity rules.
2. Reuse an existing reader if those contracts match. Prefer extending a structural signature over adding a customer hostname branch. Provider API host checks remain appropriate where required by a transport or trust boundary.
3. For a new reader, add an executable registry entry with evidence and rationale. Increment its version when its contract changes. Keep credentials out of diagnostic reports.
4. Add a successful replay, a comparable architecture/hostname case, and negative cases for misleading markup, inactive/restricted inventory, scope escape, or unrelated properties as applicable. Synthetic cases must be labeled `synthetic-contract`, not described as live site captures.
5. Run the full suite. Both frontend and Edge Function deployment workflows now depend on the reusable regression workflow. Configure repository branch protection to require its check if merges must also be blocked; that repository setting cannot be shipped in a ZIP.

## Captures and limitations

The capture helper never serializes request headers or cookies and replaces the known Kestrel activation token in captured JSON configuration. It is not a universal personal-data scrubber: captured public pages can contain business contact details, tracking markup, and public configuration. Keep captures limited to public sources and inspect them before sharing the repository.

The supplied six historical sites were rechecked on October 4, 2026 (Pacific time): Cindy Carlson 9 active listings; GetHomeNow 94; North Idaho Freedom 5; Christine Matheny 13; McKenzie Realty 1. Every record counted had a price and image URL. Those five live response captures are included, alongside portable synthetic contracts. Image URLs were extracted, not independently fetched during this audit. Detail completeness and partial/showcase coverage remain represented in the captured result.

Greg Volland returned HTTP 403 on this run, so no current successful live capture is claimed. The existing AgentFire/dsIDXpress tests and a new unbranded dsIDXpress replay preserve its extraction contract. The dated audit in `docs/listing-import-six-site-audit.md` is historical evidence, not verification of today's remote availability.

No production deployment or full Expo application build is included in this change.
