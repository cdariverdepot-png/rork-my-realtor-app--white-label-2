// Autonomous repair title-not-property (Phase 9). Synthetic contracts unless stated: a listing card can
// name its property only by price or badges ("$8,500,000"); the property's own detail page names it in its
// structured PostalAddress and/or its single main heading. That name becomes the title. A title that
// already names something, a page that is not the listing's own document, a page with several addresses
// (related homes) and page chrome never replace it, and nothing is invented when the page is unreadable.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadEngine } = require('../scripts/listing-compatibility.cjs');
const { loadPipeline, replayCapture, readCapture } = require('../scripts/improve/engine.cjs');

const listing = (sourceUrl, title, extra = {}) => ({ title, sourceUrl, description: '', price: '', beds: 0, baths: 0, sqft: '', neighborhood: '', image: '', images: [], ...extra });
const ld = (url, street, locality = 'Hope', region = 'ID', zip = '83836') => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'RealEstateListing', name: `${street}, ${locality}`, url,
  offers: { '@type': 'Offer', price: '8500000' }, about: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: street, addressLocality: locality, addressRegion: region, postalCode: zip } } })}</script>`;
const detail = ({ url, h1, street, extra = '' }) => `<html><head><title>x</title>${street ? ld(url, street) : ''}</head><body>${h1 !== undefined ? `<h1>${h1}</h1>` : ''}
  <div class="property-description">A private island retreat with a lodge, guest cabins and a boathouse on the lake, reached by a short boat ride from the marina. ${'Quiet water. '.repeat(10)}</div>
  <img class="gallery" src="https://cdn.example/photo-1.jpg"><img class="gallery" src="https://cdn.example/photo-2.jpg">${extra}</body></html>`;

test('title-not-property: a price-titled card takes the name its own detail page gives the property', async () => {
  const { enrichListingFromPage } = await loadEngine();
  const url = 'https://brokerage.example/property/20261373/';
  const html = detail({ url, h1: 'Cottage Island, Hope, ID 83836', street: 'Cottage Island' });
  const enriched = enrichListingFromPage(listing(url, '$8,500,000', { price: '$8,500,000' }), html, new URL(url));
  assert.equal(enriched.title, 'Cottage Island, Hope, ID 83836');
  assert.equal(enriched.price, '$8,500,000', 'the price is kept as the price');
  // Encoded headings are decoded; the structured address alone is used when no heading reads as a place.
  const html2 = detail({ url, h1: 'Property Details', street: '802 Sandpoint Ave #8201 &amp; 8202' });
  assert.equal(enrichListingFromPage(listing(url, '$6,490,000'), html2, new URL(url)).title, '802 Sandpoint Ave #8201 & 8202, Hope, ID 83836');
});

test('title-not-property: names that are not this property\'s own are never used (negative cases)', async () => {
  const { enrichListingFromPage, detailPageTitle } = await loadEngine();
  const url = 'https://brokerage.example/property/1/';
  // Already named: never replaced.
  assert.equal(detailPageTitle(listing(url, '412 Pine St, Sandpoint, ID'), detail({ url, h1: '9 Other Rd, Hope, ID 83836', street: '9 Other Rd' }), new URL(url)), undefined);
  // Another document (a redirect to search results or another property).
  assert.equal(detailPageTitle(listing(url, '$500,000'), detail({ url, h1: '9 Other Rd, Hope, ID 83836', street: '9 Other Rd' }), new URL('https://brokerage.example/search/')), undefined);
  // Several structured addresses on the page (related homes) and no located heading.
  const related = detail({ url, h1: 'Featured', street: '1 Lake Rd', extra: ld('https://brokerage.example/property/2/', '2 Lake Rd') });
  assert.equal(detailPageTitle(listing(url, '$500,000'), related, new URL(url)), undefined);
  // Chrome headings are not property names.
  assert.equal(detailPageTitle(listing(url, '$500,000'), '<h1>Welcome to Realm Partners</h1>', new URL(url)), undefined);
  // A heading that disagrees with the single structured street is not trusted; the structured address is.
  assert.equal(detailPageTitle(listing(url, '$500,000'), detail({ url, h1: '77 Unrelated Way, Boise, ID 83702', street: '1 Lake Rd' }), new URL(url)), '1 Lake Rd, Hope, ID 83836');
  // Card text around a real name still counts as a name.
  assert.equal(detailPageTitle(listing(url, 'Featured Lakeview Lodge $2,100,000'), detail({ url, h1: '1 Lake Rd, Hope, ID 83836', street: '1 Lake Rd' }), new URL(url)), undefined);
  // An unreadable/unconfirmed page leaves the item untouched (no invented address).
  const untouched = enrichListingFromPage(listing('https://brokerage.example/property/3/', '$700,000'), '<html><body><p>Not found</p></body></html>', new URL('https://brokerage.example/property/3/'));
  assert.equal(untouched.title, '$700,000');
});

test('title-not-property: the recorded Realm Partners inventory (live capture, Oct 2026) is named by its detail pages', async () => {
  // Diagnostic capture of a public site (diagnostics/discovery). Cards there carry only prices; 13 of 15
  // detail pages were recorded and name their property; 2 timed out and must keep their price, not a guess.
  const capture = readCapture(path.resolve(__dirname, '../../diagnostics/discovery/realm-partners-idaho.json.gz'));
  const { listings, missing } = await replayCapture(await loadPipeline(), capture);
  assert.deepEqual(missing, []);
  const priced = listings.filter(item => /^\$[\d,]+$/.test(item.title));
  assert.equal(listings.length, 15);
  assert.deepEqual(priced.map(item => item.sourceUrl).sort(), ['https://www.realmidaho.com/property/20261425/', 'https://www.realmidaho.com/property/20261536/']);
  const byUrl = Object.fromEntries(listings.map(item => [item.sourceUrl, item.title]));
  assert.equal(byUrl['https://www.realmidaho.com/property/20261373/'], 'Cottage Island, Hope, ID 83836');
  assert.equal(byUrl['https://www.realmidaho.com/property/20261912/'], '802 Sandpoint Ave #8404, Sandpoint, ID 83864');
});

test('title-not-property: an office or agent address published by an SEO plugin never names a listing (hardening)', async () => {
  // Found by review of a held-out Showcase IDX page (Oct 2026): its only PostalAddress belongs to a schema.org
  // Place for the brokerage office, and its listing headings are split across two <h1> elements.
  const { detailPageTitle } = await loadEngine();
  const url = 'https://agent.example/properties/listing/SEF/A12103137/FL/Ocala/';
  const office = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Place","address":{"@type":"PostalAddress","streetAddress":"1001 NW 193rd Ave","addressLocality":"Pembroke Pines","addressRegion":"FL"}},{"@type":"WebSite"}]}</script>';
  assert.equal(detailPageTitle({ title: '$249,900', sourceUrl: url }, `${office}<h1>Property Search</h1><h1>Ocala, FL 34473</h1>`, new URL(url)), undefined);
  const agent = '<script type="application/ld+json">{"@type":"RealEstateAgent","address":{"@type":"PostalAddress","streetAddress":"500 Main St","addressLocality":"Boise","addressRegion":"ID"}}</script>';
  assert.equal(detailPageTitle({ title: '$249,900', sourceUrl: url }, `${agent}<h1>Featured</h1>`, new URL(url)), undefined);
});
