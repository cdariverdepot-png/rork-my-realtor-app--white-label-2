const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function load(name) {
  const file = path.join(root, name + '.ts');
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', source)((id) => {
    if (id.startsWith('@/')) return load(id.slice(2));
    if (id === '@/contexts/BrandContext') return { /* type-only */ };
    return require(id);
  }, module, module.exports);
  return module.exports;
}

test('applyBuildDraft opts into presentationVersion 2 + themeChosen for AI layout', () => {
  const { applyBuildDraft } = load('lib/appBuilder/applyDraft');
  const base = {
    realtor: { name: '', title: '', city: '', phone: '', email: '', tagline: '', heroMessage: '', welcomeNote: '', brandName: '', brandSub: '', monogram: '', heroEyebrow: '', primaryCta: '', closedVolume: '', yearsActive: 0 },
    note: { title: '', date: '', body: [], signoff: '' },
    curated: { title: '', subtitle: '' },
    beat: { headline: '', bullets: [] },
    concierge: { title: '', body: '' },
    quickContact: { title: '', sub: '' },
    support: { title: '', body: '' },
    social: { title: '' },
    testimonials: [],
    recentlyClosed: [],
    marketPulse: { title: '', date: '', signoff: '', paragraphs: [] },
    neighborhoods: [],
    credentials: { designations: [], education: [], awards: [], memberships: [], languages: [], license: { number: '', state: '', brokerage: '', since: '' } },
    portraitUrl: '',
    iconUrl: '',
    signatureUrl: '',
    theme: { accent: 'pewter', displayFont: 'grotesk', surface: 'alabaster' },
    copyright: '',
    updatedAt: 0,
  };
  const next = applyBuildDraft(base, [], {
    heroMessage: 'Welcome home.',
    aboutParagraph: 'I help buyers in North Idaho.',
    layoutId: 'warm-concierge',
  });
  assert.equal(next.layoutId, 'warm-concierge');
  assert.equal(next.themeChosen, true);
  assert.equal(next.theme.presentationVersion, 2);
  assert.equal(next.theme.accent, 'bronze');
  assert.equal(next.theme.surface, 'warmsand');
});

test('Warm Concierge themeDesign is the dark discovery canvas, not muddy paper', () => {
  const { themeDesign, THEME_DESIGNS } = load('constants/themeDesigns');
  const d = themeDesign('warm-concierge', { accent: 'bronze', displayFont: 'fraunces', surface: 'warmsand', presentationVersion: 2 });
  assert.equal(d.background.toLowerCase(), THEME_DESIGNS['warm-concierge'].background.toLowerCase());
  assert.notEqual(d.background.toLowerCase(), '#29231f');
  assert.notEqual(d.background.toLowerCase(), '#f3eadc'); // warmsand paper must not win
});

test('setup review uses the actual client renderer and discovered inventory', () => {
  const src = fs.readFileSync(path.join(root, 'components/InitialRealtorSetup.tsx'), 'utf8');
  assert.match(src, /OnboardingThemePreview/);
  assert.doesNotMatch(src,/themeSampleListings/);
  assert.match(src,/mergeDiscoveredListings\(existingListings/);
  assert.match(src, /themeCandidate/);
  assert.match(src, /liveThemeDesign/);
  assert.doesNotMatch(src, /backgroundColor: draft\.layoutId === "coastal-personal" \? "#F8F4EF" : "#29231F"/);
  assert.doesNotMatch(src, /#29231F/);
});

test('client home uses the live theme canvas when presentationVersion is 2', () => {
  const src = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');
  assert.match(src, /designedCanvas/);
  assert.match(src, /liveThemeBackground\(previewBrand\.layoutId/);
  assert.match(src, /scrollBackground/);
});
