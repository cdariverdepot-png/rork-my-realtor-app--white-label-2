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
const media = load('../../supabase/functions/analyze-realtor-build/websiteDesign.ts');
const base = 'https://example.com/';
const resolve = (raw) => media.websiteAsset(raw, base);

function page(html, css = '') {
  return media.assignPageImages(media.describePageImages(html, css, resolve, 2));
}

test('a low-resolution portrait stays a portrait and is not enlarged into a hero', () => {
  const images = page('<img alt="Agent headshot" src="/portrait-small.jpg" width="180" height="260">');
  assert.equal(images.portrait.role, 'portrait');
  assert.equal(images.portrait.fit, 'contain');
  assert.equal(images.portrait.crop, 'none');
  assert.equal(images.hero, undefined);
  assert.ok(images.portrait.upscaleRatio <= 1.35);
  assert.ok(images.portrait.renderedWidth <= 180);
  const forced = media.frameForSlot({ width: 180, height: 260, role: 'portrait' }, { width: 390, height: 220, purpose: 'hero' }, 3);
  assert.equal(forced.fit, 'contain');
  assert.equal(forced.crop, 'rejected');
  assert.ok(forced.upscaleRatio <= 1.35);
});

test('a high-resolution portrait uses the large file and keeps its aspect', () => {
  const images = page('<img alt="Broker portrait" src="/portrait.jpg" width="1600" height="2000">');
  assert.equal(images.portrait.selectedUrl, 'https://example.com/portrait.jpg');
  assert.equal(images.portrait.fit, 'contain');
  assert.equal(images.hero, undefined);
  const ratio = images.portrait.renderedWidth / images.portrait.renderedHeight;
  assert.ok(Math.abs(ratio - 1600 / 2000) < 0.05);
});

test('a wide hero may cover when the file is large enough, and a thumbnail is not chosen', () => {
  const html = '<img class="hero-banner" src="/hero-200.jpg" srcset="/hero-200.jpg 200w, /hero-1600.jpg 1600w" width="1600" height="800">';
  const images = page(html);
  assert.equal(images.hero.selectedUrl, 'https://example.com/hero-1600.jpg');
  assert.equal(images.hero.role, 'hero');
  assert.equal(images.hero.fit, 'cover');
  assert.notEqual(images.hero.crop, 'rejected');
  assert.ok(images.hero.upscaleRatio <= 1.35);
});

test('a tiny logo is contained, never cropped, and not used as a hero', () => {
  const images = page('<img class="site-logo" src="/mark.png" width="80" height="32">');
  assert.equal(images.logo.role, 'logo');
  assert.equal(images.logo.fit, 'contain');
  assert.equal(images.logo.crop, 'none');
  assert.equal(images.hero, undefined);
  assert.ok(images.logo.renderedWidth <= 80);
  assert.ok(images.logo.upscaleRatio <= 1.35);
});

test('srcset and lazy-loaded sources prefer the real file over the placeholder', () => {
  const srcset = page('<img src="/thumb.jpg" srcset="/thumb.jpg 120w, /full.jpg 1400w" width="1400" height="900">');
  assert.equal(srcset.hero.selectedUrl, 'https://example.com/full.jpg');
  const lazy = page('<img src="/blank.gif" data-src="/photo.jpg" width="1200" height="700">');
  assert.equal(lazy.hero.selectedUrl, 'https://example.com/photo.jpg');
  assert.notEqual(lazy.hero.sourceUrl, lazy.hero.selectedUrl);
});

test('a css background hero outranks a nearby image, and a listing photo is not a portrait', () => {
  const html = '<img class="hero-image" src="/nearby.jpg"><img class="property-photo" src="/house.jpg" width="1200" height="800">';
  const css = '.hero { background-image: url(/banner.jpg); position: relative; }';
  const images = page(html, css);
  assert.equal(images.hero.selectedUrl, 'https://example.com/banner.jpg');
  assert.equal(images.hero.rank, 3);
  const listing = images.all.find(image => image.selectedUrl.endsWith('/house.jpg'));
  assert.equal(listing.role, 'listing');
  assert.notEqual(listing.role, 'portrait');
});

test('a portrait aspect is not forced into a wide destination', () => {
  const frame = media.frameForSlot({ width: 900, height: 1200, role: 'article' }, { width: 390, height: 200, purpose: 'hero' }, 2);
  assert.equal(frame.fit, 'contain');
  assert.equal(frame.crop, 'rejected');
  assert.ok(Math.abs(frame.width / frame.height - 0.75) < 0.08);
});

test('the Cindy-shaped portrait fixture keeps the person photo out of the landscape slot', () => {
  const html = `<img class="wp-image-220" src="/uploads/Edit.jpg?resize=138%2C166&ssl=1" width="138" height="166" data-orig-file="/uploads/Edit.jpg?fit=3206%2C3840&ssl=1" data-orig-size="3206,3840" data-large-file="/uploads/Edit.jpg?fit=855%2C1024&ssl=1" srcset="/uploads/Edit.jpg?resize=250%2C300&ssl=1 250w, /uploads/Edit.jpg?resize=768%2C920&ssl=1 768w, /uploads/Edit.jpg?w=2000&ssl=1 2000w">
    <img class="alignleft wp-image-11" src="/uploads/office.jpg?resize=498%2C335&ssl=1" width="498" height="335" data-orig-file="/uploads/office.jpg?fit=372%2C250&ssl=1" data-orig-size="372,250" srcset="/uploads/office.jpg?w=372&ssl=1 372w">
    <img class="alignnone" src="/uploads/equalhousinglogo.jpg?resize=69%2C69&ssl=1" width="69" height="69" data-orig-size="774,600">`;
  const design = media.extractWebsiteDesign(html, base);
  assert.equal(design.portraitImageUrl.includes('Edit.jpg'), true);
  assert.equal(/resize=138/.test(design.portraitImageUrl), false);
  assert.equal(design.imagery.portrait.role, 'portrait');
  assert.equal(design.imagery.portrait.fit, 'contain');
  assert.equal(design.imagery.portrait.crop, 'none');
  assert.ok(design.imagery.portrait.upscaleRatio <= 1.35);
  assert.notEqual(design.heroImageUrl, design.portraitImageUrl);
  assert.equal(/resize=498/.test(design.heroImageUrl || ''), false);
  assert.equal(design.original.layout === 'image-overlay', false);
  assert.equal(design.imagery.images.some(image => /equalhousinglogo/.test(image.selectedUrl) && image.role === 'icon'), true);
  const forced = media.frameForSlot({ width: design.imagery.portrait.width, height: design.imagery.portrait.height, role: 'portrait' }, { width: 390, height: 220, purpose: 'hero' }, 3);
  assert.equal(forced.crop, 'rejected');
  assert.equal(forced.fit, 'contain');
});
