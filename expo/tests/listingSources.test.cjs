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

test('direct property source imports retain architectural strategy evidence', async () => {
  const uri = home().url;
  const result = await sources.readSource(uri, fetchPages({ [uri]: html(home()) }), undefined, async () => []);
  assert.equal(result.listings.length, 1);
  assert.equal(result.meta.compatibility.pages[0].resolution, 'known-pattern');
  assert.ok(result.meta.compatibility.pages[0].attempts.some(a => a.id === 'json-ld' && a.outcome === 'extracted'));
  assert.equal(result.complete, false, 'A single property cannot establish complete inventory');
});

test('source imports enrich all nine properties rather than only the first six',async()=>{
  const url='https://agent.example/my-listings',pages={[url]:html(Array.from({length:9},(_,i)=>home(i+1)))};
  for(let i=1;i<=9;i++)pages[`https://agent.example/property/${i}`]=html({...home(i),description:`Complete remarks for home ${i}`,image:Array.from({length:20},(_,j)=>`https://photos.example/${i}-${j}.jpg`)});
  const result=await sources.readSource(url,fetchPages(pages),undefined,async()=>[]);
  assert.equal(result.listings.length,9);assert.ok(result.listings.every(l=>l.images.length===20&&l.description&&l.detailsComplete));
});

test('scheduled thin observations cannot downgrade a saved property gallery or remarks',()=>{
  const item={id:'home',title:'12 Pine St',sourceUrl:'https://agent.example/property/12',images:['cover','kitchen','bedroom'],description:'Full remarks about this property.',facts:{'Year Built':'1920'}};
  const thin={title:item.title,sourceUrl:item.sourceUrl,images:['cover'],description:'Short teaser',price:'$350,000'};
  const merged=sync.applyObservation(item,{sourceUrl:item.sourceUrl,checkedAt:100,property:thin});
  assert.deepEqual(merged.images,item.images);assert.equal(merged.description,item.description);assert.deepEqual(merged.facts,item.facts);
});

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
  const single = await sources.readSource(home().url, fetchPages({ [home().url]: html(home()) }));
  assert.equal(single.listings.length, 1); assert.equal(single.source.url, home().url); assert.equal(single.complete, false);
});

