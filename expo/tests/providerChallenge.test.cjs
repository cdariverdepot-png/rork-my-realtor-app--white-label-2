// Cindy Carlson investigation (Oct 8 2026). Recorded evidence: her Featured Listings page links to her Flexmls office
// collection; on Oct 5 that collection was readable (9 listings, immutable fixture cindy-carlson-1791176729259);
// since Oct 8 my.flexmls.com answers automated document requests with a Fastly "Client Challenge", and the renderer's
// headless browser stays on the challenge until it times out. The importer does not get around such checks.
// Contracts: the failure names the provider and its browser check instead of "loads dynamically"; it offers only
// alternatives the app has; a site map's links are never inventory; a portrait-shaped image captioned with the
// agent's name is the agent's portrait.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loadPipeline, replayCapture, readCapture } = require('../scripts/improve/engine.cjs');

const root = path.resolve(__dirname, '../../supabase/functions');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(file, cache = new Map()) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  new Function('require', 'module', 'exports', 'Deno', compile(fs.readFileSync(file, 'utf8')))(id => id.startsWith('npm:') ? {} : load(path.resolve(path.dirname(file), id), cache),
    module, module.exports, { env: { get: () => undefined } });
  return module.exports;
}
const sources = load(path.join(root, 'refresh-listings/sources.ts'));
const discovery = load(path.join(root, 'analyze-realtor-build/listingDiscovery.ts'));
const design = load(path.join(root, 'analyze-realtor-build/websiteDesign.ts'));

test('a provider browser check is reported as such, with only real alternatives', () => {
  const meta = { issues: [{ code: 'requires-rendering', url: 'https://my.flexmls.com/Agent/search/office_listing_categories/Active/listings', interface: 'managed-challenge' }] };
  const message = sources.unreadableInventoryMessage(meta, false);
  assert.match(message, /^Your listings are published on my\.flexmls\.com, which now shows automated readers a browser check/);
  assert.match(message, /We don't get around those checks\./);
  assert.match(message, /Paste another public page that shows your listings/);
  assert.match(message, /Add a listing/);
  assert.match(message, /import a CSV export of your listings/);
  assert.doesNotMatch(message, /dynamically|upload|manually|dashboard/i);
  assert.match(sources.unreadableInventoryMessage(meta, true), /Your existing listings are kept\./);
});

test('Cindy Carlson (live, Oct 8): her Flexmls office collection is read through its published photo-view transport', async () => {
  const capture = readCapture(path.resolve(__dirname, '../../diagnostics/evaluation/captures/cindy-carlson-realty--transport.json.gz'));
  const { result, listings } = await replayCapture(await loadPipeline(), capture);
  assert.equal(listings.length, 8);
  assert.ok(result.meta.stages.includes('provider_transport_after_check'));
  assert.ok(!result.meta.stages.includes('browser_render_escalated'), 'no browser is spent on a check it cannot pass');
  for (const item of listings) {
    assert.match(item.sourceUrl, /^https:\/\/my\.flexmls\.com\/CiindyCarlson\/search\/office_listing_categories\/Active\/listings\/\d{20,}/);
    assert.ok(item.price && item.description.length > 100 && item.images.length >= 6 && item.detailsComplete, item.title);
    assert.ok(item.images.every(url => /sparkplatform\.com/.test(url)), item.title);
  }
  assert.equal(new Set(listings.map(item => item.sourceUrl)).size, 8);
  assert.ok(listings.some(item => item.title === '483 Paradise Lane' && item.price === '$1,299,999'));
});

test('Cindy Carlson (Oct 5 responses, document now behind a check): the transport yields the same nine properties', async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/listing-compatibility/cindy-carlson-1791176729259.json'), 'utf8'));
  const challenge = readCapture(path.resolve(__dirname, '../../diagnostics/evaluation/captures/cindy-carlson-realty--rendered.json.gz')).pages[2].html;
  assert.match(challenge, /<title>Client Challenge<\/title>/);
  const pipeline = await loadPipeline();
  const original = await replayCapture(pipeline, fixture);
  const checked = await replayCapture(pipeline, { ...fixture, pages: fixture.pages.map(page => page.url.endsWith('/Active/listings') && !page.fragment ? { ...page, html: challenge } : page) });
  assert.equal(checked.missing.length, 0);
  assert.deepEqual(checked.listings.map(item => item.sourceUrl).sort(), original.listings.map(item => item.sourceUrl).sort());
  assert.equal(checked.listings.length, 9);
});

