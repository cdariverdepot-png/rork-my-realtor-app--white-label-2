const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../supabase/functions');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function runtime({ fetchFixture, database, env = {} } = {}) {
  const cache = new Map(); let handler;
  const deno = { env: { get: name => env[name] }, resolveDns: async () => ['8.8.8.8'], serve: fn => { handler = fn; } };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    new Function('require', 'module', 'exports', 'Deno', 'fetch', compile(fs.readFileSync(file, 'utf8')))(id => {
      if (id.startsWith('npm:')) return { createClient: () => database };
      return load(path.resolve(path.dirname(file), id));
    }, module, module.exports, deno, fetchFixture ?? (() => { throw Error('Unexpected network'); }));
    return module.exports;
  }
  return { load: name => load(path.join(root, name)), handler: () => handler };
}
const pure = runtime();
const discovery = pure.load('analyze-realtor-build/listingDiscovery.ts');
const sync = pure.load('refresh-listings/sync.ts');
const sources = pure.load('refresh-listings/sources.ts');
const normalization = pure.load('refresh-listings/normalizePage.ts');
const source = { id: 'source', url: 'https://agent.example/my-listings', submittedUrl: 'https://agent.example/', kind: 'agent-website',
  inventoryUrls: ['https://agent.example/my-listings'], connectedAt: 1, nextSyncAt: 0, state: 'connected', listingCount: 1 };
const home = (n = 12, status = 'Active', price = 350000) => ({ '@type': 'RealEstateListing', name: `${n} Pine St`,
  url: `https://agent.example/property/${n}`, price, StandardStatus: status, image: `https://photos.example/${n}.jpg`,
  bedrooms: 3, bathrooms: 2, listingNumber: `MLS-${n}`, propertyType: 'Residential' });
const html = records => `<script type="application/ld+json">${JSON.stringify(records)}</script>`;
const fetchPages = pages => async uri => { if (!(uri in pages)) throw Error('Cannot read page'); return { html: pages[uri], finalUrl: new URL(uri) }; };

test('maps explicit MLS states without detecting sold from unrelated prose', () => {
  for (const [label, status] of [['Closed', 'sold'], ['Active Under Contract', 'contingent'], ['Pending', 'pending'], ['Expired', 'off_market'], ['Active', 'active']]) {
    assert.equal(discovery.normalizeListingStatus(label), status);
  }
  assert.equal(discovery.normalizeListingStatus('Our team sold 80 homes'), undefined);
  const page = html([home(12, 'Pending'), home(25, 'Sold')]) + '<footer>Sold homes · Active listings</footer>';
  const listings = discovery.extractListingsFromPage(page, new URL(source.url));
  assert.equal(listings.find(item => item.title === '12 Pine St').status, 'pending');
  assert.equal(listings.find(item => item.title === '25 Pine St').status, 'sold');
  assert.equal(listings.find(item => item.title === '12 Pine St').listingNumber, 'MLS-12');
  assert.equal(discovery.statusForProperty('<h1>12 Pine St</h1><p>A kitchen sold on its charm.</p><h2>Related homes</h2><span class="listing-status">Sold</span>', { title: '12 Pine St', sourceUrl: home().url }, new URL(home().url)), undefined);
});

test('unconfirmed or inaccessible pages preserve previous status and use retry backoff', () => {
  const item = { id: 'home', title: '12 Pine St', sourceUrl: home().url, status: 'pending', lastRefreshedAt: 5, elizaTake: 'Personal note', hidden: true };
  const failed = sync.applyObservation(item, { sourceUrl: item.sourceUrl, checkedAt: 100, error: 'Blocked' });
  assert.equal(failed.status, 'pending'); assert.equal(failed.lastRefreshedAt, 5); assert.equal(failed.syncState, 'unavailable');
  assert.equal(failed.nextSyncAt, 100 + 30 * 60 * 1000);
  const unknown = sync.applyObservation(item, { sourceUrl: item.sourceUrl, checkedAt: 100, property: { ...home(), title: '12 Pine St', price: '$340,000', images: [], beds: 0, baths: 0, sqft: '', neighborhood: '', sourceUrl: item.sourceUrl } });
  assert.equal(unknown.status, 'pending'); assert.equal(unknown.syncState, 'status-unconfirmed'); assert.equal(unknown.elizaTake, 'Personal note'); assert.equal(unknown.hidden, true);
  assert.equal(sync.syncInterval('pending'), 2 * 60 * 60 * 1000); assert.equal(sync.syncInterval('sold'), 24 * 60 * 60 * 1000);
});