test('generic property search cannot become a single-home associated source', async () => {
  const pages = { [home().url]: html(home()) + '<a href="/listings">All listings</a>', 'https://agent.example/listings': html([home(), home(25)]) };
  const single = await sources.readSource(home().url, fetchPages(pages));
  assert.equal(single.listings.length, 1); assert.equal(single.source.url, home().url);
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

function fakeDatabase({ rows = {}, auth = true, conflict = false, owner = true, serviceActive = true } = {}) {
  const reads = [], writes = []; let conflictSeen = false;
  const db = { rpc:async()=>({data:serviceActive,error:null}), auth: { getUser: async () => ({ data: { user: auth === true ? { id: 'user', email_confirmed_at: 'now' } : auth || null } }) }, from: table => {
    let operation = 'select', payload, filters = {};
    const query = {
      select: () => query, eq: (name, value) => { filters[name] = value; return query; },
      update: value => { operation = 'update'; payload = value; return query; },
      insert: value => { operation = 'insert'; payload = value; return query; },
      maybeSingle: async () => {
        reads.push({ table, filters: { ...filters } });
        if (table === 'realtors') return { data: owner ? { id: '11111111-1111-1111-1111-111111111111' } : null };
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

async function endpoint({ body = {}, auth = true, headers = {}, pages = {}, rows = {}, conflict = false, owner = true, serviceActive = true } = {}) {
  const database = fakeDatabase({ rows, auth, conflict, owner, serviceActive }); let fetched = 0;
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

test('endpoint rejects invalid scheduler credentials, missing auth and foreign realtor scope before URL fetches', async () => {
  for (const args of [
    { headers: { 'x-listing-sync-token': 'wrong' } }, { auth: false },
    { body: { realtorId: '22222222-2222-2222-2222-222222222222' } },
  ]) {
    const result = await endpoint(args);
    assert.ok([401, 403].includes(result.status)); assert.equal(result.fetched, 0); assert.equal(result.writes.length, 0);
  }
});

test('subscription state never changes listing import or scheduled refresh outcomes',async()=>{
 // Listing import is app setup/editing, not a paid service action (see refresh-listings/index.ts).
 for(const args of [{},{body:{realtorId:'11111111-1111-1111-1111-111111111111'},headers:{'x-listing-sync-token':'scheduler-secret'}}]){
  const active=await endpoint({...args,serviceActive:true}),inactive=await endpoint({...args,serviceActive:false});
  assert.notEqual(inactive.status,403);assert.equal(inactive.status,active.status);assert.equal(inactive.fetched,active.fetched);assert.equal(inactive.writes.length,active.writes.length);
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

test('code-created anonymous owners import actual prices and images; client sessions cannot import', async () => {
  const auth = { id: 'guest-owner', is_anonymous: true };
  const args = { auth, body: { mode: 'connect', url: home().url, realtorId: '11111111-1111-1111-1111-111111111111' }, pages: { [home().url]: html(home()) } };
  const saved = await endpoint(args);
  assert.equal(saved.status, 200); assert.equal(saved.result.imported, 1);
  const items = saved.rows['11111111-1111-1111-1111-111111111111:listings.v2'].value.items;
  assert.equal(items[0].title, '12 Pine St'); assert.equal(items[0].price, '$350,000');
  assert.equal(items[0].beds, 3); assert.equal(items[0].baths, 2);
  assert.ok(items[0].images.includes('https://photos.example/12.jpg'));
  assert.equal(saved.reads.find(r => r.table === 'realtors').filters.auth_user_id, 'guest-owner');
  for (const deniedArgs of [{ ...args, owner: false }, { ...args, body: { ...args.body, realtorId: 'other-owner' } }, { ...args, auth: { id: 'unverified' } }]) {
    const denied = await endpoint(deniedArgs); assert.ok([401,403].includes(denied.status));
    assert.equal(denied.fetched, 0); assert.equal(denied.writes.length, 0);
  }
});

test('a public IDX search is accepted as a source without website ownership restrictions', async () => {
  const url='https://public-idx.example/search';
  const result=await endpoint({body:{mode:'connect',url},pages:{[url]:'<h1>Search all homes</h1>'+html([home(),home(25)]),[home().url]:html(home()),[home(25).url]:html(home(25))}});
  assert.equal(result.status,200); assert.equal(result.result.imported,2);
});

test('failed extraction reports the page failure without changing the account inventory', async () => {
  const scope='11111111-1111-1111-1111-111111111111:listings.v2';
  const items=[{id:'existing',title:'Existing home',price:'$200,000'}];
  const result=await endpoint({body:{mode:'connect',url:'https://empty.example/'},pages:{'https://empty.example/':'<h1>Welcome</h1>'},rows:{[scope]:{rev:1,value:{items}}}});
  assert.equal(result.status,422); assert.match(result.result.error,/couldn.t find.*listings/i);
  assert.doesNotMatch(result.result.error,/sign in|realtor account/i); assert.deepEqual(result.rows[scope].value.items,items);
});

test('a Flexmls selected-property shell follows its public filtered photo collection', async () => {
  const root='https://my.flexmls.com/Agent/search/office_listing_categories/Active/listings/20260226190717870344000000?from_filter=false';
  const fragments=discovery.collectInventoryFragments('<h3>Loading...</h3>',new URL(root));
  assert.equal(fragments.length,1); const fragment=new URL(fragments[0]);
  assert.equal(fragment.pathname,'/Agent/search/office_listing_categories/Active/listings');
  assert.equal(fragment.searchParams.get('list_view'),'photo');
  const inventory=await sources.readSource(root,fetchPages({[root]:'<h3>Loading...</h3>',[fragment.toString()]:html(home())}));
  assert.equal(inventory.listings[0].price,'$350,000'); assert.equal(inventory.listings[0].image,'https://photos.example/12.jpg');
});


test('94-property inventories enrich every home within the shared source budget',async()=>{
 const url='https://large.example/my-listings',records=Array.from({length:94},(_,i)=>({...home(i+1),url:'https://large.example/property/'+(i+1)}));
 const pages={[url]:html(records)};
 records.forEach((record,i)=>{pages[record.url]=html({...record,description:'Full property remarks '+i,image:['https://photos.example/'+i+'a.jpg','https://photos.example/'+i+'b.jpg']});});
 const result=await sources.readSource(url,fetchPages(pages),undefined,async()=>[]);
 assert.equal(result.listings.length,94);assert.ok(result.listings.every(l=>l.images.length===2&&l.description&&l.detailsComplete));
});

test('public listing pages with optional password forms and footer captcha remain readable',async()=>{
 const rt=runtime({fetchFixture:async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':'<title>Homes for sale</title><h1>12 Pine St</h1><footer><input type="password"><script src="recaptcha.js"></script></footer>',{headers:{'content-type':'text/html'}})});
 assert.match((await rt.load('refresh-listings/publicPage.ts').fetchHtml('https://public.example/property/12')).html,/12 Pine/);
});

test('actual challenge pages and login routes remain blocked',async()=>{
 const rt=runtime({fetchFixture:async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':'<title>Just a moment...</title><form id="challenge-form"></form>',{headers:{'content-type':'text/html'}})});
 await assert.rejects(()=>rt.load('refresh-listings/publicPage.ts').fetchHtml('https://challenge.example/property/12'),/blocks automatic access/);
});

test('Brivity component exposes full gallery, remarks, MLS and facts for its own property only',()=>{
 const item=discovery.extractListingsFromPage(html(home()),new URL(source.url))[0];
 const page=`<property-details street="12 Pine St" photos="['https://photos.example/front.jpg','https://photos.example/kitchen.jpg']" description="Complete &amp; factual remarks" price="420000" bedrooms="4" baths="3" yearBuilt="2006" mlsNum="MLS-12" mlsPropertyType="Residential"></property-details>`;
 const result=discovery.enrichListingFromPage(item,page,new URL(item.sourceUrl));
 assert.equal(result.images.length,2);assert.equal(result.description,'Complete & factual remarks');assert.equal(result.facts['Year Built'],'2006');assert.equal(result.price,'$420,000');assert.equal(result.beds,4);assert.equal(result.listingNumber,'MLS-12');
 assert.deepEqual(discovery.enrichListingFromPage(item,page.replace('12 Pine St','25 Pine St'),new URL(item.sourceUrl)),item);
});

test('IDX galleries follow only the observed link for the same MLS and exclude site chrome',async()=>{
 const item={...discovery.extractListingsFromPage(html(home()),new URL(source.url))[0],sourceUrl:'https://homes.example/idx/details/listing/b254/26-123'};
 const base=new URL(item.sourceUrl),gallery='https://homes.example/idx/photogallery/b254/26-123';
 const detail='<h1>12 Pine St</h1><a href="'+gallery+'">Photos</a><a href="/idx/photogallery/b254/OTHER">Other home</a>';
 const photos='<img class="logo" src="https://photos.example/logo.jpg"><img class="IDX-detailsPrimaryImg" src="https://photos.example/front.jpg"><img class="IDX-detailsPrimaryImg" data-src=" https://photos.example/kitchen.jpg" src="/loading.gif">';
 const result=await discovery.enrichPublicProperty(item,fetchPages({[gallery]:photos}),{html:detail,finalUrl:base});
 assert.equal(result.images.length,2);assert.equal(result.detailsComplete,true);
 assert.equal(discovery.propertyGalleryRequest(detail.replace(gallery,'https://evil.example/idx/photogallery/b254/26-123'),base,item),undefined);
});

test('dsIDX Juicebox reads public XML photo literals without executing page scripts',async()=>{
 const item=discovery.extractListingsFromPage(html(home()),new URL(source.url))[0];
 const detail=`<h1>12 Pine St</h1><script>var dsidxAjaxHandler={"ajaxurl":"https://agent.example/wp-admin/admin-ajax.php"};dsidx.details.pid=12345;new juicebox({configUrl:dsidx.details.GetConfigUrl()});</script>`;
 const url=discovery.propertyGalleryRequest(detail,new URL(item.sourceUrl),item);
 assert.equal(url,'https://agent.example/wp-admin/admin-ajax.php?action=dsidx_client_assist&dsidx_action=GetPhotosXML&pid=12345');
 const result=await discovery.enrichPublicProperty(item,fetchPages({[url]:'<juiceboxgallery><image imageURL="https://photos.example/a.jpg"/><image imageURL="https://photos.example/b.jpg"/></juiceboxgallery>'}),{html:detail,finalUrl:new URL(item.sourceUrl)});
 assert.equal(result.images.length,2);assert.equal(result.detailsComplete,true);
 assert.equal(discovery.propertyGalleryRequest(detail.replace('https://agent.example/wp-admin','https://other.example/wp-admin'),new URL(item.sourceUrl),item),undefined);
 const failed=await discovery.enrichPublicProperty(item,async()=>{throw Error('403')},{html:detail,finalUrl:new URL(item.sourceUrl)});
 assert.equal(failed.detailsComplete,false);assert.deepEqual(failed.images,item.images);
});


test('provider facts carry public year, acreage and property type without label text',()=>{
 const item={...discovery.extractListingsFromPage(html(home()),new URL(source.url))[0],sourceUrl:'https://homes.example/idx/details/listing/b254/26-123'};
 const page='<h1>12 Pine St</h1><span id="IDX-summaryField-yearBuilt-data">1920</span><div id="IDX-field-heating"><strong>Heating:</strong><span>Forced Air</span></div><div id="IDX-field-propType"><strong>Property Type:</strong><span>Residential</span></div><span class="IDX-detailsAddressNumber">12</span><span class="IDX-detailsAddressName">Pine St</span><span id="IDX-detailsPrice">$350,000</span>';
 const result=discovery.enrichListingFromPage(item,page,new URL(item.sourceUrl));
 assert.equal(result.facts['Year Built'],'1920');assert.equal(result.facts.Heating,'Forced Air');assert.equal(result.propertyType,'Residential');
});

test('structured year built and dsIDX tables enrich facts without taking related-page data',()=>{
 const item=discovery.extractListingsFromPage(html({...home(),yearBuilt:1986}),new URL(source.url))[0];assert.equal(item.facts['Year Built'],'1986');
 const detail={...item,sourceUrl:'https://agent.example/idx/mls-26-123-12_pine_st'};
 const page='<h1>12 Pine St</h1><table id="dsidx-additional-details"><tr><th>WATER</th><td>Private &amp; Well</td></tr><tr><th>HEAT</th><td>Forced Air</td></tr></table><table id="related-home"><tr><th>WATER</th><td>Unrelated</td></tr></table>';
 const result=discovery.enrichListingFromPage(detail,page,new URL(detail.sourceUrl));assert.equal(result.facts.Water,'Private & Well');assert.equal(result.facts.Heating,'Forced Air');
});

test('split structured house records retain facts only for the matching property address',()=>{
 const item=discovery.extractListingsFromPage(html(home()),new URL(source.url))[0];
 const page='<h1>12 Pine St</h1>'+html({'@graph':[{'@type':'House',address:{streetAddress:'12 Pine St'},yearBuilt:1986},{'@type':'House',address:{streetAddress:'25 Pine St'},yearBuilt:2020}]});
 const result=discovery.enrichListingFromPage(item,page,new URL(item.sourceUrl));
 assert.equal(result.facts['Year Built'],'1986');
});

// Repair campaign stage 1 (synthetic contract): property details are read in bounded jobs. The
// inventory job saves every listing and reads the first details; each detail job reads the next
// batch for the same import. Every listing is attempted exactly once and each batch is saved.
test('a large import saves its inventory first, then reads every listing’s details in bounded jobs', async () => {
  const scope = '11111111-1111-1111-1111-111111111111';
  const { INVENTORY_JOB_DETAILS, DETAIL_JOB_SIZE } = pure.load('refresh-listings/sourceHandler.ts');
  const numbers = Array.from({ length: 30 }, (_, i) => 100 + i);
  const pages = { [source.url]: html(numbers.map(n => home(n))) };
  for (const n of numbers) pages[home(n).url] = html(home(n));
  const rows = {};
  const first = await endpoint({ body: { mode: 'connect', url: source.url }, pages, rows });
  assert.equal(first.status, 200);
  assert.equal(first.result.imported, 30, 'the whole inventory is saved by the first job');
  assert.equal(first.result.detailsPending, 30 - INVENTORY_JOB_DETAILS);
  const since = first.result.detailsSince;
  const attempted = () => rows[scope + ':listings.v2'].value.items.filter(item => item.detailAttemptAt >= since).length;
  assert.equal(rows[scope + ':listings.v2'].value.items.length, 30);
  assert.equal(attempted(), INVENTORY_JOB_DETAILS);
  assert.equal(first.result.warning, undefined, 'unread details are pending, not reported as unavailable');

  const second = await endpoint({ body: { mode: 'details', sourceId: first.result.source.id, since }, pages, rows });
  assert.equal(second.status, 200);
  assert.equal(second.result.attempted, Math.min(DETAIL_JOB_SIZE, 30 - INVENTORY_JOB_DETAILS));
  assert.equal(second.result.remaining, 0);
  assert.equal(second.fetched, second.result.attempted + 1 /* robots.txt */, 'only this batch’s detail pages are read');
  assert.equal(attempted(), 30, 'every listing was attempted exactly once across the jobs');

  const third = await endpoint({ body: { mode: 'details', sourceId: first.result.source.id, since }, pages, rows });
  assert.equal(third.result.attempted, 0, 'a finished import has nothing left to read');
  assert.equal(third.fetched, 0);
});

test('a detail job needs the import it belongs to', async () => {
  const result = await endpoint({ body: { mode: 'details', sourceId: 'source' } });
  assert.equal(result.status, 400);
  assert.equal(result.fetched, 0);
});

// Repair stage 4 (synthetic contract): a market feed never becomes the agent's inventory.
test('a market page with none of the agent\'s own listings imports nothing and says why', async () => {
  const office = n => ['Other Brokers Inc', 'Third Office Group', 'Fourth Homes Co', 'Fifth Realty'][n % 4];
  const cards = [1, 2, 3, 4].map(n => `<div class="card"><a href="https://agent.example/property/${n}-elm"><img src="https://photos.example/${n}.jpg"><h3>${n} Elm St</h3><span>$${400 + n},000</span></a><p><span>Listing Office:</span> ${office(n)}</p></div>`).join('');
  const page = `<html><head><title>Pine Realty</title></head><body>${cards}<div class="pagination"><a href="/?page=2">2</a><a href="/?page=900">900</a></div></body></html>`;
  await assert.rejects(sources.readSource('https://agent.example/', fetchPages({ 'https://agent.example/': page })),
    /many different brokerages.*none of the 4 we checked were\. Nothing was imported/);
});

test('saved listings keep their attribution and ownership label', () => {
  const item = { id: 'x', title: '1 Elm St', sourceUrl: 'https://agent.example/property/1' };
  const property = { title: '1 Elm St', description: '', price: '', beds: 0, baths: 0, sqft: '', neighborhood: '', image: '', images: [], sourceUrl: item.sourceUrl,
    listingOffice: 'Other Brokers Inc', ownership: 'featured' };
  const next = sync.applyObservation(item, { sourceUrl: item.sourceUrl, checkedAt: 5, property });
  assert.equal(next.listingOffice, 'Other Brokers Inc');
  assert.equal(next.ownership, 'featured');
});

test('the listing import retries its first page once after a timeout', async () => {
  let calls = 0;
  const pages = { [source.url]: html([home(), home(25)]) };
  const result = await sources.readSource(source.url, async uri => {
    if (uri === source.url && calls++ === 0) throw Error('Signal timed out.');
    if (!(uri in pages)) throw Error('Cannot read page');
    return { html: pages[uri], finalUrl: new URL(uri) };
  }, undefined, async () => []);
  assert.equal(calls, 2);
  assert.equal(result.listings.length, 2);
});

// Repair stage 8 (synthetic contracts): "no listings" is a finished read; unreadable pages are a failure.
test('a site that publishes no listings is reported as such, not as unreadable', async () => {
  const result = await endpoint({ body: { mode: 'connect', url: 'https://empty.example/' }, pages: { 'https://empty.example/': '<h1>Welcome</h1><p>About our team.</p>' } });
  assert.equal(result.status, 422);
  assert.equal(result.result.code, 'no_listings');
  assert.match(result.result.error, /couldn’t find any active listings on it/);
});

test('pages that could not be opened are unreadable, never evidence of an empty inventory', async () => {
  const result = await endpoint({ body: { mode: 'connect', url: 'https://agent.example/' },
    pages: { 'https://agent.example/': '<h1>Agent</h1><a href="/my-listings">My Listings</a>' } });
  assert.equal(result.status, 422);
  assert.equal(result.result.code, 'unreadable');
  assert.match(result.result.error, /some of its pages could not be opened/);
});

// title-not-property, production job-split path (found by the final release gate, Oct 8 2026): listings
// whose details are read by a later detail job must get their detail page's property name too, exactly as
// the first job's listings do. Synthetic contract.
test('title-not-property: detail jobs name price-titled listings from their own detail pages', async () => {
  const scope = '11111111-1111-1111-1111-111111111111';
  const numbers = Array.from({ length: 16 }, (_, i) => 200 + i);
  const card = n => ({ ...home(n), name: '$350,000' });
  const detailPage = n => `<html><head>${html({ ...card(n), address: { '@type': 'PostalAddress', streetAddress: `${n} Pine St`, addressLocality: 'Hope', addressRegion: 'ID', postalCode: '83836' } })}</head>` +
    `<body><h1>${n} Pine St, Hope, ID 83836</h1><div class="property-description">${'A lake cabin with a dock and mountain views. '.repeat(4)}</div></body></html>`;
  const pages = { [source.url]: html(numbers.map(card)) };
  for (const n of numbers) pages[home(n).url] = detailPage(n);
  const rows = {};
  const first = await endpoint({ body: { mode: 'connect', url: source.url }, pages, rows });
  assert.equal(first.status, 200);
  const since = first.result.detailsSince;
  assert.ok(first.result.detailsPending > 0, 'some details are left for a detail job');
  await endpoint({ body: { mode: 'details', sourceId: first.result.source.id, since }, pages, rows });
  const titles = rows[scope + ':listings.v2'].value.items.map(item => item.title);
  assert.equal(titles.filter(title => /^\$/.test(title)).length, 0, titles.join(' | '));
  assert.ok(titles.includes('215 Pine St, Hope, ID 83836'));
});

// duplicate-property, production job-split path (found by the final release gate, Oct 8 2026): a property
// published under two listing ids is recognizable only once the detail jobs read the shared remarks. The
// detail job merges it, remembers the merge on the source, and later syncs keep it merged. Synthetic contract.
const duplicateFixture = ({ sameRemarks = true } = {}) => {
  // 28 other listings with the pair in the middle, so neither copy is among the inventory job's first 12 details.
  const fillers = Array.from({ length: 28 }, (_, i) => 300 + i);
  const pair = [{ ...home(401), name: '7563 Hwy 51, Minocqua, WI', price: 494900, image: 'https://photos.example/a.jpg' },
    { ...home(402), name: '7563 Hwy 51, Minocqua, WI', price: 494900, image: 'https://photos.example/b.jpg' }];
  const cards = [...fillers.slice(0, 14).map(n => home(n)), ...pair, ...fillers.slice(14).map(n => home(n))];
  const remarks = n => sameRemarks || n === 401 ? 'Former log model home, now a 3 bed 3 bath with a full basement and a large shop on the highway.' : 'A different listing at this address: commercial frontage with its own remarks and photos.';
  const pages = { [source.url]: html(cards) };
  for (const card of cards) {
    const n = Number(card.url.split('/').pop());
    pages[card.url] = `<html><head>${html(card)}</head><body><h1>${card.name}</h1><div class="property-description">${remarks(n)}</div></body></html>`;
  }
  return pages;
};
const runImport = async (pages, rows) => {
  const first = await endpoint({ body: { mode: 'connect', url: source.url }, pages, rows });
  if (first.result.detailsPending) await endpoint({ body: { mode: 'details', sourceId: first.result.source.id, since: first.result.detailsSince }, pages, rows });
  return first;
};
const savedItems = rows => rows['11111111-1111-1111-1111-111111111111:listings.v2'].value.items;
const savedSource = rows => rows['11111111-1111-1111-1111-111111111111:listing-sources.v1'].value.sources[0];

test('duplicate-property: detail jobs merge a property revealed by its shared remarks, and later syncs keep it merged', async () => {
  const pages = duplicateFixture(), rows = {};
  await runImport(pages, rows);
  const hwy = () => savedItems(rows).filter(item => /7563 Hwy 51/.test(item.title) && !item.sourceArchived);
  assert.equal(hwy().length, 1, 'one record for the property');
  assert.equal(savedItems(rows).length, 29, 'the 28 other listings are untouched');
  const merges = Object.entries(savedSource(rows).mergedDuplicates ?? {});
  assert.equal(merges.length, 1);
  // A later sync of the same source must not bring the merged copy back.
  await endpoint({ body: { mode: 'connect', url: source.url }, pages, rows });
  assert.equal(hwy().length, 1, 'still one record after the next sync');
});

test('duplicate-property: same address and price with different remarks and photos stays two listings', async () => {
  const pages = duplicateFixture({ sameRemarks: false }), rows = {};
  await runImport(pages, rows);
  assert.equal(savedItems(rows).filter(item => /7563 Hwy 51/.test(item.title)).length, 2);
  assert.deepEqual(savedSource(rows).mergedDuplicates ?? {}, {});
});

test('duplicate-property: a saved listing the realtor hid, tagged or annotated is never removed by a merge', () => {
  const { reconcileSavedDuplicates } = pure.load('refresh-listings/sourceHandler.ts');
  const base = { sourceId: 's', price: '$494,900', description: 'Former log model home, now a 3 bed 3 bath with a full basement.', images: ['https://p.example/1.jpg'], title: '7563 Hwy 51, Minocqua, WI' };
  // 'a' (the older id) is the copy a merge would drop; the realtor annotated it.
  const items = [{ ...base, id: 'a', sourceUrl: 'https://agent.example/property/219476', elizaTake: 'My favourite' }, { ...base, id: 'b', sourceUrl: 'https://agent.example/property/219783' }];
  assert.equal(reconcileSavedDuplicates(items, 's').items.length, 2, 'the annotated copy is protected');
  const plain = [{ ...base, id: 'a', sourceUrl: 'https://agent.example/property/219476' }, { ...base, id: 'b', sourceUrl: 'https://agent.example/property/219783' }];
  const result = reconcileSavedDuplicates(plain, 's');
  assert.equal(result.items.length, 1);
  assert.deepEqual(Object.keys(result.merged).length, 1);
});

test('duplicate-property: a merged copy returns when the kept record is no longer published', () => {
  const now = 10 * 3_600_000;
  const kept = { title: '7563 Hwy 51', sourceUrl: 'https://agent.example/property/219783', description: '', price: '$1', beds: 0, baths: 0, sqft: '', neighborhood: '', image: '', images: [] };
  const other = { ...kept, sourceUrl: 'https://agent.example/property/219476' };
  const src = { ...source, mergedDuplicates: { [other.sourceUrl]: kept.sourceUrl } };
  const both = sources.reconcileInventory([], { source: src, listings: [kept, other], complete: true, meta: {} }, now);
  assert.deepEqual(both.map(i => i.sourceUrl), [kept.sourceUrl], 'skipped while the kept record is published');
  const alone = sources.reconcileInventory([], { source: src, listings: [other], complete: true, meta: {} }, now);
  assert.deepEqual(alone.map(i => i.sourceUrl), [other.sourceUrl], 'comes back when it is the only copy');
});

test('a CSV listing export is imported through the same save boundary, and re-importing updates the same homes', async () => {
  const realtor = '11111111-1111-1111-1111-111111111111';
  const csv = [
    'ListingId,StreetAddress,City,StateOrProvince,ListPrice,BedroomsTotal,BathroomsTotalInteger,LivingArea,StandardStatus,PublicRemarks,PhotoURLs',
    '26-1644,11 & 13 Kingston Way,Kingston,ID,99500,0,0,,Active,"Over 6 acres of mountain top paradise, power and gas close.",https://photos.example/a1.jpg|https://photos.example/a2.jpg',
    '26-2527,NKA May Court,Cataldo,ID,130000,0,0,,Pending,"A .80 lot in Cataldo zoned R-2.",https://photos.example/b1.jpg',
    '25-9001,7 Sold Lane,Kellogg,ID,250000,3,2,1500,Closed,"Sold last spring.",',
  ].join('\n');
  const first = await endpoint({ body: { mode: 'import-file', csv, label: 'flexmls-export.csv' } });
  assert.equal(first.status, 200);
  assert.equal(first.result.imported, 2, 'closed rows are not imported');
  assert.equal(first.fetched, 0, 'a file import never fetches the web');
  const items = first.rows[`${realtor}:listings.v2`].value.items;
  const kingston = items.find(item => item.title === '11 & 13 Kingston Way');
  assert.equal(kingston.price, '$99,500');
  assert.equal(kingston.status, 'active');
  assert.equal(kingston.listingNumber, '26-1644');
  assert.deepEqual(kingston.images, ['https://photos.example/a1.jpg', 'https://photos.example/a2.jpg']);
  assert.equal(items.find(item => item.title === 'NKA May Court').status, 'pending');
  const fileSource = first.rows[`${realtor}:listing-sources.v1`].value.sources[0];
  assert.equal(fileSource.kind, 'listing-file');
  assert.ok(items.every(item => item.sourceId === fileSource.id && item.detailAttemptAt));

  // The realtor annotates a home, then uploads an updated export: same homes, new price, note kept.
  const rows = structuredClone(first.rows);
  rows[`${realtor}:listings.v2`].value.items = rows[`${realtor}:listings.v2`].value.items.map(item => item.title === '11 & 13 Kingston Way' ? { ...item, elizaTake: 'Great views.' } : item);
  const second = await endpoint({ rows, body: { mode: 'import-file', csv: csv.replace(',99500,', ',95000,'), label: 'flexmls-export.csv' } });
  const after = second.rows[`${realtor}:listings.v2`].value.items;
  assert.equal(after.length, 2);
  assert.equal(after.find(item => item.title === '11 & 13 Kingston Way').price, '$95,000');
  assert.equal(after.find(item => item.title === '11 & 13 Kingston Way').elizaTake, 'Great views.');

  // A scheduled or manual website sync never tries to re-read the file source.
  const sync = await endpoint({ rows: second.rows, body: {} });
  assert.equal(sync.fetched, 0);
  // Contact lists are not listing exports.
  const contacts = await endpoint({ body: { mode: 'import-file', csv: 'Name,Email,Phone\nJane,jane@example.com,555', label: 'contacts.csv' } });
  assert.equal(contacts.status, 422);
});