test('a Flexmls transport is derived only from a listing-category collection URL', () => {
  assert.deepEqual(discovery.urlDerivedTransports(new URL('https://my.flexmls.com/Agent/search/office_listing_categories/Active/listings')),
    ['https://my.flexmls.com/Agent/search/office_listing_categories/Active/listings?list_view=photo&page=1&per_page=24']);
  assert.deepEqual(discovery.urlDerivedTransports(new URL('https://my.flexmls.com/Agent/search/office_listing_categories/Active/listings/20260226190717870344000000')),
    ['https://my.flexmls.com/Agent/search/office_listing_categories/Active/listings?list_view=photo&page=1&per_page=24']);
  for (const url of ['https://my.flexmls.com/Agent/search/new', 'https://my.flexmls.com/Agent/search/idx_links/2017/listings?_filter=County', 'https://agent.example/search/office_listing_categories/Active/listings',
    'https://my.flexmls.com/Agent/search/office_listing_categories/Active/listings?list_view=photo&page=2&per_page=24']) assert.deepEqual(discovery.urlDerivedTransports(new URL(url)), [], url);
  assert.equal(discovery.propertyDetailRequest('https://my.flexmls.com/Office/search/listing_categories/Active/listings/20260413223213928594000000').fragment, true);
});

test('a plain listing category behind a check is read only when the realtor submitted it or their site claimed it', async () => {
  const challenge = '<html><head><title>Client Challenge</title></head><body><script src="/_fs-ch-1T1wmsGaOgGaSxcX/errors.js"></script></body></html>';
  const category = 'https://my.flexmls.com/Region/search/listing_categories/Active/listings';
  const photo = category + '?list_view=photo&page=1&per_page=24';
  const card = n => `<div data-href="${category}/2026041322321392859400000${n}?from_filter=false" data-current-price="35000${n}.0" class="summary-card listingListItem"><span class="line-one">${n}0 Pine St</span><img src="https://cdn.resize.sparkplatform.com/x/${n}-o.jpg"> Active $35${n},000</div>`;
  const pages = { [category]: challenge, [photo]: card(1) + card(2) + card(3), 'https://agent.example/': `<a href="${category}">Area market report</a>` };
  const requested = [];
  const read = async (url, options) => { requested.push(url + (options?.fragment ? ' [fragment]' : '')); return { html: pages[url] ?? '<html></html>', finalUrl: new URL(url) }; };
  const unclaimed = await discovery.discoverListings(['https://agent.example/'], read, { maxPages: 6, maxDetailPages: 0 });
  assert.equal(unclaimed.listings.length, 0);
  assert.ok(!requested.some(url => url.startsWith(photo)), requested.join('\n'));
  const submitted = await discovery.discoverListings([category], read, { maxPages: 6, maxDetailPages: 0 });
  assert.equal(submitted.listings.length, 3);
});

