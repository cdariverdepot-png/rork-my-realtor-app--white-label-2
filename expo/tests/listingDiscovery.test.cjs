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
  new Function('require', 'module', 'exports', source)(require, moduleRef, moduleRef.exports);
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
  discoverListingsAcrossBatches,
} = loadDiscovery();
const {enrichListingFromPage,propertyDetailRequest,distinctPropertyImages}=loadDiscovery();

test('Flexmls detail reads every public photo, full remarks and exact listing identity',()=>{
  const id='20260929165515552066000000',url=`https://my.flexmls.com/TestAgent/search/office_listing_categories/Active/listings/${id}?from_filter=false`;
  const item={title:'119 Pine St',sourceUrl:url,images:['https://cdn.resize.sparkplatform.com/cda/640x480/true/20260929174358219349000000-o.jpg'],image:'',description:'',price:'',beds:0,baths:0,sqft:'',neighborhood:''};
  const photos=Array.from({length:36},(_,i)=>({Uri1280:`https://photos.example/${i}.jpg`,CurrentPrivacy:'Public'}));
  photos.push({Uri1280:'https://photos.example/private.jpg',CurrentPrivacy:'Private'});
  const esc=o=>JSON.stringify(o).replaceAll('"','&quot;');
  const remarks='Full public remarks. '.repeat(100);
  const html=`<div data-map--ldp-listing='${esc({ListingKey:id,ListingId:'26-9778',CurrentPrice:374000,BedsTotal:2,BathsTotal:1,MlsStatus:'Active',StandardFields:{PropertyClass:'Residential'}})}' data-map--ldp-listing-native-media='${esc({Photos:photos})}'><div class="remarks-and-showing-info-clamped"><p>${remarks}</p></div></div>`;
  const result=enrichListingFromPage(item,html,new URL(propertyDetailRequest(url).url));
  assert.equal(result.images.length,36);assert.equal(result.description,remarks.trim());assert.equal(result.listingNumber,'26-9778');assert.equal(result.detailsComplete,true);
  assert.equal(result.price,'$374,000');assert.equal(result.beds,2);
  assert.ok(propertyDetailRequest(url).url.includes(`/listing_detail/${id}?from_filter=false`));
  assert.equal(enrichListingFromPage({...item,sourceUrl:url.replace(id,'20260929165515552066000001')},html,new URL(url)).images.length,1);
  assert.equal(distinctPropertyImages(['https://cdn.resize.sparkplatform.com/cda/1280x1024/true/20260929174358219349000000-o.jpg',...item.images]).length,1);
});

test('structured galleries retain more than twelve images and contentUrl media objects',()=>{
  const images=Array.from({length:30},(_,i)=>({contentUrl:`https://photos.example/gallery-${i}.jpg`}));
  const page=`<script type="application/ld+json">${JSON.stringify({'@type':'RealEstateListing',name:'123 Lake Ave',price:500000,associatedMedia:images,description:'Long remarks. '.repeat(200)})}</script>`;
  const [listing]=extractListingsFromPage(page,new URL('https://agent.example/property/123'));
  assert.equal(listing.images.length,30);assert.ok(listing.description.length>1200);
});

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
    'https://agent.example/property/12': '<h1>12 Pine St</h1><meta property="og:title" content="Listing Office: Example Realty"><meta property="og:description" content="A sunny home beside the lake."><meta property="og:image" content="https://photos.example/full-size.jpg">',
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

