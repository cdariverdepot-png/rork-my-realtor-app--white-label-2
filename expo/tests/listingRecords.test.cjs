// Repair stages 5 and 7 (synthetic contracts): the one normalizer applied to every listing before it
// is saved, and image choice. Titles come only from the record's own text or URL; nothing is invented.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');

let records;
const load = async () => records ??= await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/listingRecords.ts'), 'utf8'))).toString('base64'));
const listing = (title, sourceUrl, extra = {}) => ({ title, sourceUrl, description: '', price: '', beds: 0, baths: 0, sqft: '', neighborhood: '', image: '', images: [], ...extra });

test('card text, button labels and entities become the property address', async () => {
  const { normalizeListingRecords } = await load();
  const cases = [
    ['view property+ 1017 Minor Avenue #1401 Seattle, WA 98104 2 beds 2 baths $699,000', 'https://a.example/homes/1017-minor/2541335/', '1017 Minor Avenue #1401 Seattle, WA 98104'],
    ['1111 19TH ST N #2110 ARLINGTON View Details', 'https://a.example/details/1111-19th/VA1/', '1111 19TH ST N #2110 ARLINGTON'],
    ['New Listing &#8211; 5 days on site 1 / 40 $575,000 Single Family Residence For Sale Active 4 BEDS 3 TOTAL BATHS 2,532 SQFT 2105 Wood Duck Lane Granbury, TX', 'https://a.example/l/NTREIS/1/Granbury/2105-Wood-Duck-Lane', '2105 Wood Duck Lane Granbury, TX'],
    ['20 Carinthia Road ,&nbsp; Dover , Vermont VT 05356', 'https://a.example/idx/details/listing/b027/4984092', '20 Carinthia Road, Dover, Vermont VT 05356'],
    ['0 Allie LN Salem VA 24153 mls 930957', 'https://a.example/idx/0-Allie-LN-Salem-VA-24153-mls_930957', '0 Allie LN Salem VA 24153'],
    ['Add to Favorites', 'https://a.example/idx/details/listing/b045/2554926/550-Wanamaker-Coupeville-WA-98239', '550 Wanamaker Coupeville WA 98239'],
    ['$865,000 Asheville Beds: 5 &nbsp;|&nbsp;&nbsp;Baths:: 3', 'https://a.example/listings/30-laurel-branch-drive-black-mountain-nc/', '30 Laurel Branch Drive Black Mountain NC'],
  ];
  for (const [title, url, expected] of cases) assert.equal(normalizeListingRecords([listing(title, url)]).listings[0].title, expected, title);
});

test('a price-only title stays a price when nothing names the property (no invented address)', async () => {
  const { normalizeListingRecords } = await load();
  assert.equal(normalizeListingRecords([listing('$2,500,000', 'https://a.example/property/20261081/')]).listings[0].title, '$2,500,000');
});

test('non-properties are dropped with a reason; URL variants of one property become one record', async () => {
  const { normalizeListingRecords } = await load();
  const result = normalizeListingRecords([
    listing('12 Listings', 'https://a.example/idx/search/?My=listings&pg=1'),
    listing('La Pine 170 houses for sale Median list price $495,000', 'https://a.example/cities/la-pine'),
    listing('Subscription cost', 'https://www.vendor.example/'),
    listing('Residential Properties for Sale in Addison, Between $300,000 and $350,000', 'https://a.example/idx/results/listings?city%5B%5D=260&hp=350000'),
    listing('20 Carinthia Road', 'https://a.example/idx/details/listing/b027/4984092', { images: ['https://p.example/1.jpg'] }),
    listing('20 Carinthia Road', 'https://a.example/idx/details/listing/b027/4984092/20-Carinthia-Road-Dover-VT-05356', { images: ['https://p.example/1.jpg', 'https://p.example/2.jpg'] }),
  ]);
  assert.deepEqual(result.dropped.map(row => row.reason).sort(), ['duplicate_url_variant', 'not_a_property', 'not_a_property', 'not_a_property', 'not_a_property']);
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].images.length, 2, 'the richer record is kept');
  assert.match(result.listings[0].sourceUrl, /20-Carinthia-Road/, 'the URL that spells out the address is kept');
});

test('descriptions keep their paragraphs', async () => {
  const { normalizeListingRecords } = await load();
  const [item] = normalizeListingRecords([listing('1 Elm St', 'https://a.example/p/1', { description: 'First paragraph.\n\nSecond &amp; last.' })]).listings;
  assert.equal(item.description, 'First paragraph.\n\nSecond & last.');
});

test('images: full size where the resizer exposes it, signed URLs untouched, placeholders and maps dropped', async () => {
  const { fullSizeImageUrl, propertyImages } = await load();
  assert.equal(fullSizeImageUrl('https://static.wixstatic.com/media/ab_cd~mv2.jpg/v1/fill/w_123,h_184,al_c,q_80,usm_0.66_1.00_0.01,blur_2,enc_avif,quality_auto/ab_cd~mv2.jpg'),
    'https://static.wixstatic.com/media/ab_cd~mv2.jpg/v1/fit/w_1600,h_1600,q_85,enc_auto/ab_cd~mv2.jpg');
  assert.equal(fullSizeImageUrl('https://cdn.resize.sparkplatform.com/rva/640x480/true/2026-o.jpg'), 'https://cdn.resize.sparkplatform.com/rva/1600x1200/true/2026-o.jpg');
  const signed = 'https://images.example/photo.jpg?width=350&s=ed64419f';
  assert.equal(fullSizeImageUrl(signed), signed);
  assert.deepEqual(propertyImages([
    'https://photos.example/1.jpeg?d=s&width=400&height=272', 'https://photos.example/1.jpeg',
    'https://www.idx.example/images/listing/no-photo.jpg', 'https://maps.googleapis.com/maps/api/streetview?location=1',
    'https://photos.example/2.jpeg?width=400',
  ]), ['https://photos.example/1.jpeg', 'https://photos.example/2.jpeg?width=400']);
});

test('srcset candidates are split on comma + whitespace, so CDN URLs with commas stay whole', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/websiteDesign.ts'), 'utf8');
  assert.match(source, /value\.split\(\/,\\s\+\/\)/);
  assert.equal(source, fs.readFileSync(path.resolve(__dirname, '../lib/websiteDesignRuntime.ts'), 'utf8'), 'the app runtime mirror is identical');
});

test('a property under a search route is still a property (Flexmls "/search/…/listings/<id>")', async () => {
  const { normalizeListingRecords } = await load();
  const url = 'https://my.flexmls.com/Agent/search/office_listing_categories/Active/listings/20260321144127533557000000?from_filter=false';
  const result = normalizeListingRecords([listing('NKA May Court', url)]);
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].title, 'NKA May Court');
});
