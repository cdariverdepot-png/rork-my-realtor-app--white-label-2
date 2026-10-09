// Client app Listings tab and review flow (Oct 8 2026 UI overhaul). Contracts: the Listings tab shows every active
// home as a complete card in vertical scroll (one column on phones, a grid only where cards keep a readable width),
// under the realtor's own heading, with no theme label and no "View all"; the Home screen keeps its property
// carousel but has no duplicate "View listings" button; the review reads the saved collection as its one source
// of truth and never offers the same website import again; the browser's Back walks the preview.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, stubs) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'module', code)(id => stubs[id] ?? require(id), module.exports, module);
  return module.exports;
}
const surface = load('lib/listingSurface.ts', {
  '@/constants/liveThemeDesigns': { liveThemeDesign: () => ({ background: '#101010', panel: '#181818', ink: '#F5F5F5', muted: '#BBBBBB', accent: '#C2A276' }) },
  '@/lib/websitePresentation': { websiteAppearance: b => b.presentation === 'website' ? b.websiteDesign.original : undefined, websiteFont: f => f },
  '@/lib/websiteDesignRuntime': { presentWebsiteSurface: (background, accent, ink) => ({ background, accent, ink, panel: '#FFFFFF' }) },
});

test('the Listings heading names the realtor, never claims a personal selection', () => {
  assert.equal(surface.listingsHeading({ realtor: { name: 'Cindy Carlson' } }), 'Cindy’s listings');
  assert.equal(surface.listingsHeading({ realtor: { name: '' } }), 'Available homes');
  assert.equal(surface.listingsHeading({ realtor: { name: 'J' } }), 'Available homes');
  assert.equal(surface.homesCount(1), '1 home');
  assert.equal(surface.homesCount(8), '8 homes');
});

test('one column on phones; two or three only where each card keeps a readable width', () => {
  for (const phone of [320 - 32, 393 - 32, 430 - 32, 600]) assert.equal(surface.listingColumns(phone), 1, String(phone));
  assert.equal(surface.listingColumns(700), 2);
  assert.equal(surface.listingColumns(1072), 3);
});

test('listing screens take the imported website\'s colors and type, or the chosen theme\'s', () => {
  const site = surface.listingSurface({ presentation: 'website', websiteDesign: { original: { background: '#FAF7F2', accent: '#8B1A1A', ink: '#222222', headingFontFamily: 'Lora', fontFamily: 'Inter', radius: 4 } } });
  assert.equal(site.background, '#FAF7F2');
  assert.equal(site.accent, '#8B1A1A');
  assert.equal(site.headingFont, 'Lora');
  assert.equal(site.radius, 6);
  const theme = surface.listingSurface({ presentation: 'premium', layoutId: 'private-collection' });
  assert.equal(theme.background, '#101010');
});

test('the preview Listings tab is the full browser: no theme label, no carousel, no "View all"', () => {
  const page = read('components/ThemePreviewPage.tsx');
  assert.match(page, /if \(route === '\/listings'\) return <ListingBrowser/);
  const browser = read('components/ListingBrowser.tsx');
  assert.doesNotMatch(browser, /THEME PREVIEW|View all|horizontal|Homes I picked/);
  assert.match(browser, /flexWrap: "row"|flexDirection: "row", flexWrap: "wrap"/);
  // The preview passes its own phone width, so a desktop browser does not lay out three columns in a phone frame.
  assert.match(read('components/ThemePreviewModal.tsx'), /onFavorite=\{toggleSaved\} width=\{previewWidth\}/);
});

test('the live Listings screen uses the same cards, virtualized, in the realtor\'s colors', () => {
  const screen = read('app/listings.tsx');
  assert.match(screen, /ListingCard/);
  assert.match(screen, /<FlatList/);
  assert.match(screen, /listingSurface\(brand\)/);
  assert.doesNotMatch(screen, /THE COLLECTION|Find your home|CARD_W/);
});

test('Home keeps its property carousel and arrow to Listings, without a duplicate "View listings" button', () => {
  const home = read('components/themes/WebsiteHome.tsx');
  assert.doesNotMatch(home, /'View listings'/);
  assert.match(home, /accessibilityLabel="View all listings" onPress=\{\(\) => navigate\('\/listings'\)\}/);
  assert.match(home, /<ScrollView horizontal/);
});