test('detects providers automatically and resolves a property to an observed agent inventory', async () => {
  assert.equal(sources.detectSourceKind('https://my.flexmls.com/Agent/search'), 'flexmls');
  assert.equal(sources.detectSourceKind('https://www.zillow.com/profile/Agent'), 'zillow');
  assert.equal(sources.detectSourceKind('https://www.realtor.com/realestateagents/Agent'), 'realtor.com');
  const pages = { [home().url]: html(home()) + '<a href="/agents/cindy">View agent profile</a>',
    'https://agent.example/agents/cindy': '<a href="/my-listings">My listings</a>', [source.url]: html([home(), home(25)]) };
  const connected = await sources.readSource(home().url, fetchPages(pages));
  assert.equal(connected.source.url, 'https://agent.example/agents/cindy');
  assert.equal(connected.source.submittedUrl, home().url); assert.equal(connected.listings.length, 2);
  await assert.rejects(sources.readSource(home().url, fetchPages({ [home().url]: html(home()) })), /one property.*all of your listings/);
});

test('generic property search cannot become a single-home associated source', async () => {
  const pages = { [home().url]: html(home()) + '<a href="/listings">All listings</a>', 'https://agent.example/listings': html([home(), home(25)]) };
  await assert.rejects(sources.readSource(home().url, fetchPages(pages)), /one property/);
});

test('source reconciliation adds and updates silently while preserving manual notes and hidden state', () => {
  const initial = sources.reconcileInventory([], { source, listings: discovery.extractListingsFromPage(html(home()), new URL(source.url)), complete: true }, 10);
  initial[0].elizaTake = 'My personal take'; initial[0].hidden = true;
  const id = initial[0].id;
  const next = sources.reconcileInventory(initial, { source, listings: discovery.extractListingsFromPage(html([home(12, 'Pending', 330000), home(25)]), new URL(source.url)), complete: true }, 20);
  assert.equal(next.length, 2); assert.equal(next[0].id, id); assert.equal(next[0].price, '$330,000'); assert.equal(next[0].status, 'pending');
  assert.equal(next[0].elizaTake, 'My personal take'); assert.equal(next[0].hidden, true); assert.equal(next[0].listingNumber, 'MLS-12');
  const repeated = sources.reconcileInventory(next, { source, listings: discovery.extractListingsFromPage(html([home(12, 'Pending', 330000), home(25)]), new URL(source.url)), complete: true }, 30);
  assert.equal(repeated.length, 2); assert.equal(repeated[0].updatedAt, 20, 'unchanged checks do not invalidate photo cache');
});

test('archives only after two complete snapshots two hours apart and restores reappearing homes', () => {
  const inventory = { source, listings: discovery.extractListingsFromPage(html(home()), new URL(source.url)), complete: true };
  const initial = sources.reconcileInventory([], inventory, 10);
  const missing = { source, listings: [], complete: true };
  assert.equal(sources.reconcileInventory(initial, { ...missing, complete: false }, 20)[0].sourceMissingCount, 0);
  const first = sources.reconcileInventory(initial, missing, 20);
  assert.equal(first[0].sourceArchived, false); assert.equal(first[0].status, 'active');
  const tooSoon = sources.reconcileInventory(first, missing, 50);
  assert.equal(tooSoon[0].sourceMissingCount, 1);
  const archived = sources.reconcileInventory(first, missing, 7_200_020);
  assert.equal(archived[0].sourceArchived, true); assert.equal(archived[0].status, 'active', 'absence is never guessed to mean sold');
  assert.equal(sources.reconcileInventory(archived, inventory, 8_000_000)[0].sourceArchived, false);
});

test('an empty snapshot requires explicit zero inventory rather than an unreadable page', async () => {
  const empty = await sources.readSource(source.url, fetchPages({ [source.url]: '<h1>My Listings</h1><p>No active listings</p>' }), source);
  assert.equal(empty.complete, true); assert.deepEqual(empty.listings, []);
  await assert.rejects(sources.readSource(source.url, fetchPages({ [source.url]: '<h1>Sign in</h1>' }), source), /couldn’t find/);
});