test('IDX showcase reads literal facts without running scripts and keeps pending homes', () => {
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
  const result = listingsFromIdxShowcase(card('Active')+card('Pending')+card('Sold')+'throw new Error("never execute");', new URL('https://homes.agent.example/idx/customshowcasejs.php?widgetid=42'));
  assert.equal(result.length,2);
  assert.equal(result[0].price,'$500,000'); assert.equal(result[0].baths,2.5);
  assert.equal(result[0].status,'active'); assert.equal(result[1].status,'pending');
  assert.equal(result[0].images[0],'https://photos.example/house.jpg');
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

const { isPublishedScriptGate, publishedScriptGateCookie, chimeListingSearchRequests } = loadDiscovery();
const scriptGate = (difficulty = 1) => `<html><body><script>
(function(){
  var nonce = 'aabbccdd11223344';
  var difficulty = ${difficulty};
  function _wc(x, elapsed) {
    var _a = '11111111', _b = '22222222', _c = '33333333';
    window['\\x64\\x6f\\x63\\x75\\x6d\\x65\\x6e\\x74']['\\x63\\x6f\\x6f\\x6b\\x69\\x65'] = '\\x63\\x66\\x5f\\x70\\x6f\\x77' + '=' + x;
    window['\\x64\\x6f\\x63\\x75\\x6d\\x65\\x6e\\x74']['\\x63\\x6f\\x6f\\x6b\\x69\\x65'] = '\\x63\\x66\\x5f\\x74\\x69\\x6d\\x65' + '=' + elapsed;
    window['\\x64\\x6f\\x63\\x75\\x6d\\x65\\x6e\\x74']['\\x63\\x6f\\x6f\\x6b\\x69\\x65'] = '\\x63\\x66\\x5f\\x70\\x61\\x73\\x73' + '=' + (_a + _b + _c);
  }
  window.crypto.subtle.digest('SHA-1', nonce).then(function(){ _wc(0, 1); });
})();
</script></body></html>`;
const chimeShell = '<link rel="dns-prefetch" href="//static.chimeroi.com"><link rel="dns-prefetch" href="//cdn.chime.me"><script src="/pageJsonAndGlobalData.js?siteId=1"></script><script>window.sitePageJSON={"page":"listing","modules":[{"name":"md-search","listingSource":"0+Custom-Example1"}]}</script>';
const chimeJson = JSON.stringify({ counts: 1, totalPage: 1, page: 1, listings: [{
  streetAddress: '1018 Mogul Hill Rd', detailUrl: '/1018-mogul-hill-rd', price: 450000, bedrooms: 3, bathrooms: 2, sqft: 1800,
  previewPicture: 'https://photos.example/mogul.jpg', listingStatus: 'Active', mlsListingId: 'MLS9' }] });

test('published script gate cookie satisfies the page SHA-1 prefix without executing it', async () => {
  const cookie = await publishedScriptGateCookie(scriptGate(1));
  const x = cookie.match(/cf_pow=(\d+)/)[1];
  const { createHash } = require('node:crypto');
  assert.equal(createHash('sha1').update('aabbccdd11223344' + x).digest('hex')[0], '7');
  assert.match(cookie, /^cf_pow=\d+; cf_time=1; cf_pass=111111112222222233333333$/);
  assert.equal(await publishedScriptGateCookie(scriptGate(9)), null);
  assert.equal(isPublishedScriptGate('<main>nonce difficulty</main>'), false);
});
test('public JSON reads string addresses, pipe-delimited galleries and chime status fields', () => {
  const rows = listingsFromPublicJson(JSON.stringify({ listings: [{
    address: '10 Pine St', detailLink: '/10-pine', price: 250000, beds: 2, baths: 1,
    listingPictures: 'https://photos.example/a.jpg|https://photos.example/b.jpg',
    listingStatusText: 'Pending', mlsListingId: 'ZZ' }] }), new URL('https://agent.example/api'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, '10 Pine St');
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].listingNumber, 'ZZ');
  assert.deepEqual(rows[0].images, ['https://photos.example/a.jpg', 'https://photos.example/b.jpg']);
  const land = listingsFromPublicJson(JSON.stringify({ listings: [{
    streetAddress: 'NNA Road', detailUrl: '/land', price: 100000, bedrooms: -1, bathrooms: -1, sqft: -1,
    totalAvailableAcres: 871200, city: 'Kingston', state: 'ID', listingStatus: 'Active' }] }), new URL('https://agent.example/api'));
  assert.equal(land[0].beds, 0);
  assert.equal(land[0].baths, 0);
  assert.equal(land[0].sqft, '');
  assert.equal(land[0].facts['Lot Acres'], '20');
  assert.equal(land[0].neighborhood, 'Kingston, ID');
});
test('script gate then chime search extracts priced photos on an unfamiliar host', async () => {
  const origin = 'https://unfamiliar-broker.example';
  const search = chimeListingSearchRequests(chimeShell, new URL(origin + '/'))[0];
  assert.equal(new URL(search).searchParams.get('listingSource'), '0+Custom-Example1');
  assert.equal(new URL(search).searchParams.get('featureListingName'), 'Custom-Example1');
  assert.equal(new URL(search).searchParams.get('listingType'), 'featured-listing');
  const market = chimeShell.replace('0+Custom-Example1', 'all listings');
  assert.equal(chimeListingSearchRequests(market, new URL(origin + '/')).length, 0);
  assert.equal(chimeListingSearchRequests(chimeShell, new URL('https://other-agent.example/')).length, 1);
  const fetchHtml = async (url, options) => {
    if (url.includes('/api-site/search/realTimeListings')) {
      assert.match(options.cookie, /cf_pass=111111112222222233333333/);
      return { html: chimeJson, finalUrl: new URL(url) };
    }
    if (!options?.cookie) return { html: scriptGate(), finalUrl: new URL(url) };
    return { html: chimeShell, finalUrl: new URL(url) };
  };
  const r = await discoverListings([origin + '/'], fetchHtml, { maxPages: 4, maxListings: 10, maxDetailPages: 0 });
  assert.equal(r.listings.length, 1);
  assert.equal(r.listings[0].title, '1018 Mogul Hill Rd');
  assert.equal(r.listings[0].price, '$450,000');
  assert.equal(r.listings[0].beds, 3);
  assert.equal(r.listings[0].baths, 2);
  assert.equal(r.listings[0].sqft, '1,800');
  assert.equal(r.listings[0].status, 'active');
  assert.equal(r.listings[0].listingNumber, 'MLS9');
  assert.equal(r.listings[0].image, 'https://photos.example/mogul.jpg');
  assert.equal(r.listings[0].sourceUrl, origin + '/1018-mogul-hill-rd');
  assert.equal(r.meta.outcome, 'found');
  assert.equal(r.meta.expectedCount, 1);
  assert.ok(r.meta.interfaces.includes('chime-site-search'));
  assert.ok(r.meta.compatibility.pages.some(p => p.attempts.some(a => a.id === 'public-json' && a.outcome === 'extracted')));
  assert.ok(!r.meta.issues.some(x => x.code === 'requires-rendering'));
  assert.ok(r.meta.visited.includes(search));
});
test('chime search robot wall is requires-rendering and invents no listings', async () => {
  const origin = 'https://another-broker.example';
  const robot = '<html><head><title>Robot Validate</title></head><body><h2>Error Access denied</h2><p>Verify your are human</p><div id="recaptcha-wrap"></div></body></html>';
  const fetchHtml = async (url, options) => {
    if (url.includes('/api-site/search/')) return { html: robot, finalUrl: new URL(url) };
    if (!options?.cookie) return { html: scriptGate(), finalUrl: new URL(url) };
    return { html: chimeShell, finalUrl: new URL(url) };
  };
  const r = await discoverListings([origin + '/featured-listings'], fetchHtml, { maxPages: 6, maxDetailPages: 0 });
  assert.equal(r.listings.length, 0);
  assert.equal(r.meta.outcome, 'unreadable');
  assert.ok(r.meta.issues.some(x => x.code === 'requires-rendering' && x.interface === 'chime-site-search'));
  assert.ok(r.meta.compatibility.pages.some(p => p.resolution === 'requires-rendering' && p.interfaces.includes('chime-site-search')));
  assert.ok(!r.meta.compatibility.pages.some(p => p.resolution === 'needs-strategy'));
});
test('a script gate that does not unlock is not a needs-strategy miss', async () => {
  const html = scriptGate();
  const r = await discoverListings(['https://gated.example/'], async () => ({ html, finalUrl: new URL('https://gated.example/') }), { maxPages: 2, maxDetailPages: 0 });
  assert.equal(r.listings.length, 0);
  assert.equal(r.meta.outcome, 'unreadable');
  assert.equal(r.meta.compatibility.pages[0].resolution, 'requires-rendering');
  assert.ok(r.meta.issues.some(x => x.interface === 'script-gate'));
  assert.ok(!r.meta.compatibility.pages.some(p => p.resolution === 'needs-strategy'));
});
test('a managed challenge interstitial is not an empty inventory', async () => {
  const html = '<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={}</script></body></html>';
  const denied = '<html><head><title>Access to this page has been denied</title></head><body><div id="px-captcha"></div></body></html>';
  const moment = await discoverListings(['https://challenge.example/featured-listings/'], async () => ({ html, finalUrl: new URL('https://challenge.example/featured-listings/') }), { maxPages: 2, maxDetailPages: 0 });
  assert.equal(moment.listings.length, 0);
  assert.notEqual(moment.meta.outcome, 'found');
  assert.ok(moment.meta.obstacles.some(row => row.code === 'requires_rendering'));
  assert.equal(moment.meta.compatibility.pages[0].resolution, 'requires-rendering');
  const captcha = await discoverListings(['https://profile.example/agent'], async () => ({ html: denied, finalUrl: new URL('https://profile.example/agent') }), { maxPages: 2, maxDetailPages: 0 });
  assert.equal(captcha.listings.length, 0);
  assert.ok(captcha.meta.obstacles.some(row => row.code === 'captcha_required'));
  assert.ok(captcha.meta.resume.pending.includes('https://profile.example/agent'));
  let renders = 0;
  const cleared = await discoverListings(['https://challenge.example/featured-listings/'], async () => ({ html, finalUrl: new URL('https://challenge.example/featured-listings/') }), {
    maxPages: 3, maxDetailPages: 0, maxRenders: 1,
    renderPage: async () => { renders++; return { html: '<a href="/property/12-pine">12 Pine St $350,000</a>', finalUrl: new URL('https://challenge.example/featured-listings/') }; },
  });
  assert.equal(renders, 1);
  assert.equal(cleared.listings.length, 1);
  assert.ok(cleared.meta.stages.includes('browser_render_escalated'));
  assert.notEqual(cleared.meta.outcome, 'not-found');
  let captchaRenders = 0;
  const skipped = await discoverListings(['https://profile.example/agent'], async () => ({ html: denied, finalUrl: new URL('https://profile.example/agent') }), {
    maxPages: 2, maxDetailPages: 0,
    renderPage: async () => { captchaRenders++; throw new Error('captcha must not render'); },
  });
  assert.equal(captchaRenders, 0);
  assert.equal(skipped.listings.length, 0);
  assert.ok(skipped.meta.obstacles.some(row => row.code === 'captcha_required'));
});

const engine = loadDiscovery();

test('architecture candidates rank lofty chime from markers, not from the hostname', () => {
  const rows = engine.architectureCandidates(chimeShell, new URL('https://unfamiliar-broker.example/'));
  assert.equal(rows[0].id, 'lofty_chime');
  assert.ok(rows[0].confidence >= 0.9);
  assert.equal(engine.architectureCandidates('<div id="root"></div>', new URL('https://brendaburk.com/')).some(row => row.id === 'lofty_chime'), false);
  assert.equal(engine.classifyObstacle('<html><head><title>Robot Validate</title></head><body>Verify your are human</body></html>'), 'captcha_required');
  assert.equal(engine.classifyObstacle('<title>Just a moment...</title><form id="challenge-form"></form>'), 'requires_rendering');
  assert.equal(engine.classifyObstacle('<title>Just a moment...</title><script>window._cf_chl_opt={}</script>', 403), 'requires_rendering');
  assert.equal(engine.classifyObstacle('<title>Attention Required! | Cloudflare</title>', 403), 'requires_rendering');
  assert.equal(engine.classifyObstacle('<title>Access to this page has been denied</title><div id="px-captcha"></div>', 403), 'captcha_required');
  assert.equal(engine.classifyObstacle('<title>403 Forbidden</title><h1>Forbidden</h1>', 403), 'access_denied');
  assert.equal(engine.isRobotChallenge('<title>12 Pine St</title><p>Just a moment while photos load</p>'), false);
  assert.equal(engine.classifyObstacle('<script>window.awsWafCookieDomainList=[];window.gokuProps={}</script>'), 'requires_rendering');
  assert.equal(engine.classifyObstacle(scriptGate()), 'script_gate');
  const detail = engine.listingFromChimeDetail('<script>window.sitePageJSON={"modules":[{"data":{"listingDetail":{"info":{"streetAddress":"10 Pine St","detailUrl":"/10-pine","price":250000,"bedrooms":3,"bathrooms":2,"sqft":1800,"detailsDescribe":"Actual public remarks about this specific property.","listingPictures":"https://photos.example/a.jpg|https://photos.example/b.jpg","mlsListingId":"MLS1","listingStatus":"Active","city":"Town","state":"ID"}}}}]}</script>', new URL('https://agent.example/10-pine'));
  assert.equal(detail.title, '10 Pine St');
  assert.equal(detail.images.length, 2);
  assert.match(detail.description, /Actual public remarks/);
  assert.equal(detail.listingNumber, 'MLS1');
});

test('enrichAll schedules every listing when the collection page budget is already spent', async () => {
  const records = Array.from({ length: 13 }, (_, i) => ({ '@type': 'RealEstateListing', name: `${i + 1} Pine St`, url: `https://agent.example/property/${i + 1}`, price: 300000 + i, image: `https://photos.example/${i + 1}.jpg` }));
  const pages = { 'https://agent.example/inventory': `<script type="application/ld+json">${JSON.stringify(records)}</script>` };
  for (let i = 1; i <= 13; i++) pages[`https://agent.example/property/${i}`] = `<script type="application/ld+json">${JSON.stringify({ ...records[i - 1], description: `Remarks ${i}`, image: [`https://photos.example/${i}-a.jpg`, `https://photos.example/${i}-b.jpg`] })}</script>`;
  const seen = [];
  const fetchHtml = async uri => { seen.push(uri); if (!pages[uri]) throw Error('unreadable page'); return { html: pages[uri], finalUrl: new URL(uri) }; };
  const capped = await discoverListings(['https://agent.example/inventory'], fetchHtml, { maxPages: 2, maxListings: 20, maxDetailPages: 12 });
  assert.equal(capped.listings.length, 13);
  assert.ok(capped.listings.filter(row => row.detailsComplete).length <= 1, 'collection budget must still limit the legacy detail path');
  const full = await discoverListings(['https://agent.example/inventory'], fetchHtml, { maxPages: 2, maxListings: 20, enrichAll: true });
  assert.equal(full.listings.length, 13);
  assert.equal(full.meta.inventoryStatus, 'inventory_complete');
  assert.equal(full.meta.enrichment.scheduled, 13);
  assert.equal(full.meta.enrichment.enriched, 13);
  assert.equal(full.meta.enrichment.failed, 0);
  assert.equal(full.meta.enrichment.status, 'enrichment_complete');
  assert.equal(full.meta.outcome, 'found');
  assert.ok(full.listings.every(row => row.detailsComplete && row.description.startsWith('Remarks') && row.images.length === 2));
});

test('a detail failure keeps the discovered listing and does not mark inventory partial', async () => {
  const page = `<script type="application/ld+json">${JSON.stringify([{ '@type': 'RealEstateListing', name: '9 Oak St', url: 'https://agent.example/property/9', price: 250000, image: 'https://photos.example/9.jpg' }])}</script>`;
  const fetchHtml = async uri => {
    if (uri.endsWith('/property/9')) throw Error('detail timed out');
    return { html: page, finalUrl: new URL(uri) };
  };
  const result = await discoverListings(['https://agent.example/inventory'], fetchHtml, { maxPages: 2, enrichAll: true });
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].title, '9 Oak St');
  assert.equal(result.listings[0].detailsComplete, undefined);
  assert.equal(result.meta.inventoryStatus, 'inventory_complete');
  assert.equal(result.meta.outcome, 'found');
  assert.equal(result.meta.enrichment.status, 'enrichment_unavailable');
  assert.equal(result.meta.enrichment.failed, 1);
  assert.deepEqual(result.meta.failed, []);
});

