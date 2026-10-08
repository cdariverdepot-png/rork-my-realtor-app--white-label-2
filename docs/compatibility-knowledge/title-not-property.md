# title-not-property: a card that names its property only by price

Integrated through the Phase 9 improvement loop (failure registry id `title-not-property`).

## Cause
Collection readers take a listing's title from its card. Some inventory pages put only the price and badges
on the card ("$8,500,000", "Featured", "4 Beds 5 Baths"), with the address elsewhere or nowhere. The detail
reader (`enrichListingFromPage`) then enriched description, photos, facts and office from the property's
own page but always kept the card's title, so the app showed prices as property names. The save-boundary
normalizer cannot repair this: it has no detail page, and it correctly refuses to invent an address.

## Structural pattern
- The card title has no naming text once prices, specs and badge words are removed.
- The listing's own detail page (same host, same path; www/apex tolerated) publishes exactly one structured
  `PostalAddress` (`streetAddress`, `addressLocality`, `addressRegion`, `postalCode`) and/or exactly one `<h1>`
  that reads as a located place (number-led street, or "Place, City, ST", or a ZIP).
Seen first on a Real Geeks site (property-cards architecture, `/property/<mls>/` URLs); the signal is
platform-independent schema.org markup and document structure, not a vendor or domain.

## Strategy
`detailPageTitle(item, html, base)` in `listingDiscovery.ts`, applied in the generic branch of
`enrichListingFromPage`, which the build and the refresh/detail jobs share:
1. Only when the current title names nothing.
2. Only on the listing's own document (a redirect elsewhere is ignored).
3. Prefer the single heading when it reads as a located place and agrees with the single structured street;
   otherwise the structured address; otherwise keep the title.
Several structured addresses (related-home cards), chrome headings and disagreeing headings are not used.

## Evidence
Recorded capture `diagnostics/discovery/realm-partners-idaho.json.gz` (Oct 8 2026): 15 cards titled by price;
13 recorded detail pages with one RealEstateListing `PostalAddress` and one address `<h1>` each
("Cottage Island, Hope, ID 83836", "802 Sandpoint Ave #8404, Sandpoint, ID 83864"); 2 detail pages timed out.
After the repair the 13 are named by their pages; the 2 keep their price (unknown stays unknown).
The live stage gate of the same day had saved all 15 with price titles.

## Tests
`expo/tests/detailPageTitle.test.cjs`: positive synthetic contracts (heading + structured; structured only;
encoded `&amp;`), negative contracts (already named, another document, several addresses, chrome heading,
disagreeing heading, unconfirmed page), and a replay of the recorded capture asserting the 13 names and the
2 untouched prices. The evaluator rule that found it is pinned in `improvementLoop.test.cjs`.

## Performance
One pass over `<script type="application/ld+json">` blocks and `<h1>` elements of a page that is already
being parsed, only for cards whose title names nothing. Corpus replay CPU is unchanged within noise (gate report).

## Coverage
Any architecture whose cards omit the address but whose property pages publish schema.org `PostalAddress` or
an address heading: Real Geeks, many WordPress/IDX themes, Luxury Presence-style sites. It does not name
properties whose detail pages are unreadable or publish no address; those stay as they are and are reported
by the evaluator as temporary outages or needs-review.
