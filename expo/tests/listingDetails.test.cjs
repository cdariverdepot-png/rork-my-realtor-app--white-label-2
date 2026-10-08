// Repair stage 6 (synthetic contracts): the generic property detail reader. Photos come only from the
// property's gallery container, at full size; remarks only from its description container.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../scripts/listing-compatibility.cjs');
let engine;
const get = async () => engine ??= await loadEngine();
const base = new URL('https://agent.example/homes/1017-minor-avenue-1401-seattle-wa/2541335/');
const item = { title: 'view property+ 1017 Minor Avenue #1401 Seattle, WA 98104 2 beds $699,000', description: '', price: '$699,000', beds: 2, baths: 2, sqft: '',
  neighborhood: '', image: 'https://cdn.example/card.jpg', images: ['https://cdn.example/card.jpg'], sourceUrl: base.toString() };
const page = body => `<html><head><meta property="og:description" content="For more information about this home, please fill out the &lt;a href=&quot;/form&quot;&gt;form&lt;/a&gt;."></head>
  <body><header><div class="hero-slider"><img src="https://agent.example/uploads/hero.jpg"></div><img src="/logo.png"></header>
  <h1>1017 Minor Avenue #1401, Seattle, WA 98104</h1>${body}
  <section class="similar-homes-carousel"><img src="https://photos.example/OTHER-1.jpg"></section></body></html>`;

test('lazy-loaded gallery photos are read at full size, never placeholders, chrome or similar homes', async () => {
  const { enrichListingFromPage } = await get();
  const html = page(`<div class="property-photo"><div class="image-carousel"><img class="media-object" data-main-source="https://photos.example/1.jpg?width=1200"
    data-alternate-source="https://photos.example/no-photo.jpg" alt="Property Photo"><img data-src="https://photos.example/2.jpg" src="data:image/gif;base64,R0lGOD"></div></div>
    <div class="property-description">A rare penthouse with sweeping views of the Sound and the Olympics, restored with care and ready for its next owner.</div>`);
  const result = enrichListingFromPage(item, html, base);
  assert.deepEqual(result.images, ['https://photos.example/1.jpg?width=1200', 'https://photos.example/2.jpg']);
  assert.match(result.description, /^A rare penthouse/);
  assert.equal(result.detailsComplete, true);
});

test('lightbox links are the full-size photos; their thumbnails are not added twice', async () => {
  const { enrichListingFromPage } = await get();
  const html = page(`<div class="ngg-galleryoverview"><a href="/gallery/1017/kitchen.jpg"><img src="/gallery/1017/thumbs/kitchen-100x65.jpg"></a>
    <a href="/gallery/1017/view.jpg"><img src="/gallery/1017/thumbs/view-100x65.jpg"></a></div>`);
  assert.deepEqual(enrichListingFromPage(item, html, base).images, ['https://agent.example/gallery/1017/kitchen.jpg', 'https://agent.example/gallery/1017/view.jpg']);
});

test('form text and contact prompts are never remarks', async () => {
  const { enrichListingFromPage } = await get();
  const html = page(`<div class="gfield field_description_below"><div class="gfield_description">Please enter your name and phone number so we can reach you about this property.</div></div>`);
  assert.equal(enrichListingFromPage(item, html, base).description, '');
});

test('a page that names a different property is never used for this listing', async () => {
  const { enrichListingFromPage } = await get();
  const html = page(`<div class="image-carousel"><img src="https://photos.example/1.jpg"></div>`).replace(/1017 Minor Avenue #1401/g, '2200 Pike Street #12');
  const other = { ...item, sourceUrl: 'https://agent.example/homes/listing/2541335/' };
  assert.deepEqual(enrichListingFromPage(other, html, new URL(other.sourceUrl)), other);
});
