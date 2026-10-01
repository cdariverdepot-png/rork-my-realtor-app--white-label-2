const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

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

test('PortraitImage locks recyclingKey, cache, and zero transition', () => {
  const src = read('components/PortraitImage.tsx');
  assert.match(src, /recyclingKey/);
  assert.match(src, /cachePolicy="memory-disk"/);
  assert.match(src, /transition=\{0\}/);
  assert.match(src, /useMemo/);
});

test('imagePosition returns a stable object for identical framing', () => {
  const { imagePosition } = load('lib/themeImages');
  const theme = { accent: 'gold', displayFont: 'playfair', surface: 'ivory', imagePositions: {} };
  const a = imagePosition(theme, 'private-collection');
  const b = imagePosition(theme, 'private-collection');
  assert.equal(a, b);
  assert.deepEqual(a, { left: '50%', top: '50%' });
});

test('useThemeMotion always exposes Animated interpolations (no number swap)', () => {
  const src = read('hooks/useThemeMotion.ts');
  assert.match(src, /useMemo/);
  assert.match(src, /Always return Animated nodes/);
  assert.doesNotMatch(src, /imgTranslate:\s*still\s*\?\s*0\s*:/);
  assert.doesNotMatch(src, /imgScale:\s*still\s*\?\s*1\s*:/);
});

test('theme preview and client heroes route portraits through PortraitImage', () => {
  for (const file of [
    'components/themes/shared.tsx',
    'components/ThemeHero.tsx',
    'components/Hero.tsx',
    'components/CoastalHero.tsx',
    'components/ClientLayoutHero.tsx',
    'components/themes/ReferenceHome.tsx',
    'components/QuickContact.tsx',
    'components/ThemeCarousel.tsx',
    'components/ThemePreviewModal.tsx',
    'app/admin/index.tsx',
    'app/welcome.tsx',
  ]) {
    const src = read(file);
    if (file.endsWith('ThemeCarousel.tsx') || file.endsWith('ThemePreviewModal.tsx')) {
      // These host ReferenceHome/ThemeFace; they must memoize preview / scroll binding.
      if (file.endsWith('ThemeCarousel.tsx')) {
        assert.match(src, /useMemo\(\s*\(\)\s*=>\s*withSamplePortrait/);
      } else {
        assert.match(src, /onScroll=\{onScroll\}/);
        assert.match(src, /Animated\.event/);
      }
      continue;
    }
    assert.match(src, /PortraitImage/, `${file} should render PortraitImage`);
    assert.doesNotMatch(
      src,
      /source=\{\{\s*uri:\s*(?:b|brand|draft|brandData)\.portraitUrl/,
      `${file} must not inline unstable portrait uri objects`,
    );
  }
});

test('FanCarousel gesture system is unchanged by portrait stability work', () => {
  const src = read('components/FanCarousel.tsx');
  assert.match(src, /useSharedValue/);
  assert.match(src, /withSpring/);
  assert.match(src, /wrapped\(i, pos\.value, count\)/);
  assert.match(src, /Card contents render once/);
});

test('ThemeFace memo compares portrait URL identity, not only element reference', () => {
  const src = read('components/ThemeFace.tsx');
  assert.match(src, /sameFace/);
  assert.match(src, /prev\.brand\.portraitUrl === next\.brand\.portraitUrl/);
});