test('two records sharing an inventory URL stay distinct and do not produce invented photos', () => {
  const records = [home(), home(25)].map(item => ({ ...item, url: source.url, image: undefined }));
  const result = sources.reconcileInventory([], { source, listings: discovery.extractListingsFromPage(html(records), new URL(source.url)), complete: true }, 1);
  assert.equal(result.length, 2); assert.equal(new Set(result.map(item => item.id)).size, 2);
  assert.equal(result[0].image, ''); assert.deepEqual(result[0].images, []);
});

test('AI normalization rejects fabricated evidence, URLs, values and unknown counts', () => {
  const evidence = '<article>12 Pine St <span>$350,000</span> 3 beds 2 baths <a href="/property/12">Details</a><img src="https://photos.example/12.jpg"></article>';
  const record = { title: '12 Pine St', evidence, price: '$350,000', sourceUrl: '/property/12', beds: 3, baths: 2, images: ['https://photos.example/12.jpg'], description: '', sqft: '', neighborhood: '', listingNumber: '', propertyType: '' };
  const result = normalization.validateNormalizedRecords([record], evidence, new URL(source.url));
  assert.equal(result.length, 1); assert.equal(result[0].beds, 3); assert.equal(result[0].status, undefined);
  assert.equal(normalization.validateNormalizedRecords([{ ...record, evidence: 'invented' }], evidence, new URL(source.url)).length, 0);
  assert.equal(normalization.validateNormalizedRecords([{ ...record, sourceUrl: 'https://invented.example/12' }], evidence, new URL(source.url)).length, 0);
  assert.equal(normalization.validateNormalizedRecords([{ ...record, price: '$900,000' }], evidence, new URL(source.url)).length, 0);
  assert.equal(normalization.validateNormalizedRecords([{ ...record, beds: 9 }], evidence, new URL(source.url))[0].beds, 0);
});

test('robots rules prefer a specific crawler group and longest matching allow path', () => {
  const { robotsAllows } = pure.load('refresh-listings/publicPage.ts');
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /public/', '/public/listings'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/listings'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\nUser-agent: MyRealtorAppBuilder\nAllow: /', '/listings'), true);
});

function fakeDatabase({ rows = {}, auth = true, conflict = false, serviceActive = true } = {}) {
  const reads = [], writes = []; let conflictSeen = false;
  const db = { rpc:async()=>({data:serviceActive,error:null}), auth: { getUser: async () => ({ data: { user: auth ? { id: 'user', email_confirmed_at: 'now' } : null } }) }, from: table => {
    let operation = 'select', payload, filters = {};
    const query = {
      select: () => query, eq: (name, value) => { filters[name] = value; return query; },
      update: value => { operation = 'update'; payload = value; return query; },
      insert: value => { operation = 'insert'; payload = value; return query; },
      maybeSingle: async () => {
        reads.push({ table, filters: { ...filters } });
        if (table === 'realtors') return { data: { id: '11111111-1111-1111-1111-111111111111' } };
        return { data: rows[filters.key] ? structuredClone(rows[filters.key]) : null };
      },
      then: (resolve, reject) => Promise.resolve().then(() => {
        const key = payload?.key ?? filters.key;
        if (operation === 'insert') {
          if (rows[key]) return { error: { code: '23505' } };
          rows[key] = structuredClone(payload); writes.push({ key }); return {};
        }
        if (conflict && !conflictSeen && key.endsWith(':listings.v2')) {
          conflictSeen = true; rows[key].rev++;
          rows[key].value.items.push({ id: 'editor-add', title: 'Editor addition', hidden: true }); return { data: [] };
        }
        if (rows[key]?.rev !== filters.rev) return { data: [] };
        rows[key] = { ...rows[key], ...structuredClone(payload) }; writes.push({ key }); return { data: [{ key }] };
      }).then(resolve, reject),
    }; return query;
  } };
  return { db, rows, reads, writes };
}

