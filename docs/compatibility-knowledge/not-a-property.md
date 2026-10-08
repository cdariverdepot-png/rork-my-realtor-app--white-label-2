# not-a-property: a social post imported as a listing

Integrated through the Phase 9 improvement loop (failure registry id `not-a-property`).

## Cause
A listings page on a held-out AgentFire site embeds an Instagram feed. Each post renders like a property
card (an image, a caption, a link), and the generic card reader accepted one as a listing titled with the
account name ("cameronteam"), linking to instagram.com. Nothing downstream rejected a record whose own URL is
a social post.

## Structural pattern
A record whose `sourceUrl` host is a social-media or video platform (Instagram, Facebook, YouTube, TikTok,
Pinterest, X/Twitter, LinkedIn, Threads, Vimeo). A property's own page is never hosted there.

## Strategy
The save-boundary normalizer (`normalizeListingRecords` in `listingRecords.ts`, shared by build and refresh)
drops such records with reason `not_a_property`, the same treatment as search links and statistics cards.
It is host-based (the record's own URL), so property remarks that mention social media are unaffected.

## Evidence
Level B capture `diagnostics/evaluation/captures/the-cameron-team.json.gz` (held-out site, Oct 8 2026): the
single imported record was `https://www.instagram.com/p/DeAMNvJjKI7/`. After the repair it is reported as
dropped; the site then imports nothing, which is accurate for that recording (its featured page renders its
listings in the browser).

## Tests
`expo/tests/notAProperty.test.cjs`: four social URLs dropped; three negative contracts (property page whose
remarks mention Instagram, a host whose name merely contains "instagram", another IDX host); replay of the capture.

## Performance
One URL host test per record.

## Coverage
Every architecture: feed widgets, social embeds and "follow us" cards on any listings page.
