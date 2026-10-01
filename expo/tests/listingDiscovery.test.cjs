const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadDiscovery() {
  const file = path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingDiscovery.ts');
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleRef = { exports: {} };
  new Function('module', 'exports', source)(moduleRef, moduleRef.exports);
  return moduleRef.exports;
}

const {
  scoreInventoryLink,
  collectInventoryLinks,
  extractListingsFromPage,
  discoverListings,
  listingsFromJsonLd,
} = loadDiscovery();

const propertyPage = (title, url, price = 500000) => `<script type="application/ld+json">${JSON.stringify({
  '@type': 'RealEstateListing', name: title, price, url, image: 'https://photos.example/house.jpg',
})}</script>`;
const fixtureFetch = pages => async (uri) => {
  if (!pages[uri]) throw new Error('unreadable page');
  return { html: pages[uri], finalUrl: new URL(uri) };
};

test('agency and inventory navigation pages never become fake properties', () => {
  for (const uri of ['https://agent.example/featured-listings/', 'https://my.flexmls.com/SomeAgent/search/office_listing_categories/Active/listings']) {
    assert.equal(extractListingsFromPage('<title>Featured Listings - Realty</title><meta property="og:image" content="https://cdn.example/logo.jpg">', new URL(uri)).length, 0);
  }
});

test('follows multiple unknown external domains through property buttons and an embedded search', async () => {
  const pages = {
    'https://agent.example/': '<a href="https://partner.example/agent">View properties</a>',
    'https://partner.example/agent': '<button data-href="https://another.example/cindy" aria-label="Our properties"></button>',
    'https://another.example/cindy': '<iframe title="Our listings" data-src="https://inventory.example/collection"></iframe>',
    'https://inventory.example/collection': propertyPage('123 Lake Ave', 'https://inventory.example/property/123'),
  };
  const result = await discoverListings(['https://agent.example/'], fixtureFetch(pages));
  assert.equal(result.listings.length, 1);
  assert.equal(result.meta.maxDepth, 3);
  assert.equal(result.listings[0].title, '123 Lake Ave');
});

test('keeps broad market search from becoming the realtor inventory', async () => {
  const pages = {
    'https://agent.example/': '<a href="/search">Property Search</a><a href="/my-listings">My Listings</a>',
    'https://agent.example/search': propertyPage('Unrelated market home', 'https://agent.example/property/market'),
    'https://agent.example/my-listings': propertyPage('Agent home', 'https://agent.example/property/own'),
  };
  const result = await discoverListings(['https://agent.example/'], fixtureFetch(pages));
  assert.deepEqual(result.listings.map(l => l.title), ['Agent home']);
});

test('follows GET property forms with agent filters, HTTPS upgrades and page redirects', async () => {
  const pages = {
    'https://agent.example/': '<a href="http://partner.example/featured">Our properties</a>',
    'https://partner.example/featured': '<meta http-equiv="refresh" content="0; url=/agent">',
    'https://partner.example/agent': '<form action="/listings" method="GET"><input type="hidden" name="agent" value="123"><button>View our properties</button></form>',
    'https://partner.example/listings?agent=123': propertyPage('12 Pine St', 'https://partner.example/property/12'),
  };
  const result = await discoverListings(['https://agent.example/'], fixtureFetch(pages));
  assert.equal(result.listings.length, 1);
  assert.ok(result.meta.visited.includes('https://partner.example/listings?agent=123'));
});

test('reads public Flexmls fragments with category/filter intact', async () => {
  const base = 'https://my.flexmls.com/SomeAgent/search/office_listing_categories/Active/listings';
  const requests = [];
  const result = await discoverListings([base], async (uri, options) => {
    requests.push({ uri, options });
    const u = new URL(uri);
    return { finalUrl: u, html: u.searchParams.has('list_view') ? `<div class="summary-card listingListItem" data-action="click->list#open" data-href="${base}/123" data-current-price="350000"><a data-listing="{&quot;StreetAddress&quot;:&quot;12 Pine St&quot;,&quot;BedsTotal&quot;:3,&quot;BathsTotal&quot;:2}"></a><img src="https://photos.example/12.jpg"><div class="line-one">12 Pine St</div></div>` : '<body data-search-results-search-count="1"><a href="/SomeAgent/search/new">Search</a><a href="https://flexmls.com/">Flexmls</a></body>' };
  });
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].title, '12 Pine St');
  assert.equal(result.listings[0].beds, 3);
  assert.ok(requests[1].options.fragment);
  assert.match(requests[1].uri, /office_listing_categories\/Active\/listings\?list_view=photo/);
  assert.equal(requests.length, 2, 'loaded inventory must not expand into toolbar market searches');
});