test('HTTP 429 is retried and is not an empty inventory', async () => {
  let hits = 0;
  const page = `<script type="application/ld+json">${JSON.stringify({ '@type': 'RealEstateListing', name: '4 Elm St', price: 410000, url: 'https://agent.example/property/4', image: 'https://photos.example/4.jpg' })}</script>`;
  const fetchHtml = async () => {
    hits++;
    if (hits === 1) throw Error('HTTP 429 retry-after 0');
    return { html: page, finalUrl: new URL('https://agent.example/') };
  };
  const result = await discoverListings(['https://agent.example/'], fetchHtml, { maxPages: 3, maxDetailPages: 0 });
  assert.equal(hits, 2);
  assert.equal(result.listings.length, 1);
  assert.equal(result.meta.outcome, 'found');
  assert.ok(result.meta.obstacles.some(row => row.code === 'rate_limited'));
  assert.ok(result.meta.stages.includes('rate_limit_retry'));
});

test('a rendered search group keeps its own complete collection and drops nearby rows and price filters', async () => {
  const origin = 'https://rendered-search.example';
  const shell = '<html><script>window.gokuProps={}</script><script src="/challenge.js"></script></html>';
  const search = origin + '/homes-for-sale/search/index/';
  const primary = (title, street, price, acres) => ({
    listing: {
      title: price, subtitles: [street], pageLink: '/homedetails/' + title,
      structuredData: {
        product: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: title, url: origin + '/homedetails/' + title, offers: { price: price.replace(/\D/g, '') }, image: 'https://photos.example/' + title + '.jpg' }),
        residence: JSON.stringify({ '@context': 'https://schema.org', '@type': 'SingleFamilyResidence', address: { streetAddress: title, addressLocality: 'Index', addressRegion: 'WA' }, geo: { latitude: '47.82', longitude: '-121.55' } }),
      },
      media: [{ originalUrl: 'https://photos.example/' + title + '-full.jpg' }, { originalUrl: 'https://photos.example/' + title + '-2.jpg' }],
      subStats: [{ title: 'beds', subtitle: '3' }, { title: 'baths', subtitle: '2' }, { title: 'acres', subtitle: acres }],
    },
  });
  const body = JSON.stringify({
    lolResults: { totalItems: 2, data: [primary('10 River Road', '10 River Road, Index, WA', '$695,000', '1.2'), primary('20 Pine Lane', '20 Pine Lane, Index, WA', '$450,000', '0.4')] },
    nearbyResults: { totalItems: 900, data: [primary('Far Away', 'Far Away, Other, WA', '$100,000', '9')] },
  });
  const rendered = `<a href="${origin}/homes-for-sale/index/100k-price/">Homes for Sale under $100K</a>`
    + `<script type="application/ld+json">${JSON.stringify({ '@type': 'RealEstateListing', name: 'Far Away', price: 100000, url: origin + '/homedetails/Far%20Away', image: 'https://photos.example/far.jpg' })}</script>`;
  const fetchHtml = async () => ({ html: shell, finalUrl: new URL(origin + '/') });
  const renderPage = async () => ({ html: rendered, finalUrl: new URL(origin + '/'), network: [{ url: search, html: body }] });
  const result = await discoverListings([origin + '/'], fetchHtml, { maxPages: 4, maxListings: 20, maxDetailPages: 0, renderPage });
  assert.deepEqual(result.listings.map(row => row.title).sort(), ['10 River Road', '20 Pine Lane']);
  assert.equal(result.listings.every(row => row.price && row.images.length === 2 && row.beds === 3), true);
  assert.equal(result.listings.find(row => row.title === '10 River Road').facts['Lot Acres'], '1.2');
  assert.equal(result.listings.find(row => row.title === '10 River Road').facts.Coordinates, '47.82, -121.55');
  assert.equal(result.meta.outcome, 'found');
  assert.equal(result.meta.inventoryStatus, 'inventory_complete');
  assert.equal(result.meta.expectedCount, 2);
  assert.equal(result.meta.coverage, 'collection');
  assert.ok(result.meta.stages.includes('browser_render_escalated'));
  assert.ok(result.meta.stages.includes('api_discovered'));
  assert.equal(result.listings.some(row => /k-price|Far Away/.test(row.sourceUrl + row.title)), false);
});

test('rendering a shell discovers the structured search instead of stopping', async () => {
  const origin = 'https://rendered.example';
  const shell = '<div id="root"></div><script src="/app.js"></script>';
  const search = engine.chimeListingSearchRequests(chimeShell, new URL(origin + '/'))[0];
  const fetchHtml = async url => {
    if (url === search) return { html: chimeJson, finalUrl: new URL(url) };
    return { html: shell, finalUrl: new URL(url) };
  };
  const renderPage = async () => ({ html: chimeShell, finalUrl: new URL(origin + '/'), network: [{ url: search, html: chimeJson }] });
  const result = await discoverListings([origin + '/'], fetchHtml, { maxPages: 4, maxDetailPages: 0, renderPage });
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].title, '1018 Mogul Hill Rd');
  assert.equal(result.meta.outcome, 'found');
  assert.ok(!result.meta.issues.some(row => row.code === 'requires-rendering'));
  assert.ok(result.meta.stages.includes('browser_render_escalated'));
  assert.ok(result.meta.stages.includes('api_discovered'));
  assert.equal(result.meta.candidates[0].id, 'lofty_chime');
});

test('captcha and failed script gates preserve a resumable state and invent no listings', async () => {
  const robot = '<html><head><title>Robot Validate</title></head><body><h2>Error Access denied</h2><div id="recaptcha-wrap"></div></body></html>';
  const blocked = await discoverListings(['https://blocked.example/listings'], async () => ({ html: robot, finalUrl: new URL('https://blocked.example/listings') }), { maxPages: 2, maxDetailPages: 0 });
  assert.equal(blocked.listings.length, 0);
  assert.equal(blocked.meta.inventoryStatus, 'inventory_blocked');
  assert.ok(blocked.meta.obstacles.some(row => row.code === 'captcha_required'));
  assert.equal(blocked.meta.resume.obstacle, 'captcha_required');
  assert.deepEqual(blocked.meta.resume.seeds, ['https://blocked.example/listings']);
  const gated = await discoverListings(['https://gated.example/'], async () => ({ html: scriptGate(), finalUrl: new URL('https://gated.example/') }), { maxPages: 2, maxDetailPages: 0 });
  assert.equal(gated.meta.inventoryStatus, 'inventory_blocked');
  assert.ok(gated.meta.obstacles.some(row => row.code === 'script_gate'));
  assert.equal(gated.meta.resume.seeds[0], 'https://gated.example/');
});

