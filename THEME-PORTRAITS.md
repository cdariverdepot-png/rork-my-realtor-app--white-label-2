# Full-photo theme heroes

All seven themes and legacy client/editor heroes now use a natural-flow photo panel. Tall photos can sit beside copy where width and text size permit; wide and square photos sit above it. Theme palettes, typography, content and actions remain. Portraits no longer zoom or move in response to scrolling.

Dimensions are resolved once per source and cached. Contain keeps the whole image visible while proportions load. Photo and copy remain stable siblings when the composition adapts. Carousel phone cards scale the complete composition instead of clipping tall portraits.

Show full photo is the default, even for old saved framing. Photo layout offers explicit Crop photo with drag/pinch controls; only that choice applies framing. The upload confirmation also saves the entire selected image by default. Photos cropped before this change cannot recover missing pixels; replace them with their original files.

Validation: 177 automated tests pass, covering actual component trees for all seven themes, tall/square/wide images, explicit cropping, large text, unresolved dimensions and stationary motion. App TypeScript and production web export are checked separately. Local browser QA opened all seven phone-size client previews, scrolled and switched themes, and verified all seven editor-card previews with tall/wide/square fixtures. It used actual theme components in a temporary isolated QA route; signed-in production editor and iOS/Android device testing are still needed.

Not deployed. A local phone-preview screenshot accompanies the source package.
