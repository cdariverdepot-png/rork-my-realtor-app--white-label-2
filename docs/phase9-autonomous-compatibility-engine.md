# Phase 9: autonomous compatibility engine (report, Oct 8 2026)

Branch `repair/compatibility-engine` (nonproduction integration branch). Nothing was merged into `main`,
no production function was deployed, and no production database row was written in this phase.

## 1. Architecture inventory

| Requirement | Already existed | Added in Phase 9 |
|---|---|---|
| Strategy registry with evidence | `LISTING_EXTRACTION_STRATEGIES` (versioned, evidence, rationale), `meta.compatibility`, obstacle codes, candidates | Unchanged (no new strategy was needed by the four repairs) |
| Offline replay | Immutable compatibility corpus (`tests/fixtures/listing-compatibility`), 25 diagnostic captures (`diagnostics/discovery`), build-pipeline replay harness | Unseen corpus (`diagnostics/evaluation/captures`, 16 held-out sites); `scripts/improve/engine.cjs` replays any capture through discovery **and** the save-boundary normalizer |
| Regression suite | 557 tests, CPU job tests, ownership/scope tests, bundle freshness | Level A guard (`tests/setup/offline-guard.cjs`): no live or paid request can leave a test process; 600 tests now |
| Live testing | Discovery capture workflow (no AI), 25-site stage gate (full builds, OpenAI) | Level B evaluation workflow for unfamiliar sites (no AI, recordings kept); Level B re-check of the affected sites after every integration |
| Failure diagnosis | Gate scorecard (completion, attribution) | `scripts/improve/evaluate.cjs`: structural findings with evidence and a defect kind (code defect, blocked source, outage, unpublished, harness, needs review, requires rendering) |
| Generalization | Reviewed by hand per stage | `scripts/improve/failures.cjs`: registry grouped by symptom across sites and architectures, ranked queue, no retry without new evidence, agent brief with website text fenced as untrusted data |
| Repair / validation / integration | Manual stages and reviewed sets | `scripts/improve/gate.cjs` (protected, run from the base branch), `remember.cjs`, `scorecard.cjs`; workflows `autonomous-improvement`, `rollback-integration`, `level-b-evaluation`; evidence-backed baseline changes (`tests/fixtures/baseline-changes`) |
| AI cost control | None (every call direct to OpenAI; staging shared the production key) | `aiGateway.ts` for all 6 OpenAI call sites; `ai-budget.cjs`, `diagnostics/ai-budget.json`, `diagnostics/ai-ledger.jsonl` |

## 2. The loop

`select` (Level A, free) → evaluate the recorded corpus → update `diagnostics/improvement/failures.json` → pick
the top code defect with new evidence. `repair` → a coding agent on `improve/<failure>-<run>` from a written brief
(read/edit and run the offline suite only; no web, no push, no secrets but its own key). `gate` → the copy of
the gate on the base branch judges the candidate: change policy (engine, test and knowledge paths only;
fixtures, captures, gate, workflows, budget and agent rules immutable; no removed tests, assertions or
REVIEWED_* edits), a new test naming the failure, a knowledge record, bundle check, the full offline suite, and
a base-vs-candidate comparison over the whole corpus (target down; no other finding up on any site; no lost,
market, re-owned or degraded record; CPU within 20%). Accepted candidates are merged with `--no-ff` (one
revertable commit); rejected ones are kept with their report. `verify` → Level B re-read of the affected sites.
`rollback-integration` reverts one integration merge and reopens its failure.

## 3. Cost controls

- Offline (A): `AI_MODE=offline` plus the guard; the full suite made no network or AI request.
- Live extraction (B): discovery engine run directly, no AI; $0 by construction.
- Real AI (C) / full builds (D): `ai-budget.cjs plan` refuses a campaign over its level limit ($0.50 / $2.00),
  over the daily limit ($3.00), over the site cap, or (D) without a written justification; the meter alerts at
  80% and stops before a site would cross a hard limit; spend is appended to the ledger. Raising a limit
  requires an `authorization` block.
- Staging functions run under `DEPLOYMENT_CHANNEL = "staging"`: they use `OPENAI_API_KEY_STAGING` only (the
  production key only if `AI_STAGING_ALLOW_SHARED_KEY=1`), with 4 calls / $0.25 per request.
- Production: same key, model and behaviour; every call is metered (`aiUsage` in responses, `[ai]` log lines);
  identical completed requests inside one import are reused.
- Phase 9 spent $0.00 of OpenAI (ledger has no entries). Coding-agent cost is this session's usage, which is
  not visible from the repository.

## 4. Demonstrated repairs (all on recorded public sites)

| Failure | Found by | Repair | Gate (CI run) | Corpus effect |
|---|---|---|---|---|
| title-not-property | Level A, Realm Partners | `detailPageTitle()` in the detail reader | rejected 37811644720 (gate harness defect), accepted 37816050638 → `befdc8f` | 13 → 0 price titles; on the **held-out** Real Geeks site captured afterwards, 70 of 100 price titles fixed |
| duplicate-property | Level A, Katerina Sayles + Redman | second pass in `normalizeListingRecords` | accepted 37831507039 → `e29f8ef` | 13 → 0 (12 regression + 1 held-out) |
| mirrored-listing | Level B, held-out Real Geeks site | mirrored-path merge in the normalizer | accepted 37832691108 → `0dbaa26` | 100 → 50 records, all named, none thin |
| not-a-property | Level B, held-out AgentFire site | social hosts dropped at the save boundary | accepted 37833272504 → `d1f9e19` | Instagram post no longer imported |

Each has a knowledge record in `docs/compatibility-knowledge/` and tests naming it. Live Level B re-checks
after integration: Realm 15 records, all named; Redman 90; Chatman 50; Katerina blocked from the runner (403).

