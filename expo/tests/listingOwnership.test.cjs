// Repair campaign stage 4: accuracy over quantity. Importing another agent's listings is worse than
// importing none and saying why. Synthetic contracts for each ownership rule (structural signals only),
// then the labels observed on the Oct 2026 diagnostic captures (live public responses).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, ownershipSnapshot } = require('../scripts/listing-compatibility.cjs');
const { replayDiscovery, load } = require('../scripts/replay-discovery-cpu.cjs');

let engine;
const get = async () => engine ??= await loadEngine();
const pagesFetch = pages => async uri => { if (!(uri in pages)) throw Error('The page returned 404.'); return { html: pages[uri], finalUrl: new URL(uri) }; };
const card = (n, office, base = 'https://agent.example') => `<div class="listing-card"><a href="${base}/property/${n}-pine-st">
  <img src="https://photos.example/${n}.jpg"><h3>${n} Pine St, Springfield</h3><span class="price">$${300 + n},000</span></a>
  <p>3 bd · 2 ba</p><p><span>Listing Office:</span> ${office}</p></div>`;
const site = (title, body) => `<html><head><title>${title}</title><meta property="og:site_name" content="${title}"></head><body>${body}</body></html>`;
const pager = (path, last) => `<div class="pagination"><a href="${path}?page=2">2</a><a href="${path}?page=3">3</a><a href="${path}?page=${last}">${last}</a><a rel="next" href="${path}?page=2">Next</a></div>`;

test('a paginated multi-office feed keeps only listings attributed to the site\'s own office and is not paginated further', async () => {
  const { discoverListings } = await get();
  const body = [card(1, 'Pine Realty LLC'), card(2, 'Other Brokers Inc'), card(3, 'Third Office Group'), card(4, 'Fourth Homes Co'), card(5, 'Fifth Realty')].join('') + pager('/', 900);
  const result = await discoverListings(['https://agent.example/'], pagesFetch({ 'https://agent.example/': site('Pine Realty', body) }), { maxDetailPages: 0 });
  assert.deepEqual(result.listings.map(item => [item.sourceUrl, item.ownership]), [['https://agent.example/property/1-pine-st', 'own']]);
  assert.equal(result.meta.scope.excludedOtherOffice, 4);
  assert.ok(!result.meta.visited.some(url => url.includes('page=')), 'a market feed is not paginated');
});

test('a bounded featured showcase keeps every listing and labels other offices as featured', async () => {
  const { discoverListings } = await get();
  const body = [card(1, 'Pine Realty LLC'), card(2, 'Other Brokers Inc'), card(3, 'Third Office Group')].join('');
  const result = await discoverListings(['https://agent.example/'], pagesFetch({ 'https://agent.example/': site('Pine Realty', body) }), { maxDetailPages: 0 });
  assert.deepEqual(result.listings.map(item => item.ownership).sort(), ['featured', 'featured', 'own']);
  assert.equal(result.listings.find(item => item.ownership === 'own').listingOffice, 'Pine Realty LLC');
});

test('one brokerage across a team site\'s listings is the team\'s own inventory', async () => {
  const { discoverListings } = await get();
  const body = [1, 2, 3].map(n => card(n, 'Big Brokerage LLC')).join('');
  const result = await discoverListings(['https://team.example/'], pagesFetch({ 'https://team.example/': site('The Lake Team', body.replaceAll('agent.example', 'team.example')) }), { maxDetailPages: 0 });
  assert.deepEqual(result.listings.map(item => item.ownership), ['own', 'own', 'own']);
});

test('a large paginated feed is a market even when one page shows a single office', async () => {
  const { discoverListings } = await get();
  const body = [1, 2, 3].map(n => card(n, 'Somebody Else Realty')).join('') + pager('/', 32115);
  const result = await discoverListings(['https://agent.example/'], pagesFetch({ 'https://agent.example/': site('Pine Realty', body) }), { maxDetailPages: 0 });
  assert.equal(result.listings.length, 0);
  assert.equal(result.meta.scope.excludedOtherOffice, 3);
});