async function endpoint({ body = {}, auth = true, headers = {}, pages = {}, rows = {}, conflict = false, serviceActive = true } = {}) {
  const database = fakeDatabase({ rows, auth, conflict, serviceActive }); let fetched = 0;
  const r = runtime({ database: database.db, env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private', LISTING_SYNC_TOKEN: 'scheduler-secret' },
    fetchFixture: async uri => {
      fetched++; const url = String(uri);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /', { headers: { 'Content-Type': 'text/plain' } });
      if (!(url in pages)) return new Response('Not found', { status: 404 });
      return new Response(pages[url], { headers: { 'Content-Type': 'text/html' } });
    } });
  r.load('refresh-listings/index.ts');
  const response = await r.handler()(new Request('https://project.supabase.co/functions/v1/refresh-listings', { method: 'POST',
    headers: { Authorization: 'Bearer account', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));
  return { status: response.status, result: await response.json(), ...database, fetched };
}

test('real endpoint saves a scoped persistent source and listings using account ownership', async () => {
  const result = await endpoint({ body: { mode: 'connect', url: source.url }, pages: { [source.url]: html([home(), home(25)]), [home().url]: html(home()), [home(25).url]: html(home(25)) } });
  assert.equal(result.status, 200); assert.equal(result.result.imported, 2);
  const keys = Object.keys(result.rows);
  assert.ok(keys.includes('11111111-1111-1111-1111-111111111111:listing-sources.v1'));
  assert.ok(keys.includes('11111111-1111-1111-1111-111111111111:listings.v2'));
  assert.ok(result.rows[keys.find(key => key.endsWith(':listing-sources.v1'))].value.sources[0].nextSyncAt > Date.now());
  assert.ok(result.result.items.every(item => item.sourceId));
});

test('endpoint rejects invalid scheduler credentials, anonymous auth and foreign realtor scope before URL fetches', async () => {
  for (const args of [
    { headers: { 'x-listing-sync-token': 'wrong' } }, { auth: false },
    { body: { realtorId: '22222222-2222-2222-2222-222222222222' } },
  ]) {
    const result = await endpoint(args);
    assert.ok([401, 403].includes(result.status)); assert.equal(result.fetched, 0); assert.equal(result.writes.length, 0);
  }
});
test('inactive accounts cannot refresh inventory directly or through the scheduler',async()=>{
 for(const args of [{},{body:{realtorId:'11111111-1111-1111-1111-111111111111'},headers:{'x-listing-sync-token':'scheduler-secret'}}]){
  const r=await endpoint({...args,serviceActive:false});assert.equal(r.status,403);assert.equal(r.fetched,0);assert.equal(r.writes.length,0);
 }
});

test('scheduled inventory sync adds new homes while CAS retries preserve concurrent editor additions', async () => {
  const scope = '11111111-1111-1111-1111-111111111111';
  const rows = { [scope + ':listing-sources.v1']: { rev: 1, value: { sources: [source] } },
    [scope + ':listings.v2']: { rev: 1, value: { items: [{ id: 'old', title: '12 Pine St', sourceUrl: home().url, sourceId: source.id, status: 'active', elizaTake: 'Personal copy', hidden: false }] } } };
  const result = await endpoint({ body: { realtorId: scope, sourceId: source.id }, headers: { 'x-listing-sync-token': 'scheduler-secret' }, rows, conflict: true,
    pages: { [source.url]: html([home(12, 'Sold'), home(25)]), [home().url]: html(home(12, 'Sold')), [home(25).url]: html(home(25)) } });
  assert.equal(result.status, 200); assert.equal(result.result.items.length, 3);
  assert.equal(result.result.items.find(item => item.id === 'old').status, 'sold');
  assert.equal(result.result.items.find(item => item.id === 'old').elizaTake, 'Personal copy');
  assert.ok(result.result.items.some(item => item.id === 'editor-add'));
});

test('a failed scheduled source preserves inventory and records an actionable retry state', async () => {
  const scope = '11111111-1111-1111-1111-111111111111';
  const items = [{ id: 'old', title: '12 Pine St', sourceUrl: home().url, sourceId: source.id, status: 'active' }];
  const rows = { [scope + ':listing-sources.v1']: { rev: 1, value: { sources: [source] } }, [scope + ':listings.v2']: { rev: 1, value: { items } } };
  const result = await endpoint({ body: { realtorId: scope, sourceId: source.id }, headers: { 'x-listing-sync-token': 'scheduler-secret' }, rows });
  assert.equal(result.status, 422); assert.deepEqual(result.rows[scope + ':listings.v2'].value.items, items);
  const stored = result.rows[scope + ':listing-sources.v1'].value.sources[0];
  assert.equal(stored.state, 'unavailable'); assert.ok(stored.nextSyncAt > Date.now());
});