test('continuation requests stay pending-only and each batch returns before the isolate deadline', () => {
  const client = fs.readFileSync(path.resolve(__dirname, '../lib/appBuilder/buildService.ts'), 'utf8');
  const edge = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/index.ts'), 'utf8');
  assert.equal(client.includes('resume: { pending: resume.pending }'), true);
  assert.equal(client.includes('batch < 40'), true);
  assert.equal(/body = \{ \.\.\.baseBody, resume \}/.test(client), false);
  assert.equal(client.includes('listings: Array.isArray(listings)'), false);
  assert.equal(edge.includes('maxDurationMs: 22000'), true);
  assert.equal(edge.includes('priorListings,'), false);
  assert.equal(edge.includes('select(continuingListings ? "sources,evidence,status"'), true);
  assert.equal(client.includes('batch < 40'), true);
  assert.equal(client.includes('savedResume'), true);
  assert.equal(client.includes('scope_not_established'), true);
});

test('deployment bundle contains the authoritative discovery engine', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingDiscovery.ts'), 'utf8').replace(/^export /gm, '').replace(/\s+$/, '\n');
  const bundle = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/deploy.bundle.ts'), 'utf8');
  assert.ok(bundle.includes(source), 'production bundle drifted from listingDiscovery.ts');
  assert.match(bundle, /enrichAll: true/);
  assert.match(source, /function classifyObstacle/);
  assert.match(source, /function architectureCandidates/);
  assert.match(source, /enrichAll \? listings\.length/);
});

