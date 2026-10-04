# Website-to-app verification — 2026-10-04 UTC

Production web and analyze-realtor-build deployments passed for 58a6234f53edfae94db5d3495dd150833ec2e454. Public identity permission migration published in b9a8d529aebdbf563e12d7093f7fae992d375241 and applied to xdcqjaodcvnlawqcunrr. 239 tests pass; TypeScript and Expo export pass.

## Live importer audit

| Website | Listings | Prices | Image URLs | Coverage |
|---|---:|---:|---:|---|
| cindycarlsonrealty.com | 9 | 9 | 9 | collection |
| gethomenow.com | 94 | 94 | 94 | collection |
| northidahofreedom.com | 5 | 5 | 5 | partial showcase |
| christinematheny.com | 13 | 13 | 13 | collection |
| mckenzie-realty.com | 1 | 1 | 1 | unknown completeness |
| gregvolland.com | 10 | 10 | 10 | partial showcase |

Public IDX adapters are not a guarantee of all IDX interfaces or full MLS access. Source coverage warnings remain visible.

## Fresh-session Cindy verification

An isolated browser origin and new anonymous realtor workspace completed the five-page realtor walkthrough and imported the supplied homepage. Review and dashboard displayed nine real listings. Database confirmed nine saved inventory items with prices and images. The published client app opened 604 W Cameron Ave: $388,000, four bedrooms, 1.5 bathrooms, 2,382 square feet, real Flexmls photo. Published dashboard selected My Website first and showed no false unpublished changes.

Found and fixed: background builder hydration interrupted first-publication routing; JSONB key ordering caused false dirty drafts; dashboard theme selection remained on a premium theme after website hydration; website extraction included footer widgets and icon entities; property previews lacked a matching background; public name/branding lacked column update grants during invitation activation. The failed activation was retried successfully after migration. The celebration screen and permanent QR link were visibly verified, but automatic first-publish navigation should still be checked in another fresh session after the permission migration.

Preview saved-home, chat, and showing interactions were visibly tested. Database showed no chat/favorite/showing records created by preview activity. Signed-out invitation correctly identified Cindy and displayed the five-page client walkthrough before account creation. No actual client signup or native installation was performed.

## Remaining verification

Native App Store/Google Play links and fresh-device installation/deferred handoff require actual store releases and supplied links. Universal compatibility with every IDX product cannot be claimed. QR save showed a ready-to-save notice; a browser download event was not captured. Manual design refresh/revert and returning-client account preservation have automated coverage but require additional live UI verification. The browser temporarily failed during capture; recovered screenshots show the published client listing and celebration.
