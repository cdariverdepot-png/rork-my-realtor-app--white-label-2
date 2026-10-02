# Full-photo theme heroes

All seven themes and legacy client/editor heroes now use a natural-flow photo panel. Tall photos can sit beside copy where width and text size permit; wide and square photos sit above it. Theme palettes, typography, content and actions remain. Portraits no longer zoom or move in response to scrolling.

Dimensions are resolved once per source and cached. Contain keeps the whole image visible while proportions load. Photo and copy remain stable siblings when the composition adapts. Carousel phone cards scale the complete composition instead of clipping tall portraits.

Show full photo is the default, even for old saved framing. Photo layout offers explicit Crop photo with drag/pinch controls; only that choice applies framing. The upload confirmation also saves the entire selected image by default. Photos cropped before this change cannot recover missing pixels; replace them with their original files.

Validation: 177 automated tests pass, covering actual component trees for all seven themes, tall/square/wide images, explicit cropping, large text, unresolved dimensions and stationary motion. App TypeScript and production web export are checked separately. Local browser QA opened all seven phone-size client previews, scrolled and switched themes, and verified all seven editor-card previews with tall/wide/square fixtures. It used actual theme components in a temporary isolated QA route; signed-in production editor and iOS/Android device testing are still needed.

Not deployed. A local phone-preview screenshot accompanies the source package.
## Client-preview flicker follow-up

The own-app Viewing as client route differs from the theme modal: it wraps the entire page in an animated swipe-back layer. That wrapper now has no transform while idle; horizontal movement is enabled only for an intentional left-edge gesture, with tighter vertical-scroll rejection. The home uses a plain ScrollView instead of an unused per-frame animated scroll binding. Portraits load eagerly on web rather than depending on viewport-driven lazy loading.

A separate confirmed race could switch the saved theme/photo: the twenty-second background poll used a forced read, and delayed initial/manual responses could override an edit made while the read was in flight. Polls now apply newer revisions normally. Forced reads include their starting revision, so they can repair a cold cache but cannot undo a later theme save. Requests from a previous account scope are ignored. Brand updates advance revisions monotonically and update their current-value reference immediately.

Five regression tests exercise the delayed-save race, stale background polls, cross-account request completion, authoritative cold reads and idle preview/gesture wiring. The full suite now has 182 tests. These fixes have not been deployed; the reported flicker has not yet been verified in the user's live build. Native-device gesture and image rendering checks remain necessary.
