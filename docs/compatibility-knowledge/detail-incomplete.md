# detail-incomplete: the detail page publishes remarks or photos the record lacks

Repaired at final integration (reviewed change; failure registry id `detail-incomplete`).

## Causes (three structural, two evaluator)
1. **Gallery named by a component hook.** Component-library pages name the gallery in `data-testid`
   (`carousel-container`) or `data-slot`, not in a class or id, so the gallery reader found no gallery and the
   record kept its one card photo. `roleContainers()` now reads those hooks too (same role and exclusion rules).
2. **Numbered street in the URL slug.** A card that names nothing ("New Listing - 14 minutes on site …") is
   matched to its own detail page by the street number and name in its URL slug. Numbered streets
   ("1270-42nd-Avenue", "730-47TH-Street") were not accepted as a street name, so the page was never used.
3. **Structured summary standing in for the page.** A JSON-LD record with a one-line summary
   ("Property for lease at <address>…") and one cover photo replaced the page's remarks and gallery. Structured
   remarks now win only when they are full (200+ characters) or at least as long as the page's own remarks; a
   structured record with one photo no longer suppresses the page gallery.
4. Evaluator: images repeated on other properties' detail pages (site decoration) were counted as photos the
   record lacked; a listing whose MLS record has no photos was reported as thin.
5. Evaluator: grid addresses ("1280 E 4340 N") were not recognized as property names.

## Evidence (recorded captures)
Houses of Kansas City (regression + Oct 8 recapture): 17 records 1 → 5 photos. Skilled Real Estate (Showcase
IDX): 2 records gain remarks and 4 photos; Georgina Jacobson: 1 record gains remarks. Tom Toole (Sierra,
rendered recapture): 30 records gain remarks and galleries. Mount Snow: 2 records have no MLS photos
(provider no-photo placeholder), not a defect. Every other recorded site is record-for-record identical
except attribution newly read from detail pages (2 Skilled records unattributed → featured, like their siblings).

## Not repaired
Detail pages that time out at the source (3 Skilled records) and a card whose URL and text name no property
(1 Skilled record) stay as they are.
