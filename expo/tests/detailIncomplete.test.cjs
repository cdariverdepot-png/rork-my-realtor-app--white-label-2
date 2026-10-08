// detail-incomplete (final integration). Synthetic contracts: a detail page whose photo gallery is named by a
// component hook (data-testid / data-slot) instead of a class gives the record its gallery; a listing whose
// URL slug names a numbered street ("1270-42nd-Avenue") is matched to its own detail page; images repeated on
// other properties' detail pages are site decoration, not photos the record is missing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../scripts/listing-compatibility.cjs');
const { findingsFor } = require('../scripts/improve/evaluate.cjs');
const { requestKey } = require('../scripts/improve/engine.cjs');

const listing = (sourceUrl, title, extra = {}) => ({ title, sourceUrl, description: '', price: '$400,000', beds: 0, baths: 0, sqft: '', neighborhood: '', image: '', images: [], ...extra });
const remarks = 'Updated pool home with a new roof, impact windows and a fenced yard close to the beach and schools. '.repeat(2);

test('a gallery named by a component hook gives the record its photos', async () => {
  const { enrichListingFromPage } = await loadEngine();
  const url = 'https://hooks.example/home-search/listings/88-2372-W-Wabash-Street';
  const photos = [1, 2, 3, 4, 5].map(n => `<div role="button" aria-label="View photo ${n}"><img src="https://cdn.example/mls/88/${n}.jpeg" alt="Property photo ${n}" class="h-full w-full object-cover"></div>`).join('');
  const html = `<html><body><header><img src="https://cdn.example/brand.png" alt="logo"></header><h1>2372 W Wabash Street, Olathe, KS 66061</h1>
    <div class="grid h-[296px] w-full" data-testid="carousel-container">${photos}</div><div id="description"><p>${remarks}</p></div>
    <aside data-testid="similar-listings"><img src="https://cdn.example/mls/99/1.jpeg" alt="Property photo 1"></aside></body></html>`;
  const enriched = enrichListingFromPage(listing(url, '2372 W Wabash Street, Olathe, KS 66061', { images: ['https://cdn.example/mls/88/1.jpeg'] }), html, new URL(url));
  assert.deepEqual(enriched.images, [1, 2, 3, 4, 5].map(n => `https://cdn.example/mls/88/${n}.jpeg`));
});

test('a numbered street in the URL slug identifies the property when the card names nothing', async () => {
  const { enrichListingFromPage } = await loadEngine();
  const url = 'https://numbered.example/properties/listing/Beaches/B260/FL/Vero-Beach/1270-42nd-Avenue';
  const page = `<html><body><h1>1270 42nd Avenue Vero Beach, FL 32960</h1><div class="sidx-carousel">${[1, 2, 3].map(n => `<img src="https://photos.example/1270-${n}.jpeg">`).join('')}</div>
    <p class="sidx-listing-description">${remarks}</p></body></html>`;
  const card = listing(url, 'New Listing - 14 minutes on site 1 / 49 $475,000 Single Family');
  const enriched = enrichListingFromPage(card, page, new URL(url));
  assert.ok(enriched.description.length > 80);
  assert.equal(enriched.images.length, 3);
  // Another property's page is never used for it.
  const other = page.replace(/1270 42nd Avenue/g, '1302 43rd Avenue').replace(/1270-/g, '1302-');
  assert.equal(enrichListingFromPage(card, other, new URL(url)).description, '');
});

test('a structured summary with one cover photo does not replace the page\'s remarks and gallery', async () => {
  const { enrichListingFromPage } = await loadEngine();
  const url = 'https://summary.example/property-search/detail/337/PA1/1303-n-7th-st-philadelphia-pa-19122/';
  const ld = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'RealEstateListing', name: '1303 N 7th St Philadelphia, PA 19122', url,
    description: 'Property for lease at 1303 N 7th St Philadelphia, PA 19122, with MLS PA1.', image: 'https://cdn.example/large/PA1_01.jpg', offers: { price: '2800' } })}</script>`;
  const photos = [1, 2, 3, 4].map(n => `<img src="https://cdn.example/pics/PA1_0${n}.jpg" alt="1303 N 7th St | MLS PA1 Photo ${n}">`).join('');
  const html = `<html><head>${ld}</head><body><section class="relative" id="imageGallery">${photos}</section><div id="description" class="text-sm">${remarks}</div></body></html>`;
  const enriched = enrichListingFromPage(listing(url, '1303 N 7th St Philadelphia, PA 19122'), html, new URL(url));
  assert.ok(enriched.description.startsWith('Updated pool home'));
  assert.ok(enriched.images.length >= 4);
  // Full structured remarks and a structured gallery still win.
  const full = html.replace('Property for lease at 1303 N 7th St Philadelphia, PA 19122, with MLS PA1.', 'Structured remarks. '.repeat(15).trim());
  assert.ok(enrichListingFromPage(listing(url, '1303 N 7th St Philadelphia, PA 19122'), full, new URL(url)).description.startsWith('Structured remarks.'));
});

test('improvement loop: images repeated on other properties\' detail pages are not missing photos', () => {
  const chrome = ['email', 'call', 'left', 'portrait', 'right', 'info'].map(name => `<img src="https://site.example/image/${name}.webp">`).join('');
  const page = (url, body) => ({ key: requestKey(url, undefined, false), url, finalUrl: url, html: `<html><body>${chrome}${body}</body></html>` });
  const capture = { pages: [
    page('https://site.example/idx/1/a', '<img src="https://s3.example/defaultNoPhoto/noPhotoFull.png">'),
    page('https://site.example/idx/2/b', [1, 2, 3, 4].map(n => `<img src="https://photos.example/2-${n}.jpg">`).join('')),
  ] };
  const rows = [listing('https://site.example/idx/1/a', '1 Pine Rd', { images: [] }), listing('https://site.example/idx/2/b', '2 Oak Ln', { images: ['https://photos.example/2-1.jpg'] })];
  const findings = findingsFor({ id: 's', set: 'regression', category: 't' }, capture, { result: { listings: rows, meta: {} }, listings: rows, missing: [] });
  const thin = findings.find(f => f.code === 'DETAIL_INCOMPLETE');
  assert.deepEqual(thin.examples.map(e => e.sourceUrl), ['https://site.example/idx/2/b']);
});
