// App builder workflow and wording (Oct 9 2026 audit repairs). Behaviour is exercised through the real modules:
// Back between the builder's steps, returning to a review after a failed import, and the client-facing wording.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(rel, stubs = {}, cache = new Map()) {
  const file = path.join(root, rel.replace(/\.ts$/, '') + '.ts');
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (id in stubs) return stubs[id];
    if (id.startsWith('./')) return load(path.join(path.dirname(rel), id), stubs, cache);
    if (id.startsWith('@/')) return load(id.slice(2), stubs, cache);
    return require(id);
  }, module, module.exports);
  return module.exports;
}

/** A browser history with the behaviour that matters here: entries, state, and popstate on Back. */
function browserHistory() {
  const entries = [{ route: '/admin/build' }];
  let index = 0;
  const listeners = [];
  return {
    get state() { return entries[index]; },
    get length() { return index + 1; },
    pushState(state) { entries.splice(index + 1); entries.push(state); index++; },
    back() { if (index > 0) { index--; listeners.forEach(fn => fn()); } },
    go(n) { index = Math.max(0, index + n); listeners.forEach(fn => fn()); },
    onPop(fn) { listeners.push(fn); },
  };
}
/** The builder screen's use of lib/builderHistory, as InitialRealtorSetup wires it. */
function builder() {
  const { createBuilderHistory, historyLayers } = load('lib/builderHistory');
  historyLayers.reset();
  const history = browserHistory();
  const screen = { step: 'collect', imports: 0 };
  const steps = createBuilderHistory(history, historyLayers);
  const go = step => { screen.step = step; steps.sync(step); };
  screen.claimed = [];
  history.onPop(() => { const popped = steps.popped(); if (popped) screen.claimed.push(popped); if (popped === 'review' && screen.step === 'review') go('collect'); });
  return { history, screen, go, historyLayers };
}

test('Back from the review returns to the website address without importing; the next Back leaves the builder', () => {
  const { history, screen, go } = builder();
  go('building'); go('review');
  assert.equal(history.length, 2, 'the review is one history entry');
  history.back();
  assert.equal(screen.step, 'collect', 'browser Back / edge swipe: back to the address');
  assert.equal(screen.imports, 0, 'nothing is imported again');
  assert.equal(history.length, 1, 'the next Back leaves the builder');
});

test('leaving the review on screen (Back or Change) drops its entry, so browser Back does not skip a step', () => {
  const { history, screen, go } = builder();
  go('review');
  go('collect'); // on-screen Back
  assert.equal(history.length, 1);
  assert.equal(screen.step, 'collect');
  assert.deepEqual(screen.claimed, ['own'], 'the builder\'s own Back is kept from the router');
  go('review'); // the same website again returns to the review
  assert.equal(history.length, 2);
});

