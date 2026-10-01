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
  assert.match(src, /We couldn’t find listings on that page/);
  assert.match(src, /Link to your property listings/);
  assert.match(src, /Import listings/);
  assert.match(src, /Or enter details manually/);
  assert.match(src, /appendBuildSources/);
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
});