test('an agent- or office-filtered request is never treated as a market feed', async () => {
  const { discoverListings, agentScopedRequest } = await get();
  assert.ok(agentScopedRequest('https://agent.example/search?agentId=123'));
  assert.ok(agentScopedRequest('https://agent.example/idx/search/?My=listings&pg=1'));
  assert.ok(agentScopedRequest('https://agent.example/api?variables=%7B%22agentIds%22%3A%5B%22e800%22%5D%7D'));
  assert.ok(!agentScopedRequest('https://agent.example/search?city=Springfield&page=2'));
  const body = [card(1, 'A Realty'), card(2, 'B Realty'), card(3, 'C Realty')].join('') + pager('/listings', 40);
  const pages = { 'https://agent.example/': site('Pine Realty', '<a href="/listings?agentId=123">Our listings</a>'), 'https://agent.example/listings?agentId=123': body };
  const result = await discoverListings(['https://agent.example/'], pagesFetch(pages), { maxDetailPages: 0 });
  assert.equal(result.listings.length, 3, 'kept: the request itself is scoped to the agent');
});

test('a person page on a multi-agent platform stays on that person\'s pages and own-inventory links', async () => {
  const { navigationInScope, seedScope } = await get();
  const scope = seedScope(new URL('https://portal.example/agents/jane-doe/'));
  assert.equal(scope.person.prefix, '/agents/jane-doe');
  assert.ok(navigationInScope('https://portal.example/agents/jane-doe/listings', scope, 'Listings'));
  assert.ok(navigationInScope('https://portal.example/search?agent=jane-doe', scope, 'Search'));
  assert.ok(navigationInScope('https://portal.example/my-listings', scope, 'My listings'));
  assert.ok(!navigationInScope('https://portal.example/homes-for-sale/', scope, 'Homes for sale'));
  assert.ok(!navigationInScope('https://portal.example/coming-soon/listings/', scope, 'Coming soon'));
  assert.ok(!navigationInScope('https://crm-vendor.example/', scope, 'Partner'));
  const id = seedScope(new URL('https://broker.example/sc/town/agent/jane-doe/aid_302773/'));
  assert.equal(id.person.prefix, '/sc/town/agent/jane-doe/aid_302773');
  assert.ok(navigationInScope('https://broker.example/listings?aid=302773', id, 'Listings'));
});

test('another company\'s homepage is never followed as inventory; deep partner pages and agent subdomains still are', async () => {
  const { navigationInScope, seedScope } = await get();
  const scope = seedScope(new URL('https://agent.example/'));
  assert.ok(!navigationInScope('https://www.idx-vendor.example/', scope, 'Powered by IDX'));
  assert.ok(!navigationInScope('https://www.brokerage.example/index.html', scope, 'Search listings'));
  assert.ok(navigationInScope('https://partner.example/agent', scope, 'View properties'));
  assert.ok(navigationInScope('https://jane.brokerage.example/', scope, 'My listings'));
  assert.ok(navigationInScope('https://agent.example/', scope, 'Home'));
});

const dir = path.resolve(__dirname, '../../diagnostics/discovery');
const observed = {
  // site: [own, featured] counts from the captured pages (live responses)
  'houses-of-kansas-city': [0, 10], // agent-filtered query; detail pages name four other brokerages
  'realm-partners-idaho': [13, 0],
  'ryan-realty': [0, 36],
  'woods-n-water-real-estate': [1, 0],
};
for (const [id, [own, featured]] of Object.entries(observed)) {
  test(`${id}: ownership labels from the captured pages`, { skip: !fs.existsSync(path.join(dir, `${id}.json.gz`)) }, async () => {
    const result = await replayDiscovery(await get(), load(path.join(dir, `${id}.json.gz`)));
    const labels = ownershipSnapshot(result.result);
    assert.equal(labels.filter(item => item.ownership === 'own').length, own);
    assert.equal(labels.filter(item => item.ownership === 'featured').length, featured);
  });
}

test('the import screen says what was left out and what is shown as featured', () => {
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(__dirname, '../lib/importProgress.ts'), 'utf8');
  const moduleRef = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(moduleRef, moduleRef.exports);
  const [line] = moduleRef.exports.applyImportEvent([], 'listings', { kind: 'scope', excluded: 96, featured: 2, at: 1 });
  assert.equal(line.text, 'Left out 96 listings from other brokerages · 2 listings from other offices will be shown as featured, not as yours');
  assert.equal(line.state, 'note');
});

test('featured listings are labelled in the client app and the listings manager', () => {
  const client = fs.readFileSync(path.join(__dirname, '../components/CuratedListings.tsx'), 'utf8');
  assert.match(client, /item\.ownership === "featured"/);
  assert.match(client, /Listing courtesy of \{item\.listingOffice\}/);
  assert.match(fs.readFileSync(path.join(__dirname, '../app/admin/listings.tsx'), 'utf8'), /Featured · listed by/);
});
