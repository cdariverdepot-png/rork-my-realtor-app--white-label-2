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

test('Cindy Carlson (recorded Oct 8): the Flexmls browser check is reported as such, with only real alternatives', async () => {
  const capture = readCapture(path.resolve(__dirname, '../../diagnostics/evaluation/captures/cindy-carlson-realty--rendered.json.gz'));
  const { result, listings } = await replayCapture(await loadPipeline(), capture);
  assert.equal(listings.length, 0);
  const issue = result.meta.issues.find(row => row.code === 'requires-rendering');
  assert.equal(new URL(issue.url).hostname, 'my.flexmls.com');
  assert.equal(issue.interface, 'managed-challenge');
  assert.ok(result.meta.obstacles.some(row => row.code === 'render_failed'), 'the renderer was tried and did not get past the check');
  const message = sources.unreadableInventoryMessage(result.meta, false);
  assert.match(message, /^Your listings are published on my\.flexmls\.com, which now shows automated readers a browser check/);
  assert.match(message, /We don't get around those checks\./);
  assert.match(message, /Paste another public page that shows your listings/);
  assert.match(message, /Add a listing/);
  assert.doesNotMatch(message, /dynamically|upload|manually|dashboard/i);
  assert.match(sources.unreadableInventoryMessage(result.meta, true), /Your existing listings are kept\./);
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
