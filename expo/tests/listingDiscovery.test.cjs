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
  brivityInventoryFragments,
  listingsFromBrivityResponse,
  collectInventoryFragments,
  listingsFromIdxShowcase,
  listingFromIdxDetail,
  detectListingInterfaces,
  listingsFromPublicJson, listingsFromCards, listingsFromMoxi, listingFromDsidxDetail,
  kestrelInventoryRequests, listingsFromKestrel, publicListingRequestHeaders, decodePublicListingResponse,
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

test('setup uses the universal source importer without method selection or manual creation', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/InitialRealtorSetup.tsx'), 'utf8');
  assert.match(src, /ListingSourceImporter/);
  assert.match(src, /connectListingSource/);
  assert.doesNotMatch(src, /listingImportChoice|ManualSetup|Choose listing files|Or enter details manually/);
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

test('continues a scoped Flexmls inventory shell even when server omits hydration markers', async () => {
  const seed='https://agent.example/', flex='https://my.flexmls.com/PublicAgent/search/office_listing_categories/Active/listings';
  const fragment=flex+'?list_view=photo&page=1&per_page=24';
  const result=await discoverListings([seed],fixtureFetch({[seed]:`<a href="${flex}">View our properties</a>`,[flex]:'<title>Our listings</title><main>Loading properties</main>',[fragment]:propertyPage('123 Lake Ave',flex+'/123')}));
  assert.equal(result.listings.length,1);
  assert.ok(result.meta.visited.includes(fragment));
});

test('reads quoted and unquoted inventory counts for completeness checks', async () => {
  for (const count of ['data-search-results-search-count=9','data-search-results-search-count="9"']) {
    const uri='https://agent.example/listings';
    const result=await discoverListings([uri],fixtureFetch({[uri]:`<main ${count}>${propertyPage('123 Lake Ave',uri+'/123')}</main>`}));
    assert.equal(result.meta.expectedCount,9);
    assert.equal(result.meta.outcome,'partial');
  }
});

const config={mlsData:{mls_ids:[{id:'12'}],mls_agent_ids:['a1'],mls_office_ids:['o1'],agent_office_listings_only:1}};
const html='<script src="https://cdn1.brivityidx.com/assets/js/FeaturedProperties-1R-index.min.js"></script><section data-settings="'+JSON.stringify(config).replace(/"/g,'&quot;')+'"></section>';
test('Brivity widget is scoped by published IDs on any domain and ignores regional widget',()=>{for(const host of ['agent.example','another-realtor.example']){const urls=brivityInventoryFragments(html,new URL('https://'+host));assert.equal(urls.length,1);const u=new URL(urls[0]);assert.equal(u.hostname,host);assert.equal(u.searchParams.get('q_include_all'),'0');assert.equal(u.searchParams.get('q_prioritize'),'agents.0.id=a1|office.id=o1');assert.equal(u.searchParams.get('status'),'1');} const broad=html.replace('&quot;agent_office_listings_only&quot;:1','&quot;agent_office_listings_only&quot;:0');assert.deepEqual(brivityInventoryFragments(broad,new URL('https://agent.example')),[]);});
test('Brivity response preserves real property facts and rejects restricted or inactive records',()=>{const row={blossorId:'12-abc',address:{street:'123 Lake Rd',city:'Coeur d\'Alene',state:'ID',zip:'83814'},price:500000,bedrooms:3,totalBaths:2.5,sqFeet:2100,mlsNum:'abc',statusText:'Active',photos:['https://photos.example/a.jpg'],permissions:{displayListing:true,displayAddress:true}};const url=new URL(brivityInventoryFragments(html,new URL('https://agent.example'))[0]);const r=listingsFromBrivityResponse(JSON.stringify({count:4,data:[row,{...row,statusText:'Sold'},{...row,permissions:{displayListing:false}},{...row,permissions:{displayAddress:false}}]}),url);assert.equal(r.listings.length,1);assert.equal(r.listings[0].price,'$500,000');assert.equal(r.listings[0].baths,2.5);assert.equal(r.listings[0].sqft,'2,100');assert.equal(r.listings[0].images[0],row.photos[0]);assert.equal(r.listings[0].listingNumber,'abc');});
test('quoted URL retains apostrophes inside double quotes',()=>{const links=collectInventoryLinks('<a href="/search?city=Coeur d\'Alene">Our listings</a>',new URL('https://agent.example'));assert.equal(new URL(links[0].url).searchParams.get('city'),"Coeur d'Alene");});


test('IDX showcase follows only its published widget URL on arbitrary realtor domains', () => {
  const base = new URL('https://agent.example/');
  const urls = collectInventoryFragments('<script src="//homes.agent.example/idx/customshowcasejs.php?widgetid=42"></script><script src="https://tracker.example/code.js"></script>', base);
  assert.deepEqual(urls, ['https://homes.agent.example/idx/customshowcasejs.php?widgetid=42']);
  assert.equal(scoreInventoryLink('https://homes.agent.example/idx/userlogin', 'My Listings', base), 0);
});

test('IDX showcase reads literal facts without running scripts and excludes pending homes', () => {
  const card = status => `aLink = idx('<a href="https://homes.agent.example/idx/details/listing/a1/MLS1/123-Lake?widgetReferer=true" class="IDX-showcaseLink"></a>');
  imgUrl = decodeURIComponent("https%3A%2F%2Fphotos.example%2Fhouse.jpg");
  idx('<div />').attr('class','IDX-showcaseAddress IDX-showcaseAddressElement').html('123 Lake');
  idx('<span />').attr('class','IDX-showcaseCity').html('Town');
  idx('<span />').attr('class','IDX-showcaseStateAbrv').html('ID');
  idx('<div />').attr('class','IDX-showcasePrice').html('$500,000');
  idx('<div />').attr('class','IDX-showcaseBeds').html('3 Bedrooms');
  idx('<div />').attr('class','IDX-showcaseBaths').html('2.5 Total Baths');
  idx('<div />').attr('class','IDX-showcaseListingID').html('MLS1');
  idx('<div />').attr('class','IDX-showcaseStatus').html('${status}');`;
  const result = listingsFromIdxShowcase(card('Active')+card('Pending')+'throw new Error("never execute");', new URL('https://homes.agent.example/idx/customshowcasejs.php?widgetid=42'));
  assert.equal(result.length,1); assert.equal(result[0].price,'$500,000'); assert.equal(result[0].baths,2.5);
  assert.equal(result[0].status,'active'); assert.equal(result[0].images[0],'https://photos.example/house.jpg');
  assert.equal(new URL(result[0].sourceUrl).searchParams.has('widgetReferer'),false);
});

test('IDX detail extraction uses the property summary for specifications and status', () => {
  const html = '<span class="IDX-detailsAddressNumber">123</span><span class="IDX-detailsAddressName">Lake</span>'+
    '<span id="IDX-detailsPrice">$500,000</span><span id="IDX-summaryField-bedrooms-data">3</span>'+
    '<span id="IDX-summaryField-totalBaths-data">2.5</span><span id="IDX-summaryField-sqFt-data">2,100</span>'+
    '<span id="IDX-summaryField-propStatus-data">Pending</span><img id="IDX-detailsPhoto" src="https://photos.example/house.jpg">'+
    '<p id="IDX-detailsDescription">Actual property remarks.</p><h2>Related homes</h2><div>Active 7 bedrooms</div>';
  const item = listingFromIdxDetail(html,new URL('https://homes.agent.example/idx/details/listing/a1/MLS1/123-Lake'));
  assert.equal(item.beds,3); assert.equal(item.baths,2.5); assert.equal(item.sqft,'2,100'); assert.equal(item.status,'pending');
  assert.equal(item.description,'Actual property remarks.');
});


test('interface registry detects data shapes independently of realtor hostname', () => {
  assert.ok(detectListingInterfaces('<script type="application/ld+json">{}</script>',new URL('https://any.example')).includes('structured-property-data'));
  assert.ok(detectListingInterfaces('{"data":[]}',new URL('https://any.example/api')).includes('public-json'));
});
const resoProperty = (id='1') => ({UnparsedAddress:'123 Lake '+id,ListPrice:500000,BedroomsTotal:3,BathroomsTotalInteger:2.5,
  LivingArea:2100,City:'Town',StateOrProvince:'ID',StandardStatus:'Active',ListingId:id,PublicRemarks:'Actual remarks',
  url:'https://agent.example/property/'+id,Media:[{MediaURL:'https://photos.example/'+id+'.jpg'}]});
test('public JSON maps common property fields and ignores price-only agency objects', () => {
  const rows=listingsFromPublicJson(JSON.stringify({value:[resoProperty(),{name:'Brokerage',price:500000,url:'https://agent.example'}]}),new URL('https://agent.example/api'));
  assert.equal(rows.length,1); assert.equal(rows[0].sqft,'2,100'); assert.equal(rows[0].baths,2.5);
  assert.equal(rows[0].listingNumber,'1'); assert.equal(rows[0].images[0],'https://photos.example/1.jpg');
  assert.equal(rows[0].status,'active');
});
test('public JSON inventory follows an observed next page while preserving agent filters', async () => {
  const first='https://agent.example/api?agent=abc&page=1', next='https://agent.example/api?agent=abc&page=2';
  const pages={'https://agent.example/':'<div data-results-url="'+first.replace('&','&amp;')+'"></div>',
    [first]:JSON.stringify({value:[resoProperty('1')],links:{next}}),[next]:JSON.stringify({value:[resoProperty('2')]})};
  const r=await discoverListings(['https://agent.example/'],fixtureFetch(pages));
  assert.equal(r.listings.length,2); assert.equal(r.meta.outcome,'found');
  pages[first]=JSON.stringify({value:[resoProperty('1')],links:{next:'https://agent.example/api?page=2'}});
  const scoped=await discoverListings(['https://agent.example/'],fixtureFetch(pages));
  assert.equal(scoped.listings.length,1); assert.ok(!scoped.meta.visited.includes('https://agent.example/api?page=2'));
});
test('unsupported JavaScript inventory is unreadable instead of a successful empty import', async () => {
  const r=await discoverListings(['https://agent.example/'],fixtureFetch({'https://agent.example/':'<div id="ihf-main-container"></div>'}));
  assert.equal(r.meta.outcome,'unreadable'); assert.equal(r.listings.length,0);
  assert.ok(r.meta.issues.some(x=>x.code==='requires-rendering'&&x.interface==='ihomefinder'));
});
test('optional renderer reads real DOM property facts and rejects unrelated redirects', async () => {
  const pages={'https://agent.example/':'<div id="ihf-main-container"></div>'};
  const r=await discoverListings(['https://agent.example/'],fixtureFetch(pages),{renderPage:fixtureFetch({'https://agent.example/':propertyPage('123 Lake Rd','https://agent.example/property/123')})});
  assert.equal(r.listings.length,1); assert.ok(!r.meta.issues.some(x=>x.code==='requires-rendering'));
  const blocked=await discoverListings(['https://agent.example/'],fixtureFetch(pages),{renderPage:async()=>({html:propertyPage('Wrong home','https://other.example/property/1'),finalUrl:new URL('https://other.example/')})});
  assert.equal(blocked.listings.length,0);
});


test('a finite showcase cannot establish complete portfolio coverage', async () => {
  const widget='https://homes.agent.example/idx/customshowcasejs.php?widgetid=42';
  const script=`aLink = idx('<a href="https://homes.agent.example/idx/details/listing/a1/MLS1/123-Lake" class="IDX-showcaseLink"></a>');
  idx('<div />').attr('class','IDX-showcaseAddress').html('123 Lake');
  idx('<div />').attr('class','IDX-showcasePrice').html('$500,000');
  idx('<div />').attr('class','IDX-showcaseStatus').html('Active');`;
  const r=await discoverListings(['https://agent.example/'],fixtureFetch({'https://agent.example/':'<script src="'+widget+'"></script>',[widget]:script}));
  assert.equal(r.listings.length,1); assert.equal(r.meta.coverage,'showcase'); assert.equal(r.meta.outcome,'partial');
  assert.ok(r.meta.issues.some(x=>x.code==='limited-showcase'));
});


test('priced card anchors never borrow specifications or images from neighboring properties',()=>{
  const card=(id,price,beds,baths,sqft)=>'<a href="/property/'+id+'"><img src="https://photos.example/'+id+'.jpg">'+id+' $'+price+' '+beds+' beds '+baths+' baths '+sqft+' sqft</a>';
  const rows=listingsFromCards(card('A','900,000',4,3,3000)+card('B','700,000',2,1,1100),new URL('https://agent.example'));
  assert.deepEqual(rows.map(x=>[x.price,x.beds,x.baths,x.sqft,x.images[0]]),[['$900,000',4,3,'3,000','https://photos.example/A.jpg'],['$700,000',2,1,'1,100','https://photos.example/B.jpg']]);
});

const moxiCard=(id,address)=>'<a class="linktooverlay" href="/listing/'+id+'"><div data-bg="https://photos.example/'+id+'.jpg"></div><div class="single-listing-img-price">$450,000</div><div class="single-listing-address"><h3>'+address+'</h3></div><div class="bed_bath_sqft"><div>4 Bed</div><div>3.5 Baths</div><div>2400 sqft</div></div><span class="status-label">Active</span><div class="single-listing-mlsnumber">MLS# '+id+'</div></a>';
test('Moxi cards read address, lazy background photos, MLS ID and all specifications',()=>{
  const rows=listingsFromMoxi(moxiCard('MLS1','100 Lake St'),new URL('https://any-agent.example'));
  assert.equal(rows.length,1);assert.equal(rows[0].title,'100 Lake St');assert.equal(rows[0].baths,3.5);assert.equal(rows[0].sqft,'2,400');assert.equal(rows[0].listingNumber,'MLS1');assert.equal(rows[0].images[0],'https://photos.example/MLS1.jpg');
});
test('Moxi homepage prefers the agent active collection and follows its observed pagination',async()=>{
 const pages={'https://agent.example/':'moxiworks '+moxiCard('WRONG','Office preview')+'<a href="/listings/my-active-listings">My Active Listings</a>',
 'https://agent.example/listings/my-active-listings':moxiCard('A','100 Lake St')+'<a rel="next" href="?page=2">Next</a>',
 'https://agent.example/listings/my-active-listings?page=2':moxiCard('B','200 Lake St')};
 const r=await discoverListings(['https://agent.example/'],async u=>({html:pages[u]??'',finalUrl:new URL(u)}),{maxPages:8});
 assert.deepEqual(r.listings.map(x=>x.listingNumber),['A','B']);assert.equal(r.meta.coverage,'collection');
});
test('same detail URL with differing display titles produces one property',async()=>{
 const r=await discoverListings(['https://agent.example/listings','https://agent.example/listing/A'],async u=>({html:propertyPage(u.endsWith('/A')?'100 Lake St':'100 Lake St, Town','https://agent.example/listing/A'),finalUrl:new URL(u)}));
 assert.equal(r.listings.length,1);
});
const kestrelShell=(widget)=>'<script src="https://kestrel.idxhome.com/ihf-kestrel.js"></script><script>ihfKestrel.config={"activationToken":"11111111-2222-3333-4444444444444444","platform":"wordpress"};ihfKestrel.render('+JSON.stringify(widget)+');</script>';
test('Kestrel discovers featured scope on any realtor domain and refuses broad market widgets',()=>{
 const req=kestrelInventoryRequests(kestrelShell({component:'listingSearchWidget',featured:true,status:'active,pending',cityIds:[4]}))[0];
 const u=new URL(req.url);assert.equal(u.searchParams.get('featuredOnlyYn'),'true');assert.equal(u.searchParams.get('status'),'active');assert.equal(u.searchParams.get('cityId'),'4');assert.ok(!req.url.includes(req.activationToken));
 assert.equal(kestrelInventoryRequests(kestrelShell({component:'listingSearchWidget',featured:false})).length,0);
 assert.throws(()=>publicListingRequestHeaders(new URL('https://other.example/api/kestrel/listings.json'),req));
});
test('Kestrel public transport decodes the website widget response without executing scripts',async()=>{
 const {createCipheriv}=require('node:crypto');const key=Uint8Array.from([111,87,76,114,66,90,108,122,52,84,103,114,78,121,100,104]);const c=createCipheriv('aes-128-ecb',key,null),plain=JSON.stringify([{context:'RESULT',featured:true}]);const wire=Buffer.concat([c.update(plain),c.final()]).toString('base64');
 const url=new URL(kestrelInventoryRequests(kestrelShell({component:'gallerySliderWidget'}))[0].url);
 assert.equal(await decodePublicListingResponse(wire,'application/base64',url,{activationToken:'public-widget-token'}),plain);
 await assert.rejects(decodePublicListingResponse(wire,'application/base64',new URL('https://other.example'),{activationToken:'public-widget-token'}));
});
test('Kestrel normalizes active featured facts and excludes pending and market records',()=>{
 const row={context:'RESULT',featured:true,statusId:'active',address:'100 Lake St\\n Town, ID',listingPageUrl:'https://agent.example/homes-for-sale-details/100-LAKE/MLS1/1/',listPrice:400000,bedrooms:3,fullBathrooms:2,partialBathrooms:1,squareFeet:2100,images:[{url:'https://photos.example/a.jpg'}],listingNumber:'MLS1'};
 const u=new URL(kestrelInventoryRequests(kestrelShell({component:'gallerySliderWidget'}))[0].url),rows=listingsFromKestrel(JSON.stringify([row,{...row,statusId:'pending'},{...row,featured:false}]),u);
 assert.equal(rows.length,1);assert.equal(rows[0].title,'100 Lake St');assert.equal(rows[0].baths,2.5);assert.equal(rows[0].sqft,'2100');assert.equal(rows[0].listingNumber,'MLS1');
});
test('dsIDXpress detail reads explicit property fields instead of other cards or price history',()=>{
 const field=(name,text)=>'<span data-dsidx="'+name+'">'+text+'</span>';
 const h='<title>100 Lake St</title><table id="dsidx-primary-data">'+field('Price','$750,000')+field('Beds','5')+field('Baths','4.5')+field('ImprovedSqFt','3,200')+'</table>'+field('Status','Active')+field('Description','A real property description.')+'<h2>Related properties</h2>$100,000 1 beds 1 baths 500 sqft';
 const row=listingFromDsidxDetail(h,new URL('https://agent.example/idx/mls-26-123-100_lake_st'));
 assert.equal(row.price,'$750,000');assert.equal(row.beds,5);assert.equal(row.baths,4.5);assert.equal(row.sqft,'3,200');assert.equal(row.status,'active');assert.equal(row.listingNumber,'26-123');
});