test('stepping back through the client app preview opened from the review never leaves the review', () => {
  const { history, screen, go, historyLayers } = builder();
  go('review');
  // The preview pushes its own pages and registers as a layer while open (ThemePreviewModal). The router may
  // replace history.state meanwhile, so nothing depends on data stored in it.
  historyLayers.open();
  history.pushState({ id: 'router' });
  history.pushState({ id: 'router' });
  history.back();
  assert.equal(screen.step, 'review');
  // The preview closes and drops its remaining entry.
  historyLayers.close();
  history.go(-1);
  assert.equal(screen.step, 'review');
  // Once the preview has settled, Back pops the review itself.
  historyLayers.close(Date.now() - 5000);
  history.back();
  assert.equal(screen.step, 'collect');
  assert.deepEqual(screen.claimed, ['review'], 'only the review\'s own pop is the builder\'s; the preview claims its pops');
  assert.match(read('components/ThemePreviewModal.tsx'), /historyLayers\.open\(\);/);
  // Pops that belong to the preview or the builder never reach the router: it would reset the screen underneath
  // to an older recorded state (the dashboard preview closed and left the dashboard, Oct 9 2026 gate probe).
  const modal = read('components/ThemePreviewModal.tsx'), setup = read('components/InitialRealtorSetup.tsx');
  assert.match(modal, /const onPop = \(event: PopStateEvent\) => \{\n\s+claimPop\(event\);/);
  assert.match(modal, /window\.addEventListener\("popstate", onPop, true\);/);
  assert.match(modal, /window\.addEventListener\("popstate", swallow, true\);\n\s+window\.history\.go\(-n\);/);
  assert.match(setup, /window\.addEventListener\("popstate", onPop, true\);/);
  // Browser-history steps are only used where the screen underneath keeps its state across them (the builder's
  // review); on the dashboard a history step made the router remount it (preview closed, dashboard left).
  assert.match(read('components/SetupReviewActions.tsx'), /<ThemePreviewModal [^\n]*browserHistory \/>/);
  for (const file of ['components/DesignPublicationPanel.tsx', 'components/ThemeShowcase.tsx', 'components/ThemeCarousel.tsx']) assert.doesNotMatch(read(file), /browserHistory/, file);
  assert.match(modal, /const web = browserHistory && Platform\.OS === "web"/);
  // A preview removed with its screen leaves its entries: walking back from a screen that is going away leaves the page.
  assert.match(modal, /useEffect\(\(\) => \(\) => \{ unmounting\.current = true; \}, \[\]\);/);
  assert.match(modal, /if \(webEntries\.current > 0 && !unmounting\.current\) \{/);
  assert.match(setup, /if \(!popped\) return;\n\s+claimPop\(event\);/);
  assert.match(read('components/ThemePreviewModal.tsx'), /historyLayers\.close\(\);\n\s+\/\/ Closed some other way/);
});

test('the builder wires its history, Android Back and the same-website shortcut', () => {
  const setup = read('components/InitialRealtorSetup.tsx');
  assert.match(setup, /createBuilderHistory\(window\.history\)/);
  assert.match(setup, /useEffect\(\(\) => \{ builderHistory\.current\?\.sync\(phase\); \}, \[phase\]\);/);
  assert.match(setup, /if \(phaseRef\.current === "review"\) setEditingSources\(true\); else void leaveBuildRef\.current\(\);/, 'Android Back from the review returns to the address');
  assert.match(setup, /hasConnectedSource && listingCount > 0 && websiteUri && primarySource\?\.uri === websiteUri && !building\) \{\n\s+setEditingSources\(false\);\n\s+return;/,
    'the same website after Back returns to the review instead of importing it again');
});

test('returning to a review after a failed import never shows the previous website\'s count, and keeps recovery', () => {
  const scope = load('lib/appBuilder/importScope');
  // Cindy imported, then Paonia failed: Cindy's 8 homes are archived, nothing is connected.
  const account = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, sourceId: 'cindy', sourceArchived: true }));
  const resumed = scope.resumedReviewScope([], account.length);
  assert.deepEqual(resumed, { reviewSourceIds: [], hasConnectedSource: false, restoreDraftListings: false });
  assert.equal(scope.reviewListingCount(account, resumed.reviewSourceIds, 0), 0, 'the review offers recovery instead of claiming 8 imported');
  // A successful import: the count is that source's visible homes only.
  const paonia = [...account, ...Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, sourceId: 'paonia' })), { id: 'h', sourceId: 'paonia', hidden: true }];
  const ok = scope.resumedReviewScope(['paonia'], paonia.length);
  assert.equal(ok.hasConnectedSource, true, 'publishing does not import the website again');
  assert.equal(scope.reviewListingCount(paonia, ok.reviewSourceIds, 0), 14);
  // Older builds with homes only in the build draft are restored when nothing else exists.
  assert.equal(scope.resumedReviewScope(null, 0).restoreDraftListings, true);
  const setup = read('components/InitialRealtorSetup.tsx');
  assert.match(setup, /const scope = resumedReviewScope\(/);
  assert.doesNotMatch(setup, /setImportedListingCount\(listingsSnapshot\.current\.length\)/, 'the whole account is never counted as this import');
});

