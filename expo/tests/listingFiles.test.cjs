const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleRef = { exports: {} };
new Function('module', 'exports', compile(fs.readFileSync(path.join(root, 'listingFiles.ts'), 'utf8')))(moduleRef, moduleRef.exports);
const { parseListingCsv, validateFileListings, mergeFileListings } = moduleRef.exports;

test('reads MLS CSV with quoted addresses, multiline remarks, photos and decimal baths', () => {
  const result = parseListingCsv('\uFEFFStreetAddress,ListPrice,BedsTotal,BathsTotal,TotalSqFt,City,StateOrProvince,PublicRemarks,PrivateRemarks,PhotoURL,MLSNumber\r\n"12 Pine St, Unit 2","$350,000",3,2.5,"1,800",Wallace,ID,"Sunny home\nnear the lake",Gate code 1234,https://photos.example/house.jpg,26-123');
  assert.equal(result.length, 1);
  assert.equal(result[0].title, '12 Pine St, Unit 2');
  assert.equal(result[0].price, '$350,000');
  assert.equal(result[0].baths, 2.5);
  assert.equal(result[0].sqft, '1,800');
  assert.equal(result[0].description, 'Sunny home near the lake');
  assert.doesNotMatch(JSON.stringify(result), /1234/);
  assert.equal(result[0].sourceUrl, '');
  assert.deepEqual(result[0].images, ['https://photos.example/house.jpg']);
});

test('reads semicolon exports, component addresses, land listings and blanks without invented facts', () => {
  const result = parseListingCsv('StreetNumber;StreetName;StreetSuffix;ListingId;Price;Bedrooms\n119;Pine;St;A-1;374000;2\n;May Court;;LAND-1;130000;');
  assert.equal(result.length, 2);
  assert.equal(result[0].title, '119 Pine St');
  assert.equal(result[1].title, 'May Court');
  assert.equal(result[1].beds, 0);
  assert.equal(result[1].image, '');
});

test('rejects contacts, unfinished CSV quotes and unsupported AI source records', () => {
  assert.throws(() => parseListingCsv('Name,StreetAddress,Email\nCindy,12 Pine St,cindy@example.com'), /listing export/);
  assert.throws(() => parseListingCsv('Address,Price\n"12 Pine,350000'), /unfinished/);
  const result = validateFileListings({ listings: [
    { sourceId: 'other', locator: '12 Pine', title: '12 Pine', price: '350000' },
    { sourceId: 'ours', locator: '', title: 'No evidence', price: '350000' },
    { sourceId: 'ours', locator: '12 Pine', title: '12 Pine', price: '350000', sourceUrl: 'http://localhost/private', images: ['javascript:alert(1)'] },
  ] }, new Set(['ours']));
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceUrl, '');
  assert.deepEqual(result[0].images, []);
});

test('reordered and updated CSV imports keep stable properties and do not delete others', () => {
  const initial = parseListingCsv('Address,Price,MLSNumber\n12 Pine St,350000,A-1\n25 Lake St,400000,A-2');
  const retry = parseListingCsv('Address,Price,MLSNumber\n25 Lake St,420000,A-2\n12 Pine St,350000,A-1');
  const merged = mergeFileListings(initial, retry);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(l => l.title === '25 Lake St').price, '$420,000');
  assert.equal(mergeFileListings(merged, [retry[0]]).length, 2);
  const managedModule = { exports: {} };
  new Function('module', 'exports', compile(fs.readFileSync(path.resolve(__dirname, '../lib/appBuilder/importDiscoveredListings.ts'), 'utf8')))(managedModule, managedModule.exports);
  const first = managedModule.exports.mergeDiscoveredListings([], initial);
  const next = managedModule.exports.mergeDiscoveredListings(first, retry);
  assert.equal(next.length, 2);
  assert.deepEqual(next.map(l => l.id).sort(), first.map(l => l.id).sort());
});

