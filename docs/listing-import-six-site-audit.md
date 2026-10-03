# Realtor import audit — October 3, 2026

The changes use the supplied current ZIP as their base. Production extraction is selected by observed platform markup and data shapes, without customer-domain-specific extraction rules.

| Example | Interface | Active records with prices and photos | Scope |
|---|---|---:|---|
| Cindy Carlson | Flexmls | 9 | Scoped active collection |
| GetHomeNow | Brivity | 94 | Published agent/office collection |
| North Idaho Freedom | IDX Broker | 5 | Homepage showcase; partial inventory |
| Christine Matheny | Moxi | 13 | Agent active collection, two pages; pending excluded |
| McKenzie Realty | iHomefinder Kestrel | 1 | Published featured widget; pending excluded |
| Greg Volland | AgentFire / dsIDXpress | 10 | Homepage showcase; partial inventory |

Counts are dated observations, not promises that future inventory will have the same count. The six-site extraction benchmark returned prices and photo URLs for every active record. Cover-image HTTP checks succeeded for every extracted record on the three new websites.

## Failures repaired

- Moxi: follow the agent's active collection and its observed pagination, read lazy photos and literal property data, and merge duplicate detail URLs without combining different MLS listings at the same address.
- iHomefinder: recognize the actual featured widget configuration, retrieve its public listing response and detail photos using the website's own public transport, and filter inactive records. A fresh app test exposed a server-only decoder failure: the deployed Deno crypto implementation rejected a null ECB initialization vector. An empty typed-array vector fixes both Node and Deno; the deployed endpoint now returns the real $449,000 listing with 12 photos.
- AgentFire / dsIDXpress: read explicit property fields from detail pages and identify the homepage collection as a partial showcase.
- Generic cards: prevent one property from borrowing prices, specifications, or images from its neighbors. Add diagnostics for unreadable sources instead of treating failures as a successful empty import.
- Persistence: await saves before reporting completion, keep the current in-memory collection synchronized, and restore missing collections from saved drafts without duplicating properties.

## Verification

41 focused extraction and persistence tests pass. The single-file deployment bundle loads successfully. Live deployed onboarding calls return McKenzie's one listing with 12 photos and Greg's ten listings with showcase coverage and no failed pages.

Christine's fresh guest onboarding imported 13 real properties. After Complete Setup and a reload, the dashboard retained 13 live listings, the client collection showed 13 homes, and the $1,950,000 Athol property displayed its real image, 4 bedrooms, 3.5 bathrooms, 4,885 square feet and description.

McKenzie's fresh guest onboarding imported one real listing. After Complete Setup and a reload, the dashboard retained one live listing. The client property view displayed NNA Half Round Bay Rd, Harrison, ID, $449,000, its real photo and the description of the 3.09-acre parcel. Zero beds/baths and absent interior area reflect a land listing; residential specifications were not invented. Twelve photo URLs were extracted. The first test browser crashed before submitting the import; the recovered clean setup then completed successfully.

Greg's fresh guest onboarding imported ten properties. After Complete Setup and a reload, the dashboard retained ten live listings and the client view showed all ten with their prices and specifications. The 526 Roop Rd detail displayed its actual house photo, $6,995,000 price, 5 bedrooms, 5 bathrooms, 7,892 square feet and description. This verifies display of the retrieved showcase; it does not establish full agent inventory coverage.

Guest-session persistence proves local save and reload. It does not prove authenticated cloud persistence for these newly added examples. The UI's guest listings show “Not synced yet.” No existing realtor profile was replaced for these example tests.




## Release and remaining coverage

The shared onboarding backend is deployed as analyze-realtor-build version 20; refresh-listings is version 8. Existing authentication checks remain in place. The frontend persistence repairs and metadata changes are included in this commit. At the time of the audit, the frontend had not been rebuilt or republished; the main-branch deployment workflow builds and publishes the committed version. Full Expo typecheck/build was not run because available local disk space was insufficient for dependency installation.

The adapters cover six measured platform examples plus ordinary cards, structured data, hydration, public JSON and observed pagination. This is not compatibility with every IDX installation. Unknown JavaScript-only widgets still need a production rendering service or authorized provider integration. The optional renderer is tested but not configured in production. Showcase or unknown coverage cannot trigger disappearance-based archiving of existing listings.

realtor-import-compatibility-v2.zip contains 13 cumulative changed source/test files with project-relative paths. Apply it over the supplied current build, then rebuild/publish the frontend. It is a source patch, not a complete rebuilt application. realtor-compatibility-six-sites.json contains the repeatable six-site benchmark results; the patch includes its script and example manifest.

