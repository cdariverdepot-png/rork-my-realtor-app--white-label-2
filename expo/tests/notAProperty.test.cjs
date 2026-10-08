// Autonomous repair not-a-property (Phase 9). Synthetic contracts unless stated: a social-media post, profile
// or video picked up from a feed widget on a listings page is never imported as a property. Property pages
// on the agent's own or IDX hosts, and properties whose remarks mention social media, are kept.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { loadPipeline, replayCapture, readCapture } = require('../scripts/improve/engine.cjs');

let records;
const load = async () => records ??= await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingRecords.ts'), 'utf8'))).toString('base64'));
const listing = (sourceUrl, title, extra = {}) => ({ title, sourceUrl, description: '', price: '', beds: 0, baths: 0, sqft: '', neighborhood: '', image: '', images: [], ...extra });

test('not-a-property: social posts, profiles and videos are dropped with a reason', async () => {
  const { normalizeListingRecords } = await load();
  const out = normalizeListingRecords([
    listing('https://www.instagram.com/p/DeAMNvJjKI7/', 'cameronteam', { description: 'Just listed! Swipe through this coastal beauty…', images: ['https://scontent.cdninstagram.com/a.jpg'] }),
    listing('https://www.facebook.com/agent/posts/123', 'Open house Saturday'),
    listing('https://youtu.be/abc123', 'Home tour'),
    listing('https://m.youtube.com/watch?v=abc123', 'Home tour'),
  ]);
  assert.equal(out.listings.length, 0);
  assert.deepEqual(out.dropped.map(d => d.reason), ['not_a_property', 'not_a_property', 'not_a_property', 'not_a_property']);
});

test('not-a-property: real property pages are kept (negative cases)', async () => {
  const { normalizeListingRecords } = await load();
  const out = normalizeListingRecords([
    listing('https://thecameronteam.net/idx/listing/123456/1-ocean-dr', '1 Ocean Dr, Wilmington, NC', { price: '$500,000', description: 'See the video tour on our Instagram and YouTube.' }),
    listing('https://www.instagramproperties.example/listing/5/', '5 Pine St, Boise, ID', { price: '$400,000' }),
    listing('https://matrix.example/property/xyz', '7 Bay Rd, Tampa, FL', { price: '$300,000' }),
  ]);
  assert.equal(out.listings.length, 3);
});

test('not-a-property: the recorded AgentFire site (Level B capture, Oct 2026) imports no Instagram post', async () => {
  const capture = readCapture(path.resolve(__dirname, '../../diagnostics/evaluation/captures/the-cameron-team.json.gz'));
  const { listings, dropped, missing } = await replayCapture(await loadPipeline(), capture);
  assert.deepEqual(missing, []);
  assert.ok(listings.every(l => !/instagram\.com/.test(l.sourceUrl)));
  assert.ok(dropped.some(d => d.reason === 'not_a_property' && /instagram\.com/.test(d.sourceUrl)));
});