async function runImport({ guest = false, sources, ids, files, modelResult, aiFails = false } = {}) {
  const defaultSource = { id: 'report', kind: 'listing-file', label: 'properties.csv', uri: 'owner/properties.csv', mimeType: 'text/plain' };
  const savedSources = sources ?? [defaultSource];
  const draft = { heroMessage: 'Original profile', aboutParagraph: 'Original introduction', discoveredListings: [] };
  let update, aiBody, downloads = 0, handler;
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner', is_anonymous: guest, email_confirmed_at: guest ? null : 'now' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { sources: savedSources, draft, evidence: [], status: 'needs-input' } }) }) }),
      update: value => ({ eq: async () => { update = value; return { error: null }; } }),
    }),
    storage: { from: () => ({ download: async uri => {
      downloads++;
      return { data: files?.[uri] ?? new Blob(['Address,Price,MLSNumber\n12 Pine St,350000,A-1\n25 Lake St,420000,A-2'], { type: 'text/plain' }) };
    } }) },
  };
  const code = compile(fs.readFileSync(path.join(root, 'deploy.bundle.ts'), 'utf8').replace(/^import .*createClient.*;\r?\n/, ''));
  new Function('Deno', 'createClient', 'fetch', code)({ env: { get: () => 'fixture' }, serve: fn => { handler = fn; } }, () => admin,
    async (uri, options) => { aiBody = JSON.parse(options.body); return aiFails ? new Response('unavailable', { status: 503 }) : Response.json({ output_text: JSON.stringify(modelResult) }); });
  const response = await handler(new Request('https://fixture.invalid', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'import-listing-files', guest, sourceIds: ids ?? [savedSources[0].id], sources: savedSources }) }));
  return { status: response.status, result: await response.json(), update, aiBody, downloads };
}

test('authenticated CSV endpoint imports multiple properties without AI or profile replacement', async () => {
  const result = await runImport();
  assert.equal(result.status, 200);
  assert.equal(result.result.importedCount, 2);
  assert.equal(result.aiBody, undefined);
  assert.equal(result.update.draft.heroMessage, 'Original profile');
  assert.equal(result.update.draft.aboutParagraph, 'Original introduction');
});

test('file endpoint rejects guests and mixed-owner paths before storage reads', async () => {
  const guest = await runImport({ guest: true });
  assert.equal(guest.status, 403);
  assert.equal(guest.downloads, 0);
  const other = await runImport({ sources: [{ id: 'report', kind: 'listing-file', label: 'properties.pdf', uri: 'different-owner/report.pdf', mimeType: 'application/pdf' }] });
  assert.equal(other.status, 403);
  assert.equal(other.downloads, 0);
  const missing = await runImport({ ids: ['unknown'] });
  assert.equal(missing.status, 400);
  assert.equal(missing.downloads, 0);
});

test('PDF endpoint sends file input and only accepts properties tied to the uploaded report', async () => {
  const source = { id: 'report', kind: 'listing-file', label: 'properties.pdf', uri: 'owner/report.pdf', mimeType: 'application/pdf' };
  const result = await runImport({ sources: [source], files: { 'owner/report.pdf': new Blob(['PDF fixture'], { type: 'application/pdf' }) },
    modelResult: { listings: [{ sourceId: 'report', locator: '12 Pine St', title: '12 Pine St', listingId: 'A-1', price: '350000', beds: 3, baths: 2, sqft: '1800', neighborhood: 'Wallace, ID', description: 'Sunny home', images: [], sourceUrl: '' }] } });
  assert.equal(result.status, 200);
  assert.equal(result.result.importedCount, 1);
  assert.ok(result.aiBody.input[1].content.some(c => c.type === 'input_file' && c.filename === 'properties.pdf'));
  assert.match(result.aiBody.input[0].content, /Never expose private remarks/);
});

test('empty reports and failed report reading preserve the existing draft', async () => {
  const source = { id: 'report', kind: 'listing-file', label: 'properties.pdf', uri: 'owner/report.pdf', mimeType: 'application/pdf' };
  const files = { 'owner/report.pdf': new Blob(['PDF fixture'], { type: 'application/pdf' }) };
  const empty = await runImport({ sources: [source], files, modelResult: { listings: [] } });
  assert.equal(empty.status, 422);
  assert.equal(empty.update, undefined);
  const failed = await runImport({ sources: [source], files, aiFails: true });
  assert.equal(failed.status, 502);
  assert.equal(failed.update, undefined);
});