test('reads hydration and follows pagination without duplicates', async () => {
  const one = '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({ props: { listings: [{ streetAddress: '12 Pine St', listPrice: 350000, detailUrl: '/property/12', bedrooms: 3 }] } }) + '</script>';
  const pages = {
    'https://agent.example/listings': one + '<a rel="next" href="?page=2">Next</a>',
    'https://agent.example/listings?page=2': one + propertyPage('25 Lake St', 'https://agent.example/property/25'),
  };
  const result = await discoverListings(['https://agent.example/listings'], fixtureFetch(pages));
  assert.deepEqual(result.listings.map(l => l.title).sort(), ['12 Pine St', '25 Lake St']);
});

test('enriches evidenced properties without replacing addresses with agency metadata', async () => {
  const pages = {
    'https://agent.example/listings': propertyPage('12 Pine St', 'https://agent.example/property/12'),
    'https://agent.example/property/12': '<meta property="og:title" content="Listing Office: Example Realty"><meta property="og:description" content="A sunny home beside the lake."><meta property="og:image" content="https://photos.example/full-size.jpg">',
  };
  const result = await discoverListings(['https://agent.example/listings'], fixtureFetch(pages), { maxDetailPages: 12 });
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].title, '12 Pine St');
  assert.equal(result.listings[0].price, '$500,000');
  assert.equal(result.listings[0].description, 'A sunny home beside the lake.');
  assert.equal(result.listings[0].image, 'https://photos.example/full-size.jpg');
});

test('AI can navigate ambiguous labels but cannot invent a destination', async () => {
  const pages = {
    'https://agent.example/': '<a href="/collection">Explore</a>',
    'https://agent.example/collection': propertyPage('12 Pine St', 'https://agent.example/property/12'),
  };
  let choices;
  const result = await discoverListings(['https://agent.example/'], fixtureFetch(pages), {
    selectLinks: async (page, candidates) => { choices = candidates; return ['https://invented.example/', candidates[0].url]; },
  });
  assert.equal(choices[0].label, 'Explore');
  assert.equal(result.listings.length, 1);
  assert.ok(!result.meta.visited.includes('https://invented.example/'));
});

test('unreadable inventory is distinguished from an empty site and loops are bounded', async () => {
  const result = await discoverListings(['https://agent.example/'], fixtureFetch({
    'https://agent.example/': '<a href="/listings">Our listings</a>',
  }));
  assert.equal(result.listings.length, 0);
  assert.equal(result.meta.outcome, 'unreadable');
  assert.deepEqual(result.meta.failed, ['https://agent.example/listings']);
  const loop = await discoverListings(['https://agent.example/listings'], fixtureFetch({
    'https://agent.example/listings': '<a href="/listings#top">Our listings</a>',
  }));
  assert.equal(loop.meta.visited.length, 1);
});

test('scores View Properties and FlexMLS CTAs highly', () => {
  const seed = new URL('https://agent.example.com/');
  assert.ok(scoreInventoryLink('https://agent.example.com/listings', 'View Properties', seed) >= 40);
  assert.ok(scoreInventoryLink('https://cdn.flexmls.com/search/agent123', 'My listings', seed) >= 50);
  assert.equal(scoreInventoryLink('https://agent.example.com/login', 'Sign in', seed), 0);
  assert.ok(scoreInventoryLink('https://unrelated-news.com/story', 'Read more', seed) < 30);
});

test('collects inventory CTAs including outbound FlexMLS', () => {
  const html = `
    <html><body>
      <a href="/about">About</a>
      <a href="/listings">View all properties</a>
      <a href="https://cdn.flexmls.com/search/abc">Search homes</a>
      <iframe src="https://idx.example.com/gallery"></iframe>
    </body></html>`;
  const links = collectInventoryLinks(html, new URL('https://agent.example.com/'));
  assert.ok(links.some((l) => /listings/.test(l.url)));
  assert.ok(links.some((l) => /flexmls/.test(l.url)));
});

test('extracts listings from JSON-LD ItemList', () => {
  const html = `<html><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: [
      {
        '@type': 'RealEstateListing',
        name: '123 Lake Ave',
        url: 'https://agent.example.com/listing/123-lake',
        price: 899000,
        numberOfBedrooms: 3,
        numberOfBathroomsTotal: 2,
        image: 'https://cdn.example.com/house.jpg',
        address: { '@type': 'PostalAddress', addressLocality: 'Coeur d Alene', addressRegion: 'ID' },
      },
      {
        '@type': 'Product',
        name: '88 Bay Rd',
        offers: { '@type': 'Offer', price: 1250000 },
        url: 'https://agent.example.com/listing/88-bay',
      },
    ],
  })}</script></html>`;
  const found = listingsFromJsonLd(html, new URL('https://agent.example.com/listings'));
  assert.equal(found.length, 2);
  const lake = found.find((l) => l.title === '123 Lake Ave');
  assert.ok(lake);
  assert.match(lake.price, /899/);
  assert.equal(lake.beds, 3);
  assert.equal(lake.neighborhood, 'Coeur d Alene, ID');
  assert.ok(found.some((l) => l.title === '88 Bay Rd'));
});