test('production bundle discovery matches the source engine on a chime collection', async () => {
  const bundle = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/deploy.bundle.ts'), 'utf8');
  const start = bundle.indexOf('const { publicListingRequestHeaders');
  const end = bundle.indexOf('const { parseListingCsv');
  const slice = bundle.slice(start, end).replace(
    'const { publicListingRequestHeaders, decodePublicListingResponse, discoverListings, discoverListingsAcrossBatches, continueAfterVerification, isRobotChallenge, isPublishedScriptGate, createListingRenderer, listingRenderBackendFromEnv } =',
    'const exported =');
  const compiled = ts.transpileModule(slice + '\nmodule.exports = exported;\n', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const moduleRef = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(require, moduleRef, moduleRef.exports);
  const origin = 'https://bundle-check.example';
  const search = engine.chimeListingSearchRequests(chimeShell, new URL(origin + '/'))[0];
  const fetchHtml = async (url, options) => {
    if (url.includes('/api-site/search/realTimeListings')) return { html: chimeJson, finalUrl: new URL(url) };
    if (!options?.cookie) return { html: scriptGate(), finalUrl: new URL(url) };
    return { html: chimeShell, finalUrl: new URL(url) };
  };
  const options = { maxPages: 4, maxListings: 10, maxDetailPages: 0 };
  const fromSource = await discoverListings([origin + '/'], fetchHtml, options);
  const fromBundle = await moduleRef.exports.discoverListings([origin + '/'], fetchHtml, options);
  assert.deepEqual(fromBundle.listings, fromSource.listings);
  assert.equal(fromBundle.meta.outcome, fromSource.meta.outcome);
  assert.equal(fromBundle.meta.inventoryStatus, fromSource.meta.inventoryStatus);
  assert.deepEqual(fromBundle.meta.enrichment, fromSource.meta.enrichment);
  assert.equal(fromBundle.meta.candidates[0].id, 'lofty_chime');
  assert.ok(fromBundle.listings[0].price);
  assert.equal(search.includes('featureListingName=Custom-Example1'), true);
});

test('a frameset with one document is the site, and two frames are not followed', async () => {
  const origin = 'https://forward.example';
  const seen = [];
  const framed = await discoverListings([origin + '/'], async (url, options) => {
    seen.push(url);
    if (url === origin + '/') return { html: '<html><head><title>Agent</title></head><frameset rows="100%,*"><frame src="https://inventory.example/"></frame></frameset></html>', finalUrl: new URL(url) };
    if (url.includes('/api-site/search/realTimeListings')) return { html: chimeJson, finalUrl: new URL(url) };
    if (!options?.cookie) return { html: scriptGate(), finalUrl: new URL(url) };
    return { html: chimeShell, finalUrl: new URL(url) };
  }, { maxPages: 6, maxDetailPages: 0 });
  assert.equal(framed.listings.length, 1);
  assert.equal(framed.listings[0].title, '1018 Mogul Hill Rd');
  assert.equal(framed.meta.inventoryStatus, 'inventory_complete');
  assert.ok(framed.meta.stages.includes('frame_document'));
  assert.equal(seen[0], origin + '/');
  assert.equal(seen[1], 'https://inventory.example/');
  let extra = 0;
  const split = await discoverListings([origin + '/split'], async () => {
    extra++;
    return { html: '<frameset><frame src="https://a.example/"></frame><frame src="https://b.example/"></frame></frameset>', finalUrl: new URL(origin + '/split') };
  }, { maxPages: 4, maxDetailPages: 0 });
  assert.equal(extra, 1);
  assert.equal(split.listings.length, 0);
  assert.equal(split.meta.stages.includes('frame_document'), false);
});

test('paused verification resumes only pending pages and does not store the session', async () => {
  const secret = 'session-secret-value-not-logged';
  const kept = { title: '10 Pine St', description: 'Already complete remarks about this home.', price: '$250,000', beds: 3, baths: 2, sqft: '1,100', neighborhood: 'Town', image: 'https://photos.example/a.jpg', images: ['https://photos.example/a.jpg'], sourceUrl: 'https://agent.example/property/1', detailsComplete: true };
  const waiting = { title: '12 Pine St', description: '', price: '$350,000', beds: 4, baths: 2, sqft: '1,800', neighborhood: 'Town', image: 'https://photos.example/b.jpg', images: ['https://photos.example/b.jpg'], sourceUrl: 'https://agent.example/property/2', detailsComplete: false };
  const seen = [];
  const detail = url => `<script type="application/ld+json">${JSON.stringify({ '@type': 'RealEstateListing', name: '12 Pine St', price: 350000, url, description: 'Full public remarks for this property. '.repeat(4), image: ['https://photos.example/b.jpg', 'https://photos.example/c.jpg'] })}</script>`;
  const resumed = await engine.resumePausedImport(
    { seeds: ['https://agent.example/'], pending: [waiting.sourceUrl, kept.sourceUrl], listings: [kept, waiting], obstacle: 'captcha_required', stage: 'verification_required' },
    async (url, options) => { seen.push(url); assert.equal(options.cookie, secret); return { html: detail(url), finalUrl: new URL(url) }; },
    async () => ({ cookie: secret }));
  assert.deepEqual(seen, [waiting.sourceUrl]);
  assert.equal(resumed.listings.length, 2);
  assert.equal(resumed.listings[0].detailsComplete, true);
  assert.equal(resumed.listings[1].detailsComplete, true);
  assert.equal(resumed.listings[1].description.includes('Full public remarks'), true);
  assert.equal(resumed.meta.resume, undefined);
  assert.equal(JSON.stringify(resumed).includes(secret), false);
  const blocked = await engine.continueAfterVerification(
    { seeds: ['https://agent.example/'], pending: [waiting.sourceUrl], listings: [kept, { ...waiting }], obstacle: 'captcha_required' },
    secret,
    async url => ({ html: '<title>Robot Validate</title><div id="recaptcha-wrap"></div>', finalUrl: new URL(url) }));
  assert.equal(blocked.listings.length, 2);
  assert.equal(blocked.listings[1].detailsComplete, false);
  assert.equal(blocked.meta.inventoryStatus, 'inventory_complete');
  assert.equal(blocked.meta.resume.stage, 'verification_required');
  assert.deepEqual(blocked.meta.resume.pending, [waiting.sourceUrl]);
  assert.equal(JSON.stringify(blocked).includes(secret), false);
  const idle = await engine.resumePausedImport(
    { seeds: ['https://walled.example/'], pending: ['https://walled.example/property/2'], listings: [kept, waiting], obstacle: 'captcha_required' },
    async () => { throw new Error('should not fetch'); },
    async () => null);
  assert.equal(idle.listings.length, 2);
  assert.equal(idle.meta.resume.stage, 'verification_required');
  assert.equal(idle.meta.obstacles[0].code, 'captcha_required');
});

const card = (title, slug, price = '$350,000') => `<a href="/property/${slug}">${title} ${price}</a>`;

test('collection boundaries prove exhaustion without treating bare cards as complete', async () => {
  const origin = 'https://unfamiliar-broker.example';
  const pages = {
    [origin + '/listings']: `<nav class="pagination"><a href="?page=2">2</a><a rel="next" href="?page=2">Next</a></nav>${card('12 Pine St', '12-pine')}`,
    [origin + '/listings?page=2']: `<nav class="pagination"><a href="?page=1">1</a></nav>${card('14 Oak St', '14-oak', '$400,000')}`,
  };
  const numbered = await discoverListings([origin + '/listings'], fixtureFetch(pages), { maxPages: 6, maxDetailPages: 0 });
  assert.equal(numbered.listings.length, 2);
  assert.ok(numbered.listings.every(row => /Pine|Oak/.test(row.title)));
  assert.equal(numbered.meta.inventoryStatus, 'inventory_complete');
  assert.ok(numbered.meta.completenessEvidence.includes('pagination_exhausted'));
  assert.equal(numbered.meta.collectionBoundary.continuationRequests, 1);

  const cursorPages = {
    [origin + '/feed']: JSON.stringify({ listings: [{ streetAddress: '12 Pine St', listPrice: 350000, detailUrl: origin + '/property/12-pine' }], hasNextPage: true, nextUrl: origin + '/feed?cursor=abc' }),
    [origin + '/feed?cursor=abc']: JSON.stringify({ listings: [{ streetAddress: '14 Oak St', listPrice: 400000, detailUrl: origin + '/property/14-oak' }], hasNextPage: false, nextCursor: null }),
  };
  const cursor = await discoverListings([origin + '/feed'], fixtureFetch(cursorPages), { maxPages: 4, maxDetailPages: 0 });
  assert.equal(cursor.listings.length, 2);
  assert.equal(cursor.meta.inventoryStatus, 'inventory_complete');
  assert.ok(cursor.meta.completenessEvidence.includes('cursor_exhausted'));

  const onePage = await discoverListings([origin + '/only'], async () => ({ html: card('12 Pine St', '12-pine') + '<section data-has-next-page="false"></section>', finalUrl: new URL(origin + '/only') }), { maxDetailPages: 0 });
  assert.equal(onePage.meta.inventoryStatus, 'inventory_complete');
  assert.ok(onePage.meta.completenessEvidence.includes('single_page_collection_confirmed'));

  const hidden = await discoverListings([origin + '/more'], async () => ({ html: card('12 Pine St', '12-pine') + '<button>Load more listings</button>', finalUrl: new URL(origin + '/more') }), { maxDetailPages: 0 });
  assert.equal(hidden.listings.length, 1);
  assert.equal(hidden.meta.inventoryStatus, 'inventory_partial');
  assert.deepEqual(hidden.meta.completenessEvidence, ['collection_boundary_unknown']);

  const loadMorePages = {
    [origin + '/sale']: card('12 Pine St', '12-pine') + '<button data-url="' + origin + '/sale?page=2">Load more listings</button>',
    [origin + '/sale?page=2']: card('14 Oak St', '14-oak', '$400,000') + '<div data-has-next-page="false"></div>',
  };
  const loaded = await discoverListings([origin + '/sale'], fixtureFetch(loadMorePages), { maxPages: 4, maxDetailPages: 0 });
  assert.equal(loaded.listings.length, 2);
  assert.equal(loaded.meta.inventoryStatus, 'inventory_complete');
  assert.equal(loaded.meta.collectionBoundary.mechanism, 'load-more');

  let repeatedFetches = 0;
  const repeated = await discoverListings([origin + '/loop'], async () => {
    repeatedFetches++;
    return { html: JSON.stringify({ listings: [{ streetAddress: '12 Pine St', listPrice: 350000, detailUrl: origin + '/property/12-pine' }], hasNextPage: true, nextUrl: origin + '/loop' }), finalUrl: new URL(origin + '/loop') };
  }, { maxPages: 4, maxDetailPages: 0 });
  assert.equal(repeatedFetches, 1);
  assert.equal(repeated.meta.inventoryStatus, 'inventory_partial');
  assert.equal(repeated.meta.completenessEvidence.includes('cursor_exhausted'), false);

  const nearby = await discoverListings([origin + '/primary'], async () => ({
    html: '<section data-has-next-page="false">' + card('12 Pine St', '12-pine') + '</section><aside class="nearby-homes">' + card('Far Away', 'far-away', '$100,000') + '</aside>',
    finalUrl: new URL(origin + '/primary'),
  }), { maxDetailPages: 0 });
  assert.equal(nearby.listings.length, 1);
  assert.match(nearby.listings[0].title, /Pine/);
  assert.equal(nearby.listings.some(row => /Far Away/.test(row.title)), false);
  assert.equal(nearby.meta.inventoryStatus, 'inventory_complete');

  const unknown = await discoverListings([origin + '/cards'], async () => ({ html: card('12 Pine St', '12-pine') + card('14 Oak St', '14-oak', '$400,000'), finalUrl: new URL(origin + '/cards') }), { maxDetailPages: 0 });
  assert.equal(unknown.listings.length, 2);
  assert.equal(unknown.meta.inventoryStatus, 'inventory_partial');
  assert.equal(unknown.meta.outcome, 'found');
  assert.deepEqual(unknown.meta.completenessEvidence, ['collection_boundary_unknown']);

  const agreed = '<a href="' + origin + '/property/12-pine">12 Pine St $350,000</a><script type="application/ld+json">' + JSON.stringify({ '@type': 'RealEstateListing', name: '12 Pine St', price: 350000, url: origin + '/property/12-pine' }) + '</script>';
  const cross = await discoverListings([origin + '/cross'], async () => ({ html: agreed, finalUrl: new URL(origin + '/cross') }), { maxDetailPages: 0 });
  assert.equal(cross.listings.length, 1);
  assert.equal(cross.meta.inventoryStatus, 'inventory_complete');
  assert.ok(cross.meta.completenessEvidence.includes('single_page_collection_confirmed') || cross.meta.completenessEvidence.includes('structured_group_exhausted'));

  const query = 'query Properties($limit: Int, $offset: Int) { properties(limit: $limit, offset: $offset) { id } propertiesCount { count } }';
  const scoped = { pageSize: '1', useRouterApi: false, query, variables: { limit: 1, offset: 0, featuredListing: true, statusId: '{{variables.statusId}}' } };
  const market = { pageSize: '50', useRouterApi: false, query, variables: { limit: 50, offset: 0, globalProperty: true } };
  const embed = blob => 'JSON.parse(' + JSON.stringify(JSON.stringify(blob)) + ')';
  const page = '<script>window.site={apiGatewayUrl:\'/api-gw\',routerUrl:\'/api-nv\'};' + embed(scoped) + ';' + embed(market) + ';</script>'
    + '<a href="/properties/12-pine">12 Pine St $350,000</a>'
    + '<a href="{{#if fromMLS}}/home-search/listings/{{id}}{{^}}/properties/{{slug}}{{/if}}">template</a>';
  const graphqlCalls = [];
  const offsetResult = await discoverListings([origin + '/sale'], async url => {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith('/graphql')) return { html: page, finalUrl: new URL(origin + '/sale') };
    const variables = JSON.parse(parsed.searchParams.get('variables'));
    graphqlCalls.push(variables.offset);
    assert.equal(variables.featuredListing, true);
    assert.equal(variables.globalProperty, undefined);
    assert.equal(variables.statusId, undefined);
    const rows = variables.offset === 0
      ? [{ slug: '12-pine', name: '12 Pine St', salesPrice: 350000, status: 'FOR_SALE', media: [{ largeUrl: origin + '/a.jpg' }] }]
      : [{ slug: '14-oak', fullAddress: '14 Oak St', salesPrice: 400000, status: 'FOR_SALE', bedroomCount: 3, livingSpaceSize: 1800 }];
    return { html: JSON.stringify({ data: { properties: rows, propertiesCount: { count: 2 } } }), finalUrl: parsed };
  }, { maxPages: 6, maxDetailPages: 0 });
  assert.deepEqual(graphqlCalls, [0, 1]);
  assert.equal(offsetResult.listings.length, 2);
  assert.equal(offsetResult.meta.expectedCount, 2);
  assert.equal(offsetResult.meta.inventoryStatus, 'inventory_complete');
  assert.ok(offsetResult.meta.completenessEvidence.includes('api_total_match'));
  assert.ok(offsetResult.meta.completenessEvidence.includes('pagination_exhausted'));
  assert.equal(offsetResult.listings.some(row => row.sourceUrl === origin + '/properties/14-oak'), true);
  assert.equal(offsetResult.meta.collectionBoundary.mechanism, 'offset-query');

  const short = { ...scoped, variables: { ...scoped.variables } };
  const shortPage = '<script>window.site={apiGatewayUrl:\'/api-gw\'};' + embed(short) + ';</script>' + '<a href="/properties/12-pine">12 Pine St $350,000</a>'
    + '<a href="{{#if fromMLS}}/listings/{{id}}{{^}}/properties/{{slug}}{{/if}}">template</a>';
  const partial = await discoverListings([origin + '/short'], async url => {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith('/graphql')) return { html: shortPage, finalUrl: new URL(origin + '/short') };
    const offset = JSON.parse(parsed.searchParams.get('variables')).offset;
    const rows = offset === 0
      ? [{ slug: '12-pine', fullAddress: '12 Pine St', salesPrice: 350000, status: 'FOR_SALE' }]
      : [{ name: 'Call for price', status: 'FOR_SALE' }];
    return { html: JSON.stringify({ data: { properties: rows, propertiesCount: { count: 2 } } }), finalUrl: parsed };
  }, { maxPages: 6, maxDetailPages: 0 });
  assert.equal(partial.listings.length, 1);
  assert.equal(partial.meta.expectedCount, 2);
  assert.equal(partial.meta.accounting.sourceSeen, 2);
  assert.equal(partial.meta.accounting.excludedTotal, 1);
  assert.equal(partial.meta.accounting.exclusions[0].reason, 'excluded_missing_required_fields');
  assert.equal(partial.meta.accounting.eligibleTotal, 1);
  assert.equal(partial.meta.accounting.eligibleImportComplete, true);
  assert.equal(partial.meta.inventoryStatus, 'inventory_complete');
  assert.ok(partial.meta.completenessEvidence.includes('published_collection_total_reconciled'));
  assert.ok(partial.meta.completenessEvidence.includes('pagination_exhausted'));
  assert.equal(partial.meta.completenessEvidence.includes('api_total_match'), false);
});