test('the review reads the saved collection and never offers the same website import again', () => {
  const setup = read('components/InitialRealtorSetup.tsx');
  assert.match(setup, /const reviewListings = useMemo\(/);
  assert.equal((setup.match(/listings=\{reviewListings\}/g) ?? []).length, 2, 'the inline preview and the full preview use the same collection');
  assert.doesNotMatch(setup, /listingsSnapshot\.current,result\?\.draft/);
  assert.doesNotMatch(setup, /<ListingSourceImporter initialUrl=\{url\}/);
  assert.match(setup, /const listingCount = savedListingCount \|\| importedListingCount;/);
  assert.match(setup, /\{listingCount > 0 \?/);
  // Resuming the review never lowers the count to the build draft's (empty) list.
  assert.doesNotMatch(setup, /setImportedListingCount\(found\.length\);\n    \}\n  \}, \[brand/);
});

test('on the web, Back steps through the preview pages before closing it', () => {
  const modal = read('components/ThemePreviewModal.tsx');
  assert.match(modal, /window\.history\.pushState/);
  assert.match(modal, /addEventListener\("popstate"/);
  assert.match(modal, /window\.history\.go\(-n\)/);
});

test('Saved homes in the preview use the same cards, without a "picked for you" claim', () => {
  const page = read('components/ThemePreviewPage.tsx');
  assert.match(page, /if \(route === '\/favorites'\) return <ListingBrowser /);
  assert.match(page, /title="Saved homes"/);
});

test('the review shows only the homes of the sources this import connected', () => {
  const scope = load('lib/appBuilder/importScope.ts', {});
  const items = [{ title: 'Cindy 1', sourceId: 'cindy' }, { title: 'Paonia 1', sourceId: 'paonia' }, { title: 'Paonia old', sourceId: 'paonia', sourceArchived: true }, { title: 'No source' }];
  assert.deepEqual(scope.listingsForSources(items, ['paonia']).map(i => i.title), ['Paonia 1']);
  assert.deepEqual(scope.listingsForSources(items, []).map(i => i.title), [], 'a failed import shows no one else\'s homes');
  assert.match(scope.newImportSession(), /^setup-[\w-]{8,57}$/);
  assert.notEqual(scope.newImportSession(), scope.newImportSession());
  // One active session for every builder screen: starting another supersedes the first, even from a new screen.
  const first = scope.beginImportSession();
  assert.equal(scope.isActiveImportSession(first), true);
  const second = scope.beginImportSession();
  assert.equal(scope.isActiveImportSession(first), false);
  assert.equal(scope.isActiveImportSession(second), true);
});

test('changing the website starts a new import session; late results of the old one are ignored', () => {
  const setup = read('components/InitialRealtorSetup.tsx');
  // The website switch is the module Studio uses too (lib/appBuilder/websiteSwitch, Oct 9 2026).
  assert.match(setup, /setReviewSourceIds\(\[\]\);\n    setImportedListingCount\(0\);/);
  assert.match(setup, /const websiteImport = startWebsiteImport\(\{ from: replacedWebsite, to: listingUrl, realtorId, onEvent: report\("listings"\),\n\s+deps: \{ connect: connectListingSource, disconnect: disconnectListingSource, afterDisconnect: refreshListings \} \}\);/);
  assert.match(setup, /const stale = websiteImport\.isStale;/);
  assert.match(setup, /await Promise\.allSettled\(\[listingImport, profileBuild\]\);\n      \/\/[^\n]*\n      if \(stale\(\)\) return;/);
  assert.match(setup, /listingsForSources\(/);
  assert.match(setup, /setReviewSourceIds\(connected\.source\?\.id \? \[connected\.source\.id\] : \[\]\)/);
  // Returning to a review scopes it to the sources connected now.
  assert.match(setup, /resumedReviewScope\(auth\.realtorId \? await connectedSourceIds\(auth\.realtorId\) : null, listingsSnapshot\.current\.length\)/);
});