test('a page that draws listings without a browser check keeps the generic explanation', () => {
  const message = sources.unreadableInventoryMessage({ issues: [{ code: 'requires-rendering', url: 'https://agent.example/listings', interface: 'kvcore' }] }, false);
  assert.match(message, /^This site draws its listings in a way we can't read yet/);
  assert.doesNotMatch(message, /browser check/);
});

test('a site map is never followed as inventory, so the MLS-wide properties it lists are not imported', async () => {
  assert.equal(discovery.scoreInventoryLink('https://agent.example/property-search/site-map/', 'Site Map', new URL('https://agent.example/')), 0);
  assert.equal(discovery.scoreInventoryLink('https://agent.example/sitemap.html', 'Sitemap', new URL('https://agent.example/')), 0);
  const origin = 'https://sierra.example';
  const card = (id, street, price) => `<div class="si-listing" data-url="/property-search/detail/1/${id}/${street}/"><div class="price">${price}</div>`
    + `<a href="/property-search/detail/1/${id}/${street}/">${street.replace(/-/g, ' ')}, West Chester, PA</a> 3 Beds 2 Baths</div>`;
  const detail = (street, office) => `<html><head><title>${street}</title><meta property="og:title" content="${street}"></head><body><h1>${street}</h1><p>$400,000 3 beds</p><p>Listing courtesy of ${office}</p></body></html>`;
  const pages = {
    [origin + '/']: '<a href="/featured-listings/">Featured Listings</a><footer><a href="/property-search/site-map/">Site Map</a></footer>',
    [origin + '/featured-listings/']: card('A1', '12-pine-rd', '$350,000') + card('B2', '40-oak-ln', '$410,000') + card('C3', '7-birch-ct', '$275,000'),
    [origin + '/property-search/site-map/']: ['MD1/178-riviera-dr', 'MD2/215-holland-rd', 'MD3/1256-crowell-ct'].map(p => `<a href="/property-search/detail/1/${p}/">${p.split('/')[1].replace(/-/g, ' ')}</a>`).join(''),
  };
  for (const p of ['MD1/178-riviera-dr', 'MD2/215-holland-rd', 'MD3/1256-crowell-ct']) pages[`${origin}/property-search/detail/1/${p}/`] = detail(p.split('/')[1], 'Other Realty');
  const visited = [];
  const result = await discovery.discoverListings([origin + '/'], async url => { visited.push(url); return { html: pages[url] ?? '<html></html>', finalUrl: new URL(url) }; }, { maxPages: 12, maxDetailPages: 0 });
  assert.deepEqual(result.listings.map(row => row.sourceUrl.split('/')[6]).sort(), ['A1', 'B2', 'C3']);
  assert.ok(!visited.some(url => /site-map|\/MD\d\//.test(url)), visited.join('\n'));
});

test('a portrait-shaped website image captioned with the agent\'s name is the agent\'s portrait; others are not', () => {
  const url = 'https://i0.wp.com/agent.example/wp-content/uploads/2018/05/Edit.jpg?resize=768%2C920&ssl=1';
  const img = '<img class="wp-image-220" src="https://i0.wp.com/agent.example/wp-content/uploads/2018/05/Edit.jpg?resize=138%2C166&#038;ssl=1" alt="" width="138" height="166">';
  assert.equal(design.imageCaptionedWithName(`<p>${img}<br><strong>Cindy Carlson</strong> Broker, Realtor®, ABR</p>`, url, 'Cindy Carlson'), true);
  assert.equal(design.imageCaptionedWithName(`<p>${img.replace('alt=""', 'alt="Cindy Carlson, Broker"')}</p>`, url, 'Cindy Carlson'), true);
  // Another person's caption, a caption far away, or a name with a single word is not enough.
  assert.equal(design.imageCaptionedWithName(`<p>${img}<br>Jane Doe, Office Manager</p>`, url, 'Cindy Carlson'), false);
  assert.equal(design.imageCaptionedWithName(`<p>${img}</p>${'<p>Our office serves Kellogg and the Silver Valley.</p>'.repeat(30)}<p>Cindy Carlson</p>`, url, 'Cindy Carlson'), false);
  assert.equal(design.imageCaptionedWithName(`<p>${img} Cindy</p>`, url, 'Cindy'), false);
  assert.equal(design.imageCaptionedWithName(`<p>${img.replace(/Edit\.jpg/g, 'Kitchen.jpg')} Cindy Carlson</p>`, url, 'Cindy Carlson'), false);
});
