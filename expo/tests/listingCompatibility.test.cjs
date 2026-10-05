const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, replayFixture, createRecorder, requestKey } = require('../scripts/listing-compatibility.cjs');
const engine = loadEngine();
const directory = path.join(__dirname, 'fixtures/listing-compatibility');
const files = fs.readdirSync(directory).filter(f => f.endsWith('.json')).sort();
assert.ok(files.length, 'The permanent corpus must not be empty');
for (const file of files) {
  const fixture = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
  test('compatibility replay: ' + fixture.id, async () => { await replayFixture(fixture, await engine); });
  // Rehost only declared customer origins. Provider transports retain their architectural host contract.
  for (const host of ['https://unfamiliar-broker.example', 'https://another-cms.example']) {
    if (!fixture.rehostOrigin) continue;
    test('portable architecture: ' + fixture.id + ' on ' + host, async () => {
      const moved = JSON.parse(JSON.stringify(fixture).split(fixture.rehostOrigin).join(host));
      await replayFixture(moved, await engine);
    });
  }
}

test('registry contracts are unique, versioned and backed by successful replay cases', async () => {
  const { LISTING_EXTRACTION_STRATEGIES } = await engine;
  const covered = new Set(files.flatMap(file => JSON.parse(fs.readFileSync(path.join(directory, file))).expected.strategies));
  const ids = LISTING_EXTRACTION_STRATEGIES.map(s => s.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const strategy of LISTING_EXTRACTION_STRATEGIES) {
    assert.ok(strategy.evidence && strategy.rationale && strategy.version > 0, strategy.id);
    assert.ok(covered.has(strategy.id), 'Missing permanent successful case: ' + strategy.id);
  }
});

test('misleading platform branding falls back to portable property data with honest attribution', async () => {
  const { discoverListings } = await engine;
  const result = await discoverListings(['https://unknown.example/'], async url => ({ finalUrl: new URL(url),
    html: 'moxiworks <script type="application/ld+json">' + JSON.stringify({ '@type': 'RealEstateListing', name: '12 Pine St', price: 400000, url: '/property/12' }) + '</script>' }));
  const attempts = result.meta.compatibility.pages[0].attempts;
  assert.equal(attempts.find(a => a.id === 'moxiworks').outcome, 'empty');
  assert.equal(attempts.find(a => a.id === 'json-ld').outcome, 'extracted');
});

test('unknown architecture remains a needs-strategy observation', async () => {
  const { discoverListings } = await engine;
  const result = await discoverListings(['https://unknown.example/'], async url => ({ finalUrl: new URL(url), html: '<main>Unknown widget</main>' }));
  assert.equal(result.listings.length, 0);
  assert.equal(result.meta.compatibility.pages[0].resolution, 'needs-strategy');
});

test('recorder preserves failures without serializing request credentials', async () => {
  const recorder = createRecorder(async () => { throw Error('HTTP 503'); });
  await assert.rejects(recorder.fetchPage('https://example.com/', { activationToken: 'secret' }));
  const fixture = recorder.fixture('failure', [], {}, { listings: [], meta: {} }, 'Failure boundary');
  assert.ok(!JSON.stringify(fixture).includes('secret'));
  assert.equal(fixture.pages[0].error, 'HTTP 503');
  assert.equal(fixture.pages[0].key, requestKey('https://example.com/', {}));
});