test('tracking parameters are not a second home, and distinct provider ids stay separate', async () => {
  const origin = 'https://identity.example';
  const haydenA = '1180161142';
  const haydenB = '1181281776';
  const cheyenne = '1190220569';
  const ld = (id, title, price) => ({ '@type': 'RealEstateListing', name: title, price, url: `${origin}/listing-detail/${id}/${title.replace(/\s+/g, '-')}` });
  const html = '<script type="application/ld+json">' + JSON.stringify([
    ld(haydenA, '10 Hayden Lake Rd', 585000),
    ld(haydenB, '10 Hayden Lake Rd', 585000),
    ld(cheyenne, '232 Cheyenne Dr', 775000),
  ]) + '</script>'
    + `<a href="/listing-detail/${cheyenne}/232-Cheyenne-Dr?source=feature_listing&timeStamp=1791223041347&listingSort=RELEVANCE&timezone=GMT%2B0000&featureListingName=Custom-Example&pageSize=40&siteId=8188&page=1&requestId=1169033149">New</a> $775,000`
    + '<a href="/listing/salmlsfull/214909/1280-broad">1280 Broad Street $100,000</a>'
    + '<a href="/listing/wgmls/558764/1280-broad">1280 Broad Street $100,000</a>';
  const result = await discoverListings([origin + '/listings'], async () => ({ html, finalUrl: new URL(origin + '/listings') }), { maxDetailPages: 0 });
  assert.equal(result.listings.length, 5);
  const sameAddress = result.listings.filter(row => row.title === '10 Hayden Lake Rd');
  assert.equal(sameAddress.length, 2);
  assert.equal(new Set(sameAddress.map(row => row.sourceUrl)).size, 2);
  const featured = result.listings.find(row => row.sourceUrl.includes(cheyenne));
  assert.equal(featured.title, '232 Cheyenne Dr');
  assert.equal(featured.sourceUrl.includes('?'), false);
  assert.equal(featured.sourceUrl.includes('featureListingName'), false);
  assert.equal(result.listings.filter(row => row.sourceUrl.includes('/1280-broad')).length, 2);
  assert.equal(result.listings.some(row => row.title === 'New'), false);
});

test('a batch limit continues into the next page while time and page budget remain', async () => {
  const origin = 'https://paged.example';
  const pages = {
    [origin + '/listings']: '<nav class="pagination"><a rel="next" href="?page=2">Next</a></nav>' + card('12 Pine St', '12-pine') + card('14 Oak St', '14-oak', '$400,000'),
    [origin + '/listings?page=2']: card('16 Elm St', '16-elm', '$500,000'),
  };
  const seen = [];
  const finished = await discoverListings([origin + '/listings'], async uri => {
    seen.push(uri);
    if (!pages[uri]) throw new Error('unreadable page');
    return { html: pages[uri], finalUrl: new URL(uri) };
  }, { maxPages: 6, maxListings: 2, maxDetailPages: 0 });
  assert.deepEqual(seen, [origin + '/listings', origin + '/listings?page=2']);
  assert.equal(finished.listings.length, 3);
  assert.equal(finished.meta.inventoryStatus, 'inventory_complete');
  assert.equal(finished.meta.completenessEvidence.includes('collection_limit_reached'), false);
  assert.ok(finished.meta.completenessEvidence.includes('pagination_exhausted'));
  assert.equal(finished.meta.collectionBoundary.continuationAvailable, false);
  assert.equal(finished.meta.resume, undefined);
  assert.equal(finished.meta.accounting.eligibleImportComplete, true);
});

test('a batch limit stays partial when the page budget blocks the next page', async () => {
  const origin = 'https://paged.example';
  const pages = {
    [origin + '/listings']: '<nav class="pagination"><a rel="next" href="?page=2">Next</a></nav>' + card('12 Pine St', '12-pine') + card('14 Oak St', '14-oak', '$400,000'),
    [origin + '/listings?page=2']: card('16 Elm St', '16-elm', '$500,000'),
  };
  const seen = [];
  const capped = await discoverListings([origin + '/listings'], async uri => {
    seen.push(uri);
    if (!pages[uri]) throw new Error('unreadable page');
    return { html: pages[uri], finalUrl: new URL(uri) };
  }, { maxPages: 1, maxListings: 2, maxDetailPages: 0 });
  assert.deepEqual(seen, [origin + '/listings']);
  assert.equal(capped.listings.length, 2);
  assert.equal(capped.meta.inventoryStatus, 'inventory_partial');
  assert.ok(capped.meta.completenessEvidence.includes('collection_limit_reached'));
  assert.equal(capped.meta.completenessEvidence.includes('pagination_exhausted'), false);
  assert.equal(capped.meta.collectionBoundary.continuationAvailable, true);
  assert.equal(capped.meta.resume.stage, 'collection_continuation');
  assert.equal(capped.meta.resume.obstacle, 'collection_limit_reached');
  assert.ok(capped.meta.resume.pending.some(url => url.includes('page=2')));
  assert.equal(capped.meta.accounting.eligibleImportComplete, false);
});

test('a batch limit walks every later page while time and page budget remain', async () => {
  const origin = 'https://paged.example';
  const pages = {};
  for (let page = 1; page <= 5; page++) {
    const url = page === 1 ? origin + '/listings' : origin + '/listings?page=' + page;
    const next = page < 5 ? `<nav class="pagination"><a rel="next" href="?page=${page + 1}">Next</a></nav>` : '<nav class="pagination"><span>5</span></nav>';
    pages[url] = next + card(page + ' Pine St', 'pine-' + page);
  }
  const seen = [];
  const result = await discoverListings([origin + '/listings'], async uri => {
    seen.push(uri);
    if (!pages[uri]) throw new Error('unreadable page');
    return { html: pages[uri], finalUrl: new URL(uri) };
  }, { maxPages: 10, maxListings: 2, maxDetailPages: 0 });
  assert.equal(seen.length, 5);
  assert.equal(result.listings.length, 5);
  assert.equal(result.meta.inventoryStatus, 'inventory_complete');
  assert.equal(result.meta.completenessEvidence.includes('collection_limit_reached'), false);
  assert.ok(result.meta.completenessEvidence.includes('pagination_exhausted'));
  assert.equal(result.meta.resume, undefined);
});

test('subsequent batches resume after a page budget until the collection is exhausted', async () => {
  const origin = 'https://paged.example';
  const pages = {};
  for (let page = 1; page <= 3; page++) {
    const url = page === 1 ? origin + '/listings' : origin + '/listings?page=' + page;
    const next = page < 3 ? `<nav class="pagination"><a rel="next" href="?page=${page + 1}">Next</a></nav>` : '<nav class="pagination"><span>3</span></nav>';
    pages[url] = next + card(page + ' A St', 'a-' + page) + card(page + ' B St', 'b-' + page, '$400,000');
  }
  const result = await discoverListingsAcrossBatches([origin + '/listings'], async uri => {
    if (!pages[uri]) throw new Error('unreadable page');
    return { html: pages[uri], finalUrl: new URL(uri) };
  }, { maxPages: 1, maxListings: 2, maxDetailPages: 0, maxDurationMs: 15000 });
  assert.equal(result.listings.length, 6);
  assert.equal(result.meta.inventoryStatus, 'inventory_complete');
  assert.equal(result.meta.resume, undefined);
  assert.equal(result.meta.accounting.eligibleImportComplete, true);
});

test('a continuation deadline does not enrich before the next page is collected', async () => {
  const origin = 'https://paged.example';
  const first = origin + '/listings';
  const seen = [];
  const html = '<nav class="pagination"><a rel="next" href="?page=2">Next</a></nav>' + card('12 Pine St', '12-pine') + card('14 Oak St', '14-oak', '$400,000');
  const result = await discoverListingsAcrossBatches([first], async uri => {
    seen.push(uri);
    return { html, finalUrl: new URL(uri) };
  }, { maxPages: 1, maxListings: 2, maxBatches: 1, enrichAll: true, maxDurationMs: 15000, maxDetailPages: 20 });
  assert.deepEqual(seen, [first]);
  assert.equal(result.listings.length, 2);
  assert.equal(result.meta.resume.stage, 'collection_continuation');
  assert.equal(result.meta.enrichment?.enriched ?? 0, 0);
  assert.notEqual(result.meta.inventoryStatus, 'inventory_complete');
});

