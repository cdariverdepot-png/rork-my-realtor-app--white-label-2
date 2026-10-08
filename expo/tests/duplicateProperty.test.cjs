// Autonomous repair duplicate-property (Phase 9). Synthetic contracts unless stated: one property published
// under two listing ids (a relisting, or one home entered in two MLS classes) is imported once. The same
// named property, the same price, and the same remarks or lead photo. Distinct units, a parcel listed as a
// house and as land at different prices, unnamed (price/card) titles and records without a price are kept apart.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { loadPipeline, replayCapture, readCapture } = require('../scripts/improve/engine.cjs');

let records;
const load = async () => records ??= await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingRecords.ts'), 'utf8'))).toString('base64'));
const remarks = 'Light-filled craftsman on a quiet street with a fenced yard, updated kitchen and a finished basement.';
const listing = (sourceUrl, title, extra = {}) => ({ title, sourceUrl, description: remarks, price: '$679,900', beds: 3, baths: 2, sqft: '', neighborhood: '',
  image: '', images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'], ...extra });

test('duplicate-property: one property under two listing ids is imported once, keeping the richer, newer record', async () => {
  const { normalizeListingRecords } = await load();
  const out = normalizeListingRecords([
    listing('https://agent.example/homes-for-sale-details/14035-DENSMORE-AVE/2488935/26/', '14035 Densmore Avenue N Seattle, WA 98133', { images: ['https://cdn.example/x.jpg'] }),
    listing('https://agent.example/homes-for-sale-details/14035-DENSMORE-AVE/2513298/26/', '14035 Densmore Avenue N Seattle, WA 98133', { images: ['https://cdn.example/y.jpg'] }),
  ]);
  assert.equal(out.listings.length, 1);
  assert.match(out.listings[0].sourceUrl, /2513298/, 'equal records: the newer listing id is kept');
  assert.deepEqual(out.dropped.map(d => d.reason), ['duplicate_property']);
  // Two MLS classes (house and commercial): different remarks, same lead photo and price.
  const classes = normalizeListingRecords([
    listing('https://agent.example/d/3160-NINE-MILE-RD/219441/309/', '3160 Nine Mile Rd', { price: '$465,000', description: 'Rare opportunity offering multiple living spaces.', propertyType: 'House' }),
    listing('https://agent.example/d/3160-NINE-MILE-RD/219855/309/', '3160 Nine Mile Rd', { price: '$465,000', description: 'Rare opportunity to own a versatile income-producing property.', propertyType: 'Commercial', images: ['https://cdn.example/a.jpg'] }),
  ]);
  assert.equal(classes.listings.length, 1);
  assert.equal(classes.listings[0].propertyType, 'House', 'the richer record (more photos) is kept');
  // The attributed record wins over an unattributed copy.
  const owned = normalizeListingRecords([
    listing('https://agent.example/p/1/', '1 Elm St, Boise, ID 83702'),
    listing('https://agent.example/p/2/', '1 Elm St, Boise, ID 83702', { ownership: 'own', listingOffice: 'Agent Realty', images: ['https://cdn.example/a.jpg'] }),
  ]);
  assert.equal(owned.listings.length, 1);
  assert.equal(owned.listings[0].ownership, 'own');
});

test('duplicate-property: different properties that look alike are never merged (negative cases)', async () => {
  const { normalizeListingRecords } = await load();
  const kept = items => normalizeListingRecords(items).listings.length;
  assert.equal(kept([listing('https://a.example/1/', '1017 Minor Ave #1401 Seattle, WA'), listing('https://a.example/2/', '1017 Minor Ave #1402 Seattle, WA')]), 2, 'distinct units');
  assert.equal(kept([listing('https://a.example/1/', '172 Elk Hills Rd, Sandpoint, ID', { price: '$4,950,000' }), listing('https://a.example/2/', '172 Elk Hills Rd, Sandpoint, ID', { price: '$3,200,000' })]), 2, 'one parcel, two listings at different prices');
  assert.equal(kept([listing('https://a.example/1/', '$679,900'), listing('https://a.example/2/', '$679,900')]), 2, 'unnamed titles are never merged');
  assert.equal(kept([listing('https://a.example/1/', '9 Oak St, Moscow, ID', { description: 'A different home description entirely, with its own remarks.', images: ['https://cdn.example/1.jpg'] }),
    listing('https://a.example/2/', '9 Oak St, Moscow, ID', { description: 'Another listing at this address with other remarks and photos.', images: ['https://cdn.example/2.jpg'] })]), 2, 'same address and price, different remarks and photos');
  assert.equal(kept([listing('https://a.example/1/', '9 Oak St, Moscow, ID', { price: '' }), listing('https://a.example/2/', '9 Oak St, Moscow, ID', { price: '' })]), 2, 'no price, no merge');
  assert.equal(kept([listing('https://a.example/1/', '9 Oak St', { neighborhood: 'Moscow, ID' }), listing('https://a.example/2/', '9 Oak St', { neighborhood: 'Boise, ID' })]), 2, 'same street in different towns');
});

test('duplicate-property: the recorded inventories (live captures, Oct 2026) import each property once', async () => {
  // Diagnostic captures of public sites (diagnostics/discovery). Each merged pair is the same title and price.
  const pipeline = await loadPipeline();
  for (const [id, expected] of [['katerina-sayles', 10], ['redman-realty-group', 90]]) {
    const capture = readCapture(path.resolve(__dirname, `../../diagnostics/discovery/${id}.json.gz`));
    const { listings, dropped, missing } = await replayCapture(pipeline, capture);
    assert.deepEqual(missing, []);
    assert.equal(listings.length, expected, id);
    const merged = dropped.filter(d => d.reason === 'duplicate_property');
    assert.equal(merged.length, { 'katerina-sayles': 2, 'redman-realty-group': 10 }[id]);
    for (const d of merged) assert.ok(listings.some(l => l.title === d.title), `${id}: ${d.title} is still imported once`);
  }
});
