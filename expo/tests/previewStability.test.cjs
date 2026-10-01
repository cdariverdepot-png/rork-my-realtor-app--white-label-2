const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(name) {
  const file = path.join(root, name + '.ts');
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(id => {
    if (id.startsWith('@/')) return load(id.slice(2));
    return require(id);
  }, module, module.exports);
  return module.exports;
}

test('sameJson treats identical brand-shaped objects as equal and differs on content', () => {
  const { sameJson } = load('lib/sameJson');
  const a = { realtor: { name: 'Ada' }, portraitUrl: 'https://x/y.jpg', theme: { accent: 'gold' } };
  const b = { realtor: { name: 'Ada' }, portraitUrl: 'https://x/y.jpg', theme: { accent: 'gold' } };
  const c = { ...b, portraitUrl: 'https://x/z.jpg' };
  assert.equal(sameJson(a, b), true);
  assert.equal(sameJson(a, c), false);
  assert.equal(sameJson(a, a), true);
});

test('Reveal entrance is one-shot and waits for reduce-motion readiness', () => {
  const src = fs.readFileSync(path.join(root, 'components/Reveal.tsx'), 'utf8');
  assert.match(src, /played\.current/);
  assert.match(src, /if \(!ready \|\| played\.current\) return/);
  assert.match(src, /useReducedMotion\(\)/);
  assert.match(src, /ready/);
  // Must not restart solely because delay/reduced churn after first play.
  assert.match(src, /plays at most once|one-shot|one shot/i);
});

test('useReducedMotion stays unresolved until AccessibilityInfo answers', () => {
  const src = fs.readFileSync(path.join(root, 'hooks/useThemeMotion.ts'), 'utf8');
  assert.match(src, /ready:\s*false/);
  assert.match(src, /ReducedMotionState/);
  assert.match(src, /still = !ready \|\| reduced \|\| disabled/);
});

test('Preview my app path gates on brand+listings hydrate and locks reveal delays', () => {
  const ready = fs.readFileSync(path.join(root, 'app/admin/ready.tsx'), 'utf8');
  assert.match(ready, /enterViewAsClient/);
  assert.match(ready, /Preview my app/);
  assert.match(ready, /router\.replace\("\/"\)/);

  const home = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');
  assert.match(home, /brandHydrated && listingsHydrated/);
  assert.match(home, /lockedDelays/);
  assert.match(home, /previewDataReady/);
});

test('brand and listings sync skip setState when payload is unchanged', () => {
  const brand = fs.readFileSync(path.join(root, 'contexts/BrandContext.tsx'), 'utf8');
  assert.match(brand, /sameJson\(migrated, brandRef\.current\)/);
  assert.match(brand, /sameJson\(incoming, brandRef\.current\)/);
  const listings = fs.readFileSync(path.join(root, 'contexts/ListingsContext.tsx'), 'utf8');
  assert.match(listings, /sameJson\(incoming, itemsRef\.current\)/);
});

test('preview hero and listing images disable fade-in transitions', () => {
  for (const file of [
    'components/Hero.tsx',
    'components/CuratedListings.tsx',
    'components/themes/shared.tsx',
    'components/ThemeCollection.tsx',
    'components/CoastalHero.tsx',
  ]) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(src, /transition=\{0\}/, `${file} should disable image transition`);
    assert.doesNotMatch(src, /transition=\{(?:200|300)\}/, `${file} must not fade images in`);
  }
});
