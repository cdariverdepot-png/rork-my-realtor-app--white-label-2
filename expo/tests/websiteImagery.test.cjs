// Image roles must follow the source page's structure. Live capture: Cindy Carlson Realty homepage
// (tests/fixtures/listing-compatibility/cindy-carlson-1791176729259.json). Other cases are synthetic contracts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(mod, mod.exports);
  return mod.exports;
}
const engine = load('../../supabase/functions/analyze-realtor-build/websiteDesign.ts');
const { extractWebsiteDesign, describePageImages, renderableHero } = engine;
const base = 'https://example.com/';
const resolve = raw => { try { return new URL(raw, base).href; } catch { return undefined; } };
const roleOf = (html, needle) => describePageImages(html, '', resolve).find(i => i.sourceUrl.includes(needle))?.role;

test('Cindy Carlson: the office photo floated in her welcome copy never becomes the hero above her portrait', () => {
  const capture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/listing-compatibility/cindy-carlson-1791176729259.json'), 'utf8'));
  const page = capture.pages[0];
  const design = extractWebsiteDesign(page.html, page.finalUrl || page.url);
  assert.match(design.portraitImageUrl, /Edit\.jpg/, 'her portrait is the primary image');
  assert.equal(design.heroImageUrl, undefined, 'no hero: the page has no hero image');
  assert.equal(design.imagery.hero, undefined);
  const office = design.imagery.images.find(i => /office\.jpg/.test(i.sourceUrl));
  assert.equal(office.role, 'article', 'class="alignleft" places it inside article copy');
  assert.equal(renderableHero(design), null);
  assert.equal(design.original.layout, 'portrait-split');
});

test('designs saved before the fix: an in-copy image stored as hero is not rendered as the hero', () => {
  const office = { sourceUrl: 'https://i0.wp.com/cindycarlsonrealty.com/wp-content/uploads/2017/04/office.jpg?resize=498%2C335&ssl=1', variants: [], role: 'hero', selectedUrl: 'https://i0.wp.com/cindycarlsonrealty.com/wp-content/uploads/2017/04/office.jpg?w=372&ssl=1', width: 372, height: 250, destination: 'hero', fit: 'contain', renderedWidth: 251, renderedHeight: 169, upscaleRatio: 1.35, crop: 'rejected', rank: 1 };
  assert.equal(renderableHero({ heroImageUrl: office.selectedUrl, imagery: { hero: office, images: [office] } }), null);
  const home = fs.readFileSync(path.resolve(__dirname, '../components/themes/WebsiteHome.tsx'), 'utf8');
  assert.match(home, /const hero = renderableHero\(source, dpr\);/);
  assert.match(home, /const image = hero\?\.uri;/);
  assert.doesNotMatch(home, /heroMeta\?\.selectedUrl \|\| source\.heroImageUrl/, 'renderer no longer trusts any stored hero');
});

test('genuine heroes still render: explicit/CSS heroes and large cover-quality banners', () => {
  const css = { sourceUrl: base + 'bg.jpg', variants: [], role: 'hero', selectedUrl: base + 'bg.jpg', destination: 'hero', fit: 'cover', renderedWidth: 390, renderedHeight: 220, upscaleRatio: 1, crop: 'modest', rank: 3 };
  assert.equal(renderableHero({ imagery: { hero: css, images: [css] } }).uri, base + 'bg.jpg');
  const banner = { ...css, sourceUrl: base + 'banner.jpg', selectedUrl: base + 'banner.jpg', width: 2400, height: 1000, rank: 1 };
  assert.ok(renderableHero({ imagery: { hero: banner, images: [banner] } }), 'large landscape fills the hero slot');
  assert.equal(renderableHero({ heroImageUrl: base + 'legacy.jpg' }).uri, base + 'legacy.jpg', 'designs without diagnostics keep their saved hero');
  const portraitStored = { ...banner, role: 'portrait' };
  assert.equal(renderableHero({ imagery: { hero: portraitStored, images: [] } }), null, 'a portrait is never shown as a landscape hero');
});

test('floated in-copy images are article imagery on any site; explicit heroes are unaffected', () => {
  assert.equal(roleOf('<p><img class="alignright size-large" src="/team-office.jpg" width="1600" height="900"></p>', 'team-office'), 'article');
  assert.equal(roleOf('<p><img class="alignleft" src="/street.jpg" width="1200" height="700"></p>', 'street'), 'article');
  assert.equal(roleOf('<img class="alignleft hero-banner" src="/hero.jpg" width="1600" height="700">', 'hero.jpg'), 'hero', 'an explicit hero signal wins');
  assert.equal(roleOf('<img class="alignright" src="/agent-headshot.jpg" width="400" height="500">', 'agent-headshot'), 'portrait', 'a floated headshot is still the portrait');
  assert.equal(roleOf('<img class="aligncenter" src="/wide.jpg" width="1600" height="700">', 'wide.jpg'), 'hero', 'centered full-width images keep the proportion rule');
});
