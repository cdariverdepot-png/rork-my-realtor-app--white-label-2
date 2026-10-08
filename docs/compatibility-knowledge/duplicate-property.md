# duplicate-property: one property published under two listing ids

Integrated through the Phase 9 improvement loop (failure registry id `duplicate-property`).

## Cause
The save-boundary normalizer gave every record one identity per URL (and collapsed URL variants of the same
listing id). MLS feeds sometimes publish the same property twice with different listing ids: a relisting
whose old record is still active on the IDX, or one home entered in two property classes (House and
Commercial; Lots/Land and Commercial). Each id has its own URL, so the app showed the same home twice.

## Structural pattern
Two records with the same named property (decoded title and area), the same price, and either the same
remarks (40+ characters) or the same lead photo. Their URLs differ only by the listing id.

## Strategy
`sameProperty()` / `preferredRecord()` in `listingRecords.ts`, a second pass of `normalizeListingRecords`
(shared by the build and refresh functions, after URL-variant merging). The kept record is the attributed one,
then the one with more photos, then longer remarks, then the newer (larger) listing id; the other is reported
in `dropped` as `duplicate_property`. Never merged: titles that name nothing (a price or card text), records
without a price, different units, same street in another town, and one parcel listed at different prices
(house and land) or with different remarks and photos.

## Evidence
Recorded captures (Oct 8 2026, diagnostics/discovery): Katerina Sayles (iHomefinder-style property cards,
`/homes-for-sale-details/<address>/<id>/26/`): 14035 Densmore Ave N twice (ids 2488935, 2513298) and
320 NE 156th St twice (2577985, 2580829), identical price and remarks. Redman Realty Group (ihomefinder):
10 properties each listed in two classes, e.g. Lot 1 Cator Dr as Lots/Land 219682 and Commercial 219778,
same price and remarks; 7563 Hwy 51 as Commercial and House. Imports drop from 12 to 10 and 100 to 90
records, each property still present once. Three Redman pairs with the same address and price but
different remarks and photos are kept apart.

## Tests
`expo/tests/duplicateProperty.test.cjs`: positive synthetic contracts (relisting; two MLS classes; the
attributed copy wins), six negative contracts, and replays of both recorded captures. The evaluator rule
(same address, same price, same remarks or lead photo) is pinned in `improvementLoop.test.cjs`, including
the Realm Partners parcel listed twice at different prices.

## Performance
One pass over the normalized records with a linear search among kept records (at most 100 per import);
string comparisons only. Corpus replay CPU unchanged within noise.

## Coverage
Any feed or IDX that republishes one property under several listing ids: relistings, dual-class MLS entries,
syndicated duplicates. Records are merged only inside one import (one site); cross-source merging by address
stays out of scope (see `reconcileInventory`).