test('a captcha on the next page stops automatic batches', async () => {
  const origin = 'https://paged.example';
  const robot = '<html><head><title>Robot Validate</title></head><body><h2>Error Access denied</h2><div id="recaptcha-wrap"></div></body></html>';
  const first = origin + '/listings';
  const second = origin + '/listings?page=2';
  const pages = {
    [first]: '<nav class="pagination"><a rel="next" href="?page=2">Next</a></nav>' + card('12 Pine St', '12-pine') + card('14 Oak St', '14-oak', '$400,000'),
    [second]: robot,
  };
  const result = await discoverListingsAcrossBatches([first], async uri => ({ html: pages[uri] ?? robot, finalUrl: new URL(uri) }), { maxPages: 1, maxListings: 2, maxDetailPages: 0, maxDurationMs: 15000 });
  assert.equal(result.listings.length, 2);
  assert.notEqual(result.meta.inventoryStatus, 'inventory_complete');
  assert.ok(result.meta.obstacles.some(row => row.code === 'captcha_required'));
  assert.equal(result.meta.accounting.eligibleImportComplete, false);
});

test('an Eureka client id without a featured Kestrel widget is not a scoped collection', async () => {
  const origin = 'https://agent.example';
  const seen = [];
  const html = '<script src="https://www.idxhome.com/eureka/ihf-eureka.js"></script>'
    + '<div data-ihf-client-id="178012"></div>'
    + card('12 Pine St', '12-pine')
    + '<a href="/homes-for-sale-featured/">Featured homes</a>';
  const result = await discoverListings([origin + '/'], async uri => {
    seen.push(uri);
    return { html, finalUrl: new URL(uri) };
  }, { maxPages: 4, maxListings: 20, maxDetailPages: 0 });
  assert.equal(seen.some(uri => /idxhome\.com\/api\/(?:site\/\d+\/listings|kestrel\/listings)\.json/.test(uri)), false);
  assert.equal(kestrelInventoryRequests(html).length, 0);
  assert.notEqual(result.meta.inventoryStatus, 'inventory_complete');
  assert.equal(result.meta.accounting?.eligibleImportComplete, false);
});

test('an MLS-board archive without an owner constraint is not imported or paginated', async () => {
  const origin = 'https://market.example';
  const seen = [];
  const page = (id) => '<nav class="pagination"><a rel="next" href="/properties/2/?listingType=Residential">Next</a></nav>'
    + `<a href="/our-listings/">Our Listings</a>`
    + `<a href="/listing/crmls/${id}100/Torrance/1-main/">1 Main Torrance $900,000</a>`
    + `<a href="/listing/crmls/${id}200/Oroville/2-main/">2 Main Oroville $700,000</a>`;
  const result = await discoverListings([origin + '/properties/'], async uri => {
    seen.push(uri);
    if (uri === origin + '/our-listings/') {
      return { html: '<a href="/listing/crmls/OC1/Newport-Beach/3-main/">3 Main $1,000,000</a><a href="/listing/crmls/SN2/Beverly-Hills/4-main/">4 Main $2,000,000</a>', finalUrl: new URL(uri) };
    }
    return { html: page('SB'), finalUrl: new URL(uri) };
  }, { maxPages: 6, maxListings: 20, maxDetailPages: 0 });
  assert.deepEqual(seen, [origin + '/properties/', origin + '/our-listings/']);
  assert.equal(result.listings.length, 0);
  assert.notEqual(result.meta.inventoryStatus, 'inventory_complete');
  assert.notEqual(result.meta.inventoryStatus, 'inventory_empty');
  assert.ok(result.meta.completenessEvidence.includes('scope_not_established'));
  assert.equal(result.meta.accounting.importedEligible, 0);
  assert.ok(result.meta.accounting.exclusions.some(row => row.reason === 'excluded_unscoped_market' && row.count === 4));
  assert.notEqual(result.meta.resume && result.meta.resume.stage, 'collection_continuation');
  const scoped = await discoverListings([origin + '/properties/?officeId=office-1'], async uri => {
    seen.push(uri);
    const second = uri.includes('page=2');
    const next = second ? '' : '<nav class="pagination"><a rel="next" href="/properties/?officeId=office-1&page=2">Next</a></nav>';
    const first = second ? 'SB3' : 'SB1';
    const other = second ? 'SB4' : 'SB2';
    return { html: next + `<a href="/listing/crmls/${first}/Torrance/1-main/">${first} $900,000</a><a href="/listing/crmls/${other}/Torrance/2-main/">${other} $800,000</a>`, finalUrl: new URL(uri) };
  }, { maxPages: 4, maxListings: 2, maxDetailPages: 0 });
  assert.equal(scoped.listings.length, 4);
  assert.equal(scoped.meta.obstacles.some(row => row.code === 'scope_not_established'), false);
  const chrome = await discoverListings([origin + '/market/'], async uri => {
    return { html: '<div data-agent-id="chrome-agent"></div>' + page('OC'), finalUrl: new URL(uri) };
  }, { maxPages: 4, maxListings: 20, maxDetailPages: 0 });
  assert.equal(chrome.listings.length, 0);
  assert.ok(chrome.meta.completenessEvidence.includes('scope_not_established'));
  const flagged = await discoverListings([origin + '/book/'], async uri => ({
    html: page('LA') + '<section data-settings="{"agent_office_listings_only":1}"></section>',
    finalUrl: new URL(uri),
  }), { maxPages: 2, maxListings: 10, maxDetailPages: 0 });
  assert.ok(flagged.listings.length >= 2);
  assert.equal(flagged.meta.obstacles.some(row => row.code === 'scope_not_established'), false);
});

test('source totals keep pending inventory and account for sold and unknown', async () => {
  const origin = 'https://status.example';
  const row = (id, status) => ({ streetAddress: id + ' Pine St', listPrice: 100000, detailUrl: origin + '/property/' + id, StandardStatus: status });
  const result = await discoverListings([origin + '/feed'], async () => ({
    html: JSON.stringify({ total: 4, listings: [row('1', 'Active'), row('2', 'Pending'), row('3', 'Sold'), row('4', 'Mystery')] }),
    finalUrl: new URL(origin + '/feed'),
  }), { maxDetailPages: 0 });
  assert.equal(result.listings.length, 4);
  assert.equal(result.listings.find(item => item.sourceUrl.endsWith('/1')).status, 'active');
  assert.equal(result.listings.find(item => item.sourceUrl.endsWith('/2')).status, 'pending');
  assert.equal(result.listings.find(item => item.sourceUrl.endsWith('/2')).sourceStatus, 'pending');
  assert.equal(result.listings.find(item => item.sourceUrl.endsWith('/3')).status, 'sold');
  assert.equal(result.listings.find(item => item.sourceUrl.endsWith('/4')).status, undefined);
  assert.equal(result.listings.find(item => item.sourceUrl.endsWith('/4')).sourceStatus, 'unknown');
  assert.equal(result.meta.accounting.sourceTotal, 4);
  assert.equal(result.meta.accounting.sourceSeen, 4);
  assert.equal(result.meta.accounting.eligibleTotal, 2);
  assert.equal(result.meta.accounting.excludedTotal, 2);
  assert.equal(result.meta.accounting.sourceCollectionExhausted, true);
  assert.equal(result.meta.accounting.eligibleImportComplete, true);
  assert.equal(result.meta.inventoryStatus, 'inventory_complete');
  assert.ok(result.meta.completenessEvidence.includes('api_total_match'));
});

