// Autonomous repair mirrored-listing (Phase 9). Synthetic contracts unless stated: one listing published on
// two hosts of the same site (the agent's domain and the website platform's subdomain for that agent, same
// "/property/<listing id>/" path) is imported once. The copy that names its property keeps its URL,
// identity and attribution; the larger photo set and longer remarks of either copy are kept. Different
// listing ids, different prices, paths without a listing id and two copies on one host are not mirrors.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { loadPipeline, replayCapture, readCapture } = require('../scripts/improve/engine.cjs');

let records;
const load = async () => records ??= await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingRecords.ts'), 'utf8'))).toString('base64'));
const listing = (sourceUrl, title, extra = {}) => ({ title, sourceUrl, description: '', price: '$594,900', beds: 0, baths: 0, sqft: '', neighborhood: '', image: '', images: [], ...extra });
const photos = n => Array.from({ length: n }, (_, i) => `https://cdn.example/21382178-${i}.jpg`);

test('mirrored-listing: one listing on the site and on its platform subdomain is imported once, with the best of both', async () => {
  const { normalizeListingRecords } = await load();
  const out = normalizeListingRecords([
    listing('https://www.agent.example/property/21382178/', '7124 Chelsea Dr, North Richland Hills, TX 76180', { description: 'Updated single-story home on a corner lot.', images: photos(5), ownership: 'featured', listingOffice: 'Other Realty' }),
    listing('https://agent.platform.example/property/21382178/', '$594,900 ▼', { images: photos(26) }),
  ]);
  assert.equal(out.listings.length, 1);
  const [one] = out.listings;
  assert.equal(one.sourceUrl, 'https://www.agent.example/property/21382178/', 'the named copy keeps its URL');
  assert.equal(one.title, '7124 Chelsea Dr, North Richland Hills, TX 76180');
  assert.equal(one.ownership, 'featured', 'attribution is the kept copy\'s own, never borrowed');
  assert.equal(one.images.length, 26, 'the larger gallery of the same listing is kept');
  assert.equal(one.description, 'Updated single-story home on a corner lot.');
  assert.deepEqual(out.dropped.map(d => d.reason), ['mirrored_listing']);
});

test('mirrored-listing: records that only look alike are never merged (negative cases)', async () => {
  const { normalizeListingRecords } = await load();
  const kept = items => normalizeListingRecords(items).listings.length;
  assert.equal(kept([listing('https://www.a.example/property/21382178/', '1 Elm St, Boise, ID'), listing('https://b.example/property/21382179/', '2 Elm St, Boise, ID')]), 2, 'different listing ids');
  assert.equal(kept([listing('https://www.a.example/property/21382178/', '1 Elm St, Boise, ID'), listing('https://b.example/property/21382178/', '1 Elm St, Boise, ID', { price: '$600,000' })]), 2, 'different prices');
  assert.equal(kept([listing('https://www.a.example/featured/', 'Featured A'), listing('https://b.example/featured/', 'Featured B')]), 2, 'no listing id in the path');
  assert.equal(kept([listing('https://www.a.example/listing/1/21382178', '1 Elm St, Boise, ID'), listing('https://www.a.example/listing/2/21382178', '2 Elm St, Boise, ID')]), 2, 'different paths on one host');
});

test('mirrored-listing: the recorded Real Geeks site (live capture, Oct 2026) imports each featured listing once', async () => {
  // Level B capture of a held-out public site: every featured listing is published on the agent's domain and
  // on the agent's Real Geeks subdomain, which the site links from every page.
  const capture = readCapture(path.resolve(__dirname, '../../diagnostics/evaluation/captures/chatman-realty-group.json.gz'));
  const { listings, dropped, missing } = await replayCapture(await loadPipeline(), capture);
  assert.deepEqual(missing, []);
  // 50 mirrored pairs: 49 found only as mirrors, and 212 Utopia Ct, which the duplicate rule also matched.
  assert.equal(dropped.filter(d => d.reason === 'mirrored_listing').length, 50);
  assert.equal(listings.length, 50);
  assert.equal(new Set(listings.map(l => new URL(l.sourceUrl).pathname)).size, listings.length, 'one record per listing id');
  assert.ok(listings.every(l => !/^\$/.test(l.title)), 'every kept copy names its property');
});