## 5. Scorecard (pre-Phase-9 engine `99a1cc5` vs now, same evaluator, same recordings)

| | Regression (25) | Held-out (16) |
|---|---|---|
| Records | 214 → 202 (12 duplicates removed) | 205 → 154 (50 mirrors, 1 social post) |
| Records named by their property | 191 → 192 of 202 | 103 → 153 of 154 |
| Price/card titles (code defect) | 13 → 0 | 101 → 0 |
| Duplicate / mirrored records | 12 → 0 | 50 → 0 |
| Thin records with details on the page | 10 → 10 | 33 → 3 |
| Sites importing without a code defect | 6 → 9 of 11 | 5 → 6 of 7 |
| Attributed own / featured | 27 / 67 → 27 / 67 | 0 / 97 → 0 / 77 |

Ownership did not change for any surviving record (gate rule). Full replay CPU 5251 → 4771 ms (regression).

## 6. Unresolved and human review

- Open code defect: `detail-incomplete` (Houses of KC, Mount Snow, Showcase IDX site; 13 records). Causes differ per site; next in the queue.
- Needs a rendered check (cannot be judged by Level A/B): 8 sites, including 5 of 16 held-out (Sierra, BoldTrail, Lofty, Howard Hanna, a Home Junction AgentFire site), and Ylopo (no obstacle reported).
- Blocked from automated readers: Century 21, Redfin, RE/MAX, an iFoundAgent site (403/405); Katerina Sayles from GitHub runners.
- Needs review: 9 sites importing nothing via navigation-only pages (several are correct scope exclusions from earlier stages); 8 Redman land records whose titles are road names only ("ON REED RD"); 108 regression and 77 held-out records unattributed (no office signal published).
- Gate defects found and fixed during the demonstration: test-summary parsing on Node 24, duplicate groups truncated to examples, results lost to a push race. A latent risk in the title repair (office PostalAddress) was found by review and fixed as a reviewed change (`0675a9e`) — a hardening with no corpus decrease cannot pass the autonomous gate by design.

## 7. Dependencies and switches

- **Coding agent in CI** (updated at final integration): the repair step uses OpenAI Codex
  (`openai/codex-action@v1`, workspace-write sandbox without network, sudo dropped, cannot push) on the
  existing OpenAI account; no Anthropic key is needed. It stays **disabled** until the repository variable
  `AUTONOMOUS_REPAIR=enabled` is set, and it also needs the GitHub Actions secret `OPENAI_API_KEY`. Until then
  the loop evaluates, gates, integrates candidate branches and verifies, but writes no code unattended.
  The Codex step has not executed yet.
- **Staging AI**: staging uses `OPENAI_API_KEY_STAGING` when present; the final release gate set
  `AI_STAGING_ALLOW_SHARED_KEY=1` (via `staging-ai: shared-key` in `diagnostics/stage-gate.txt`) so staging
  uses the existing key within its per-request limits (4 calls, $0.25; the last call is reserved for the profile).
- **Renderer in Level B**: browser-drawn inventories need the staging renderer to be evaluated.

## 8. Release readiness

Not ready to promote to `main`. The listing-side engine is measurably more accurate on both the known and the
held-out sites with no ownership regressions, but (a) the last full end-to-end gate (Level D) predates these
changes and was blocked by OpenAI credit, (b) 5 of 16 held-out sites need a rendered check, and (c) the Apple
subscription cutover remains held. The next justified step is one budgeted Level D gate (needs credit or a
staging key, and a justification line) followed by your review.

## 9. Final integration (Oct 8 2026)

- `repair/compatibility-engine` merged into `main` (merge `3395ca8`, `[skip ci]` so the push-triggered
  production deploys did not run). The repair branch is kept as the recovery reference.
- Validation: full suite 602/602 and type check (CI, Gate A); release gate 37840376601 (12 sites on staging:
  11 reached review, RE/MAX stopped with its 403 reason, none stranded); it found one gap (detail jobs kept
  price titles), fixed in `dc66234` and rechecked by 37843454766 (3/3, all titles named); the deployed preview
  was checked end to end by 37846354461 (2/2 reached review, calls went to the staging functions).
  OpenAI spend metered for these runs: $0.13 + $0.04 + $0.03 (some sites' usage is not captured by the
  harness, so the true figure is slightly higher).
- Staging Edge Functions (`analyze-realtor-build-staging`, `refresh-listings-staging`) run the merged code,
  with `AI_STAGING_ALLOW_SHARED_KEY=1`. Production Edge Functions and the production web site were not
  redeployed and still run the code from before Phase 1.
- Development preview (web, staging importer): deployment `https://cdariverdepot-my-realtor--dkx12pzmez.expo.app`
  (alias `https://cdariverdepot-my-realtor--preview.expo.app`), verified to serve main `5c70bca`;
  record and QR code in `diagnostics/preview-deployed.json` and `diagnostics/preview-qr.png`.
- Rork / Expo dev previews of `main` call the staging importer automatically (`__DEV__`); release builds
  still call production.
- Note: the existing workflows `deploy-functions` and `deploy-web` still deploy to production on the next push
  to `main` that touches `supabase/functions/**` or `expo/**` (including Rork syncs). Such a push would put
  this importer and client into production.
- Known gaps: duplicates whose shared remarks arrive only in later detail jobs are not merged on the
  production job-split path (Redman: 13 pairs live; merged offline); Real Geeks served the Supabase edge a
  script-rendered page (Chatman: 0 listings live, 50 from GitHub runners); 5 of 16 held-out sites need a
  rendered check; Century 21, Redfin, RE/MAX and one iFoundAgent site block automated readers.