test('multi-hop discover follows CTA then extracts cards', async () => {
  const pages = {
    'https://agent.example.com/': `<html><a href="/properties">View properties</a><title>Cindy Realty</title></html>`,
    'https://agent.example.com/properties': `<html>
      <a href="/listing/oak-1">Oak Street Home $520,000 · 3 bed 2 bath</a>
      <a href="/listing/pine-2">Pine Lane $780,000 4 beds</a>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'RealEstateListing',
        name: 'Oak Street Home',
        url: 'https://agent.example.com/listing/oak-1',
        price: 520000,
        numberOfBedrooms: 3,
        numberOfBathroomsTotal: 2,
        image: 'https://cdn.example.com/oak.jpg',
      })}</script>
    </html>`,
  };
  const fetchHtml = async (uri) => {
    const html = pages[uri] || pages[uri.replace(/\/$/, '')];
    if (!html) throw new Error('missing ' + uri);
    return { html, finalUrl: new URL(uri) };
  };
  const { listings, meta } = await discoverListings(['https://agent.example.com/'], fetchHtml, {
    maxDepth: 3, maxPages: 6, maxListings: 12,
  });
  assert.ok(meta.visited.length >= 2, 'should visit landing and properties');
  assert.ok(listings.length >= 1, 'should extract at least one listing');
  assert.ok(listings.some((l) => /Oak/i.test(l.title)));
});

test('setup soft-prompt and multi-hop wiring exist in app builder UI', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/InitialRealtorSetup.tsx'), 'utf8');
  assert.match(src, /discoverListingsBuild/);
  assert.match(src, /mergeDiscoveredListings/);
  assert.match(src, /We couldn’t find your listings yet/);
  assert.match(src, /Link to your property listings/);
  assert.match(src, /Import listings/);
  assert.match(src, /Or enter details manually/);
  assert.match(src, /appendBuildSources/);
});

test('single-file deployment bundle loads without duplicate helper declarations', () => {
  const file = path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/deploy.bundle.ts');
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*createClient.*;\r?\n/, '');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let served = false;
  new Function('Deno', 'createClient', compiled)({ env: { get: () => undefined }, serve: () => { served = true; } }, () => ({}));
  assert.ok(served, 'bundle should register the Edge Function handler');
});

test('importDiscoveredListings merges on sourceUrl', () => {
  const file = path.resolve(__dirname, '../lib/appBuilder/importDiscoveredListings.ts');
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // Strip path aliases by stubbing nothing — file only imports types.
  const cleaned = source.replace(/require\("@\/contexts\/ListingsContext"\)/g, '({})');
  const moduleRef = { exports: {} };
  new Function('require', 'module', 'exports', cleaned)(() => ({}), moduleRef, moduleRef.exports);
  const { mergeDiscoveredListings } = moduleRef.exports;
  const current = [{
    id: 'old', title: 'Old', neighborhood: '—', price: '$1', beds: 1, baths: 1, sqft: '—',
    image: 'https://x.test/a.jpg', images: ['https://x.test/a.jpg'], tag: 'New', elizaTake: 'note',
    hidden: false, sourceUrl: 'https://agent.example.com/listing/oak-1',
  }];
  const discovered = [{
    title: 'Oak Street Home', description: '', price: '$520,000', beds: 3, baths: 2, sqft: '1,800',
    neighborhood: 'CDA', image: 'https://cdn.example.com/oak.jpg', images: ['https://cdn.example.com/oak.jpg'],
    sourceUrl: 'https://agent.example.com/listing/oak-1',
  }, {
    title: 'Pine Lane', description: '', price: '$780,000', beds: 4, baths: 3, sqft: '',
    neighborhood: '', image: '', images: [], sourceUrl: 'https://agent.example.com/listing/pine-2',
  }];
  const merged = mergeDiscoveredListings(current, discovered);
  assert.equal(merged.length, 2);
  const oak = merged.find((l) => l.sourceUrl.includes('oak-1'));
  assert.equal(oak.id, 'old');
  assert.equal(oak.title, 'Oak Street Home');
  assert.equal(oak.price, '$520,000');
  const prefix = 'https://my.flexmls.com/Agent/search/office_listing_categories/Active/listings/';
  const pair = [
    { ...discovered[0], sourceUrl: prefix + '20260929165515552066000000' },
    { ...discovered[1], sourceUrl: prefix + '20260929165515552066000001' },
  ];
  const imported = mergeDiscoveredListings([], pair);
  assert.equal(new Set(imported.map(l => l.id)).size, 2);
  assert.equal(mergeDiscoveredListings(imported, pair).length, 2);
});
