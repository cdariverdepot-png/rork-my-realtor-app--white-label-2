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
const { extractWebsiteDesign, describePageImages, renderableHero, introSupportingImage } = engine;
const base = 'https://example.com/';
const resolve = raw => { try { return new URL(raw, base).href; } catch { return undefined; } };
const roleOf = (html, needle) => describePageImages(html, '', resolve).find(i => i.sourceUrl.includes(needle))?.role;
const home = fs.readFileSync(path.resolve(__dirname, '../components/themes/WebsiteHome.tsx'), 'utf8');
const cindy = () => {
  const page = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/listing-compatibility/cindy-carlson-1791176729259.json'), 'utf8')).pages[0];
  return extractWebsiteDesign(page.html, page.finalUrl || page.url);
};

test('Cindy Carlson: portrait is the primary person image; the office photo stays with her welcome copy', () => {
  const design = cindy();
  assert.match(design.portraitImageUrl, /Edit\.jpg/, '1. her portrait is the primary portrait');
  assert.equal(design.original.layout, 'portrait-split');
  assert.match(design.introImage?.url ?? '', /office\.jpg/, '2. office.jpg is kept as the welcome/intro supporting image');
  assert.equal(design.heroTitle, 'Welcome To Cindy Carlson Realty');
  assert.equal(design.heroImageUrl, undefined, '3. not promoted to hero');
  assert.equal(renderableHero(design), null);
  assert.doesNotMatch(design.portraitImageUrl, /office/, '3. not promoted to the person slot');
  assert.equal(design.imagery.images.find(i => /office\.jpg/.test(i.sourceUrl)).role, 'article', 'alignleft = inside article copy');
  // Renderer places the intro image inside the welcome copy block, after the heading, never above the portrait.
  const copy = home.slice(home.indexOf('const heroCopy'), home.indexOf('const collectionTitle'));
  assert.ok(copy.indexOf('intro.url') > copy.indexOf('heroTitle ||'), 'intro image follows the welcome heading');
  assert.match(home, /const intro = introSupportingImage\(source, dpr\);/);
});

test('designs saved before the fix: the stored in-copy "hero" moves to the welcome copy instead of disappearing', () => {
  const office = { sourceUrl: 'https://i0.wp.com/cindycarlsonrealty.com/wp-content/uploads/2017/04/office.jpg?resize=498%2C335&ssl=1', variants: [], role: 'hero', selectedUrl: 'https://i0.wp.com/cindycarlsonrealty.com/wp-content/uploads/2017/04/office.jpg?w=372&ssl=1', width: 372, height: 250, destination: 'hero', fit: 'contain', renderedWidth: 251, renderedHeight: 169, upscaleRatio: 1.35, crop: 'rejected', rank: 1 };
  const saved = { heroImageUrl: office.selectedUrl, portraitImageUrl: 'https://i0.wp.com/cindycarlsonrealty.com/wp-content/uploads/2018/05/Edit.jpg?resize=768%2C920&ssl=1', imagery: { hero: office, images: [office] } };
  assert.equal(renderableHero(saved), null);
  assert.equal(introSupportingImage(saved).url, office.selectedUrl, '7. a rejected hero candidate is reused as a supporting image');
  assert.doesNotMatch(home, /heroMeta\?\.selectedUrl \|\| source\.heroImageUrl/);
});

test('4. genuine source heroes still become heroes', () => {
  const page = '<html><head><style>.hero-banner{background-image:url(/lake-hero.jpg)}</style></head><body><div class="hero-banner" style="background-image:url(/lake-hero.jpg)"></div><h1>Life by the water</h1><p>Welcome.</p></body></html>';
  const design = extractWebsiteDesign(page, base);
  assert.equal(design.heroImageUrl, base + 'lake-hero.jpg');
  assert.ok(renderableHero(design));
  assert.equal(design.introImage, undefined, 'the hero is not duplicated as a supporting image');
  const large = { sourceUrl: base + 'banner.jpg', variants: [], role: 'hero', selectedUrl: base + 'banner.jpg', width: 2400, height: 1000, destination: 'hero', fit: 'cover', renderedWidth: 390, renderedHeight: 220, upscaleRatio: 1, crop: 'modest', rank: 1 };
  assert.ok(renderableHero({ imagery: { hero: large, images: [large] } }), 'a large landscape that fills the slot is still a hero');
  assert.equal(renderableHero({ heroImageUrl: base + 'legacy.jpg' }).uri, base + 'legacy.jpg', 'designs without diagnostics keep their saved hero');
});

test('5/7. supporting images on other sites stay with their own source sections', () => {
  const page = '<html><body><h1>Jane Doe Homes</h1><p>Intro copy about Jane and the valley she serves for many years.</p>'
    + '<h2>Our Story</h2><p>We started selling homes in 1998 and have helped hundreds of families settle in. <img class="alignright" src="/storefront.jpg" width="1200" height="800"></p>'
    + '<h2>Home</h2><img src="/main-street.jpg" width="498" height="335"><h2>Community Involvement</h2><p>We sponsor the youth league, the food bank and the summer festival every year.</p>'
    + '<h2>Primary Sidebar</h2><img src="/facebook-widget.jpg" width="600" height="300"></body></html>';
  const design = extractWebsiteDesign(page, base);
  const byTitle = Object.fromEntries(design.sections.map(x => [x.title, x]));
  assert.equal(byTitle['Our Story']?.imageUrl, base + 'storefront.jpg', 'floated image stays with its section');
  assert.equal(byTitle['Community Involvement']?.imageUrl, base + 'main-street.jpg', 'image under a generic page title leads into the next section; rejected hero candidate reused');
  assert.ok(!design.sections.some(x => x.imageUrl === base + 'facebook-widget.jpg'), 'sidebar/widget imagery is not attached to content');
  assert.equal(design.heroImageUrl, undefined);
});

test('6. listing images remain listing images, never supporting or hero images', () => {
  const page = '<html><body><h1>Featured</h1><h2>Featured Properties</h2><p>Browse our current inventory of homes for sale in the area today.</p><img class="listing-photo" src="/property-123.jpg" width="1200" height="800"></body></html>';
  assert.equal(roleOf(page, 'property-123'), 'listing');
  const design = extractWebsiteDesign(page, base);
  assert.ok(!design.sections.some(x => x.imageUrl === base + 'property-123.jpg'));
  assert.equal(design.introImage, undefined);
  assert.equal(design.heroImageUrl, undefined);
});

test('floated in-copy images are article imagery on any site; explicit heroes are unaffected', () => {
  assert.equal(roleOf('<p><img class="alignright size-large" src="/team-office.jpg" width="1600" height="900"></p>', 'team-office'), 'article');
  assert.equal(roleOf('<img class="alignleft hero-banner" src="/hero.jpg" width="1600" height="700">', 'hero.jpg'), 'hero', 'an explicit hero signal wins');
  assert.equal(roleOf('<img class="alignright" src="/agent-headshot.jpg" width="400" height="500">', 'agent-headshot'), 'portrait', 'a floated headshot is still the portrait');
  assert.equal(roleOf('<img class="aligncenter" src="/wide.jpg" width="1600" height="700">', 'wide.jpg'), 'hero', 'centered full-width images keep the proportion rule');
});
