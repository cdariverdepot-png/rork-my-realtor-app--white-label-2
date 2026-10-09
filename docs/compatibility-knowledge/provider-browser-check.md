# provider-browser-check: the inventory provider shows automated readers a browser check

Repaired Oct 8 2026 (reviewed change).

## Cause
Between Oct 5 and Oct 8 2026, my.flexmls.com began answering automated document requests for a collection
page with a Fastly "Client Challenge". Headless browsers (the Fly.io renderer) stay on the check. The
collection's server-rendered photo-view and listing_detail fragments, the same public transports the
importer already read on Oct 5, are still published and allowed for the importer by my.flexmls.com/robots.txt
(it disallows named SEO and AI crawlers only).

## Structural pattern
A provider collection whose published transport is fully determined by the collection URL:
Flexmls `/search/(office_|agent_)?listing_categories/<category>/listings[/<id>]` ->
`...listings?list_view=photo&page=1&per_page=24`, details `/listing_detail/<id>`.

## Strategy
`ListingInterfaceAdapter.transports(url)` (registry field), `urlDerivedTransports()`. When a collection
document is a browser check and an adapter publishes a URL-derived transport, discovery queues the transport
(same scope, `provider_transport_after_check` stage) and does not spend a browser render on the check.
Rules: no check is solved or evaded, the importer's user agent is honest, robots rules are enforced by the
fetch layer; office_/agent_ categories are provider-scoped; a plain listing_categories collection is used only
when the realtor submitted it or their site claimed it.

## Evidence
Live capture `cindy-carlson-realty--transport` (Oct 8): 8 current listings from cindycarlsonrealty.com,
all with remarks and full Spark galleries (9 on Oct 5; one sold, one price change). Five other Flexmls
accounts' collections read through the same transport. Oct 5 responses with the document replaced by the
recorded check reproduce the same nine properties.

## Limits
If Flexmls also checks its fragments, this transport stops working; the importer then reports the check
(provider named) and offers the CSV and single-listing paths. The licensed alternative is the Spark API
(FBS), which needs an API key issued through the MLS.