test('site-scoped published queries are followed and unscoped market queries are not', async () => {
  const origin = 'https://published.example';
  const company = '11111111-1111-1111-1111-111111111111';
  const website = '22222222-2222-2222-2222-222222222222';
  const query = 'query Properties($limit: Int, $offset: Int) { properties(limit: $limit, offset: $offset) { id slug name } propertiesCount { count } }';
  const embed = blob => 'JSON.parse(' + JSON.stringify(JSON.stringify(blob)) + ')';
  const scoped = { pageSize: '2', useRouterApi: false, query, variables: { limit: '2', offset: 0, companyId: company, websiteId: website, statusIds: [1] } };
  const backfill = { pageSize: 9, resource: 'properties', variables: { companyId: company, websiteId: website, displayMLSListings: 'false' } };
  const market = { pageSize: '50', useRouterApi: false, query, variables: { limit: 50, offset: 0, globalProperty: true, companyId: company, websiteId: website } };
  const cameron = '<script>window.site={apiGatewayUrl:\'/api-gw\',routerUrl:\'/api-nv\'};' + embed(scoped) + ';' + embed(backfill) + ';' + embed(market) + ';</script>'
    + '<a href="{{#if fromMLS}}/home-search/listings/{{id}}{{^}}/properties/{{slug}}{{/if}}">template</a>'
    + '<a href="/properties/far-market">Far Market $100,000</a>';
  const calls = [];
  const cameronResult = await discoverListings([origin + '/properties'], async url => {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith('/graphql')) return { html: cameron, finalUrl: new URL(origin + '/properties') };
    const variables = JSON.parse(parsed.searchParams.get('variables'));
    calls.push(variables);
    assert.equal(typeof variables.limit, 'number');
    assert.equal(variables.companyId, company);
    assert.equal(variables.websiteId, website);
    assert.equal(variables.globalProperty, undefined);
    assert.equal(variables.displayMLSListings, undefined);
    assert.equal(variables.featuredListing, undefined);
    return { html: JSON.stringify({ data: { properties: [
      { slug: '12-pine', name: '12 Pine St', salesPrice: 350000, status: 'FOR_SALE' },
      { slug: 'private-house', name: 'Private Address', salesPrice: 35000000, status: 'FOR_SALE' },
    ], propertiesCount: { count: 2 } } }), finalUrl: parsed };
  }, { maxPages: 6, maxDetailPages: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].limit, 2);
  assert.equal(cameronResult.listings.length, 2);
  assert.equal(cameronResult.listings.some(row => row.title === 'Private Address' && row.sourceUrl === origin + '/properties/private-house'), true);
  assert.equal(cameronResult.listings.some(row => /Far Market/.test(row.title)), false);
  assert.equal(cameronResult.meta.expectedCount, 2);
  assert.equal(cameronResult.meta.inventoryStatus, 'inventory_complete');
  assert.ok(cameronResult.meta.completenessEvidence.includes('api_total_match'));
  assert.ok(cameronResult.meta.completenessEvidence.includes('pagination_exhausted'));

  const rawQuery = ' query Properties($limit: Int, $offset: Int) { properties(limit: $limit, offset: $offset) { id slug } propertiesCount { count } }';
  const zimmermanBlob = { pageSize: 1, resource: 'properties', variables: { companyId: company, websiteId: website, propertyIds: ['one-id'], prioritizeIds: true } };
  const zimmerman = '<script>window.site={apiGatewayUrl:\'/api-gw\'};window.gql=' + JSON.stringify({ properties: rawQuery }) + ';' + embed(zimmermanBlob) + ';var template=\'{{#if fromMLS}}href="/home-search/listings/{{id}}"{{else}}href="/properties/{{slug}}"{{/if}}\';</script>';
  const offsets = [];
  const zimmermanResult = await discoverListings([origin + '/sale'], async url => {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith('/graphql')) return { html: zimmerman, finalUrl: new URL(origin + '/sale') };
    const variables = JSON.parse(parsed.searchParams.get('variables'));
    offsets.push(variables.offset);
    assert.equal(parsed.searchParams.get('query').includes('propertiesCount'), true);
    assert.deepEqual(variables.propertyIds, ['one-id']);
    const rows = variables.offset === 0
      ? [{ slug: 'oak-house', name: 'Private Address', salesPrice: 35000000, fromMLS: false, status: 'FOR_SALE' }]
      : [{ slug: 'hidden', name: 'Call for price', status: 'FOR_SALE' }];
    return { html: JSON.stringify({ data: { properties: rows, propertiesCount: { count: 2 } } }), finalUrl: parsed };
  }, { maxPages: 6, maxDetailPages: 0 });
  assert.deepEqual(offsets, [0, 1]);
  assert.equal(zimmermanResult.listings.length, 2);
  assert.equal(zimmermanResult.listings.some(row => row.sourceUrl === origin + '/properties/oak-house' && row.title === 'Private Address'), true);
  assert.equal(zimmermanResult.listings.some(row => row.sourceUrl === origin + '/properties/hidden' && row.title === 'Call for price'), true);
  assert.equal(zimmermanResult.meta.inventoryStatus, 'inventory_complete');
  assert.equal(zimmermanResult.meta.expectedCount, 2);
  assert.equal(zimmermanResult.meta.accounting.sourceSeen, 2);
  assert.equal(zimmermanResult.meta.accounting.eligibleTotal, 2);
  assert.equal(zimmermanResult.meta.accounting.eligibleImportComplete, true);
  assert.ok(zimmermanResult.meta.completenessEvidence.includes('pagination_exhausted'));
  assert.ok(zimmermanResult.meta.completenessEvidence.includes('api_total_match'));

  let marketCalls = 0;
  const loose = { pageSize: 4, resource: 'properties', variables: { statusIds: [1], offset: 0 } };
  const rejected = '<script>window.site={apiGatewayUrl:\'/api-gw\'};window.gql=' + JSON.stringify({ properties: rawQuery }) + ';' + embed(market) + ';' + embed(loose) + ';</script>';
  const rejectedResult = await discoverListings([origin + '/market'], async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/graphql')) marketCalls++;
    return { html: rejected, finalUrl: new URL(origin + '/market') };
  }, { maxPages: 4, maxDetailPages: 0 });
  assert.equal(marketCalls, 0);
  assert.equal(rejectedResult.listings.length, 0);
});

test('production renderer is one bounded interface and is wired into onboarding and refresh', async () => {
  assert.equal(engine.createListingRenderer(null), undefined);
  assert.equal(engine.listingRenderBackendFromEnv(() => undefined), null);
  assert.equal(engine.listingRenderBackendFromEnv(() => 'http://render.example/run'), null);
  let calls = 0;
  const renderPage = engine.createListingRenderer(async ({ url }) => {
    calls++;
    return { html: '<div id="root"></div><script src="/app.js"></script>', finalUrl: url, network: [] };
  }, { maxRenders: 1 });
  await assert.rejects(renderPage('https://agent.example/a').then(() => renderPage('https://agent.example/b')), /browser budget/);
  assert.equal(calls, 1);
  const shell = '<div id="root"></div><script src="/app.js"></script>';
  const failed = await discoverListings(['https://render-fail.example/listings'], async () => ({ html: shell, finalUrl: new URL('https://render-fail.example/listings') }), {
    maxPages: 2, maxDetailPages: 0, renderPage: async () => { throw new Error('browser crashed'); },
  });
  assert.equal(failed.listings.length, 0);
  assert.notEqual(failed.meta.outcome, 'found');
  assert.ok(failed.meta.obstacles.some(row => row.code === 'render_failed'));
  const onboarding = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/index.ts'), 'utf8');
  assert.equal(onboarding.split('renderPage: productionRenderPage()').length - 1, 3);
  const refresh = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/refresh-listings/sourceHandler.ts'), 'utf8');
  assert.match(refresh, /createListingRenderer\(listingRenderBackendFromEnv/);
  const sources = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/refresh-listings/sources.ts'), 'utf8');
  assert.match(sources, /renderPage/);
  const originalFetch = globalThis.fetch;
  try {
    let posted = null;
    globalThis.fetch = async (url, options) => {
      posted = { url: String(url), options };
      const payload = JSON.parse(options.body);
      assert.equal(payload.url, 'https://agent.example/listings');
      if (payload.cookie) assert.equal(payload.cookie, 'session-secret-value');
      return new Response(JSON.stringify({
        html: '<html><a href="/property/12-pine">12 Pine St $350,000</a></html>',
        finalUrl: 'https://agent.example/listings',
        network: Array.from({ length: 40 }, (_, i) => ({ url: `https://agent.example/api/search?n=${i}`, html: '{"ok":true}' })),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const backend = engine.listingRenderBackendFromEnv(name => name === 'LISTING_RENDER_URL' ? 'https://render.example/run' : name === 'LISTING_RENDER_TOKEN' ? 'render-token' : undefined);
    const renderPage = engine.createListingRenderer(backend, { maxRenders: 2, timeoutMs: 1000 });
    const challenge = '<html><head><title>Just a moment...</title></head><body>checking</body></html>';
    const rendered = await discoverListings(['https://agent.example/listings'], async () => ({ html: challenge, finalUrl: new URL('https://agent.example/listings') }), {
      maxPages: 2, maxDetailPages: 0, sessionCookie: 'session-secret-value', renderPage,
    });
    assert.equal(posted.options.headers.authorization, 'Bearer render-token');
    assert.equal(JSON.parse(posted.options.body).cookie, 'session-secret-value');
    assert.equal(JSON.stringify(rendered).includes('session-secret-value'), false);
    assert.ok(rendered.meta.stages.includes('browser_render_escalated'));
    assert.equal(rendered.listings.length, 1);
    const bounded = await renderPage('https://agent.example/listings');
    assert.equal(bounded.network.length, 30);
    globalThis.fetch = async () => new Response('nope', { status: 502 });
    await assert.rejects(backend({ url: 'https://agent.example/other' }), /Renderer returned 502/);
    globalThis.fetch = async () => new Response(JSON.stringify({ html: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
    await assert.rejects(engine.createListingRenderer(backend)('https://agent.example/empty'), /empty document/);
    globalThis.fetch = () => new Promise(() => {});
    await assert.rejects(engine.createListingRenderer(backend, { timeoutMs: 30 })('https://other.example/slow'), /Render timed out/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


