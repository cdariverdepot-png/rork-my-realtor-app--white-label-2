# Responsive theme composition and portraits

Seven independently composed heroes replace the shared generic layout:
- Marissa: light coastal introduction and portrait side by side, paired rounded actions.
- Vance: journal masthead, full-width headline, photo and editorial introduction columns.
- Sloane: conversational split portrait, direct contact, rounded actions and a search bar.
- Burgundy: burgundy invitation panel, fine gold frame and private collection actions.
- Noah: asymmetric modern panels and a contrasting identity band.
- Mina: centered typography, framed portrait and spacious quiet composition.
- Eliza: large editorial headline, portrait spread, vertical accent and contrasting signature band.

Photo regions adapt to proportions. Wide photos and larger text stack where split layouts need more space. Default contain displays the entire image, including unusually tall photos constrained to a sensible panel height. Copy and actions use separate flow regions. An explicit Crop photo choice still enables saved focus/zoom; Show full photo remains the default. Previously cropped files need their originals to recover pixels.

Parallax is restored as a bounded upward translation inside a reserved photo gutter. The gutter is at least as large as the movement, so neither edge is clipped. No automatic zoom, opacity fades or scroll-dependent React state. Reduced-motion preferences disable it. Memoized scroll bindings serve client home and full theme previews. Idle swipe-back containers have no transform and activate only at the left edge. Portrait source/cache identity, eager web loading, and saved-revision race protections remain.

Carousel cards now render a 390 x 844 phone viewport scaled by width only. They intentionally show the top viewport of a scrollable page, with fixed full-width navigation; they never shrink an entire long page to fit card height. Full preview allows scrolling through all content.

Verification uses actual components in an isolated temporary QA route: seven phone client previews opened/scrolled/returned, full and miniature portraits checked at tall/square/wide proportions, and actual FanCarousel tested with bundled sample profiles/photos. Sloane screenshots are supplied. Automated tests, TypeScript and Expo export are recorded in the task. The QA route is excluded from published source. iPhone Safari/native-device visual verification is still required; browser checks do not establish native frame performance.

The first full-photo/flicker changes were published from commit 3820ce5. This follow-up restores theme composition and parallax while retaining the revision guards that prevent background reads from undoing a new theme/photo save.
