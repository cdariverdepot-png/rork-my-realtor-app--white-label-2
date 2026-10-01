# Website listing import

Setup starts from the realtor's website and follows property links across domains, including unknown broker/search providers. Own, office and featured inventory outrank general market searches. General market navigation pages are not imported as the realtor's inventory.

Supported discovery includes property anchors and accessible labels, buttons exposing a destination, embedded/lazy-loaded frames, GET search forms with hidden agent filters, HTTP-to-HTTPS links, HTTP redirects, HTML refresh redirects, JSON-LD, JSON hydration, and public inventory fragments exposed by the page. Flexmls collections additionally load their public photo-card fragment while preserving the portal, category and filters. Linked next pages and Flexmls fragment pagination stay within the same collection.

If normal navigation reaches a dead end, the existing OpenAI build model may select observed links with ambiguous labels. It receives candidate ids and can only choose URLs already found on the page. It cannot invent listing facts or destinations. AI errors do not fail the profile import.

Discovery is bounded to five link levels, twenty public-page requests, one hundred properties and a 45-second navigation budget (an in-progress page fetch can finish after the budget). Up to twelve evidenced properties can also have their details enriched with descriptions and higher-resolution cover photos within that same request/time budget. Every fetched page and redirect still goes through the existing public HTTPS/DNS checks. At most two AI navigation calls are allowed, each with an eight-second timeout.

The importer records visited pages, failed requests, inventory destinations and whether the result is found, partial, unreadable or not found. A zero-property result preserves profile information and asks for a direct property-list link. Manual property entry remains available from the dashboard after setup. An unsuccessful retry retains the pasted URL.

## Validation

- Live check on October 1, 2026: starting only at `https://cindycarlsonrealty.com/` follows Featured Listings, then the office's active Flexmls collection, then its public card fragment. Exactly nine distinct properties import with prices, photos and available specifications; repeat import remains nine.
- Automated coverage includes unknown external domains, button destinations, lazy embeds, filtered GET forms, redirects, hydration, pagination, loop/fetch failure handling, exclusion of market-search inventory and agency pages, and rejecting AI-invented destinations.
- Listing discovery tests are included in the normal app test command.

## Limits

This is not a full browser renderer. Sites exposing neither readable HTML/hydration nor a supported public inventory fragment, and sites requiring sign-in, CAPTCHA or browser-only interaction, can still return no properties. The UI reports that limitation and offers another URL. The live test verifies public-page discovery and merging; it does not exercise authenticated production onboarding or an actual OpenAI routing call.

The existing main-branch workflows deploy the app and Edge Function when this change is merged. The single-file deployment bundle is kept in sync with the function and discovery source.
