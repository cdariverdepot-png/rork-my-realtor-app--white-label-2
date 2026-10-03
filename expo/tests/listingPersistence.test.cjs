const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../lib/appBuilder/importDiscoveredListings.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(mod, mod.exports);
const { saveDiscoveredListings } = mod.exports;
const property = { title: '119 Pine St', price: '$374,000', beds: 2, baths: 1, sqft: '2,056',
  neighborhood: 'Wallace, ID', description: 'Public property description',
  sourceUrl: 'https://example.com/listings/26-9778', image: 'https://example.com/property.jpg',
  images: ['https://example.com/property.jpg'], status: 'active' };

test('import waits for durable storage before reporting success', async () => {
  let release, settled = false, written;
  const pending = saveDiscoveredListings([], [property], async items => {
    written = items;
    await new Promise(resolve => { release = resolve; });
  }).then(items => { settled = true; return items; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(written[0].price, property.price);
  release();
  assert.equal((await pending)[0].image, property.image);
});

test('failed storage rejects the import instead of presenting a successful count', async () => {
  await assert.rejects(saveDiscoveredListings([], [property], async () => { throw Error('storage unavailable'); }), /storage unavailable/);
});

test('saved draft restores a missing collection and survives a new reader without duplicating properties', async () => {
  let disk;
  await saveDiscoveredListings([], [property], async items => { disk = JSON.stringify(items); });
  const freshReader = JSON.parse(disk);
  const restored = await saveDiscoveredListings(freshReader, [property], async items => { disk = JSON.stringify(items); });
  assert.equal(restored.length, 1);
  assert.equal(restored[0].beds, 2);
  assert.deepEqual(restored[0].images, property.images);
  assert.equal(JSON.parse(disk)[0].sourceUrl, property.sourceUrl);
});
