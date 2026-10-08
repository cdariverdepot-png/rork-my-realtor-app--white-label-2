# mirrored-listing: one listing published on two hosts of the same site

Integrated through the Phase 9 improvement loop (failure registry id `mirrored-listing`).

## Cause
Website platforms often serve an agent's IDX on two hosts at once: the agent's own domain and the
platform's subdomain for that agent (Real Geeks: `www.<agent>.com/property/<id>/` and
`<agent>.realgeeks.com/property/<id>/`). The site links to both. Discovery read both collections, and the
normalizer keyed records by host and path, so every listing was imported twice. The subdomain copies also
lacked readable details in the recording (their structured data names the agent-domain URL), so they showed
a price ("$594,900 ▼") as the title and no remarks.

## Structural pattern
Two records whose URL paths are identical, contain a listing-id segment (5+ digits), and carry the same
price, on different hosts.

## Strategy
`mirroredListing()` / `mergeMirrors()` in `listingRecords.ts`, in the second pass of
`normalizeListingRecords` (shared by build and refresh), before the duplicate-property rule. The copy that
names its property and has remarks keeps its URL, identity and attribution (attribution is never borrowed
from the other copy); the larger photo set and longer remarks of the same listing are kept. The other copy
is reported in `dropped` as `mirrored_listing`.

## Evidence
Level B capture `diagnostics/evaluation/captures/chatman-realty-group.json.gz` (held-out site, Oct 8 2026):
100 records = 50 listings x 2 hosts; the site links to its Real Geeks subdomain from every page (so this was
not a scope escape — the evaluator's OFFSITE_UNLINKED rule correctly did not fire). After the repair:
50 records, each named, with remarks; the evaluator's 30 price titles and 30 thin records on that site
disappear with the mirror copies.

## Tests
`expo/tests/mirroredListing.test.cjs`: positive synthetic contract (named copy keeps URL and attribution,
larger gallery kept), four negative contracts (different ids, different prices, no id in the path, one host),
and a replay of the recorded capture (50 records, one per listing id, every title names its property).

## Performance
A linear scan of kept records per record (at most 100), URL parsing only. Corpus CPU unchanged within noise.

## Coverage
Any platform that serves the same listing ids on an agent domain and a platform subdomain (Real Geeks and
similar hosted IDX). Different hosts with different paths are not merged; cross-site syndication with other
URL shapes is out of scope.