test('a preview of an unpublished website change is never saved as the realtor\'s listings', () => {
  const listings = read('contexts/ListingsContext.tsx');
  assert.match(listings, /viewAsClient && draftWebsite\.listings \? draftWebsite\.listings : items/);
  assert.match(listings, /if \(hasDraftHomes\(incoming\)\) return;/);
  assert.match(listings, /if \(hasDraftHomes\(incoming\)\) throw new Error/);
  assert.match(read('hooks/usePendingWebsite.ts'), /id: `\$\{DRAFT_HOME_PREFIX\}\$\{home\.id\}`/);
  const studio = read('app/admin/studio.tsx');
  assert.match(studio, /onListingChange=\{draftWebsite\.listings \? undefined :/, 'preview homes are read-only in the editor');
});

test('the Listings tab has no Back arrow while the bottom navigation is on screen', () => {
  const screen = read('app/listings.tsx');
  assert.match(screen, /const navVisible = useClientNavVisible\(\);/);
  assert.match(screen, /\{!navVisible && <Pressable onPress=\{\(\) => back\(\)\}/);
  assert.match(read('components/ClientShell.tsx'), /const visible = useClientNavVisible\(\);/, 'one rule decides both');
});

test('collection headings never claim the realtor picked homes unless the realtor wrote it', () => {
  const heading = load('lib/collectionHeading');
  assert.equal(heading.collectionHeading('Homes I picked\nfor you.'), 'Available Properties');
  assert.equal(heading.collectionHeading('Homes I picked for you'), 'Available Properties');
  assert.equal(heading.collectionHeading(''), 'Available Properties');
  assert.equal(heading.collectionHeading('My Coeur d’Alene favorites'), 'My Coeur d’Alene favorites');
  assert.match(read('components/themes/WebsiteHome.tsx'), /isSeededPickedHeading\(b\.curated\.title\) \? NEUTRAL_COLLECTION_HEADING/);
  assert.doesNotMatch(read('components/themes/ReferenceHome.tsx'), /"Homes I picked for you\."/);
  // A real profile on a theme whose copy says "Homes I picked for you." gets the neutral heading; samples keep theirs.
  const { withThemeSlots } = load('constants/themeSlots', { '@/constants/themeSamples': { themeSlotCopy: () => ({ collection: 'Homes I picked for you.', brandSub: '', heroEyebrow: '', title: '', primaryCta: '', secondaryCta: '', conciergeEyebrow: '', conciergeTitle: '', quickContact: { kicker: '', title: '', sub: '' } }) }, '@/constants/clientLayouts': { DEFAULT_CLIENT_LAYOUT: 'eliza-editorial' } });
  const profile = { layoutId: 'eliza-editorial', realtor: { name: 'Bernadette Stech', monogram: '', brandName: '', brandSub: '', heroEyebrow: '', title: '', primaryCta: '', secondaryCta: '' },
    curated: { eyebrow: '', title: 'Homes I picked\nfor you.' }, concierge: { eyebrow: '', title: '' }, quickContact: { kicker: '', title: '', sub: '' } };
  assert.equal(withThemeSlots(profile).curated.title, 'Available Properties');
  assert.equal(withThemeSlots({ ...profile, curated: { eyebrow: '', title: 'Homes I picked for you.' } }).curated.title, 'Homes I picked for you.', 'theme samples carry their theme copy verbatim');
});

test('the builder preview says App Preview, not Theme Preview', () => {
  const page = read('components/ThemePreviewPage.tsx');
  assert.doesNotMatch(page, /THEME PREVIEW/);
  assert.match(page, />APP PREVIEW</);
});

test('square footage carries its unit; unknown sizes and statuses are left out', () => {
  const specs = load('lib/listingSpecs');
  assert.equal(specs.sizeLabel('2,129'), '2,129 sq ft');
  assert.equal(specs.sizeLabel('2129.5'), '2129.5 sq ft');
  assert.equal(specs.sizeLabel('1,850 sq ft'), '1,850 sq ft');
  assert.equal(specs.sizeLabel('0.5 acres'), '0.5 acres');
  assert.equal(specs.sizeLabel('0'), '');
  assert.equal(specs.specLine({ beds: 4, baths: 2.5, sqft: '2,129' }, 'long'), '4 beds · 2.5 baths · 2,129 sq ft');
  for (const file of ['components/themes/WebsiteHome.tsx', 'components/themes/LiveThemeHome.tsx', 'components/ThemePreviewPage.tsx', 'components/ThemeCollection.tsx', 'app/listing/[id].tsx']) assert.match(read(file), /sizeLabel\(/, file);
  const { listingStatusLabel } = load('lib/listingStatusLabel');
  assert.equal(listingStatusLabel({ status: undefined, tag: '' }), '');
  assert.equal(listingStatusLabel({ status: 'pending', tag: '' }), 'Pending');
  assert.equal(listingStatusLabel({ status: undefined, tag: 'Open house Sunday' }), 'Open house Sunday');
});

test('full postal-address titles show the street line when the area is shown beneath it', () => {
  const { listingDisplayTitle } = load('lib/listingTitle');
  assert.equal(listingDisplayTitle({ title: '41723 O Road, Paonia, Colorado CO 81428', neighborhood: 'Paonia, CO' }), '41723 O Road');
  assert.equal(listingDisplayTitle({ title: '208 W Main Street, Hotchkiss, Colorado CO 81419', neighborhood: 'Hotchkiss, CO' }), '208 W Main Street');
  assert.equal(listingDisplayTitle({ title: '409 Emerald Dr', neighborhood: 'Kellogg, ID' }), '409 Emerald Dr');
  assert.equal(listingDisplayTitle({ title: '12 Pine St, Unit 4, Denver, CO 80202', neighborhood: 'Denver, CO' }), '12 Pine St, Unit 4, Denver, CO 80202', 'a unit is never dropped');
  assert.equal(listingDisplayTitle({ title: 'Lakeview Lodge, Paonia, CO', neighborhood: 'Paonia, CO' }), 'Lakeview Lodge, Paonia, CO', 'only street addresses are shortened');
});
