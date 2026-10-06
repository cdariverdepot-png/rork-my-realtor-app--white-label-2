const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarize, scoreboard } = require('../scripts/benchmark-compatibility.cjs');

function target(id, controlOrDiscovery) {
  return { id, input: 'https://agent.example/', inputShape: 'homepage', expectedScope: 'agent', controlOrDiscovery, expectedFamily: 'example' };
}

function result(listings, meta) {
  return { listings, meta: { obstacles: [], issues: [], stages: [], candidates: [], ...meta } };
}

test('a partial market leak is not a false complete', () => {
  const listings = Array.from({ length: 6 }, (_, index) => ({ title: 'Home ' + index, sourceUrl: 'https://agent.example/' + index, status: 'active' }));
  const record = summarize(target('control_compass', 'control'), result(listings, {
    inventoryStatus: 'inventory_partial',
    outcome: 'partial',
    expectedCount: 240,
    completenessEvidence: ['collection_boundary_unknown'],
    accounting: { sourceCollectionExhausted: false, sourceSeen: 6, eligibleImportComplete: false },
  }), { requests: 3, retries: 0, seedStatus: 200 }, 40);
  assert.equal(record.inventoryStatus, 'inventory_partial');
  assert.equal(record.controlChecks.absorbedMarket, true);
  assert.equal(record.falseComplete, false);
  assert.equal(record.weakComplete, false);
  const board = scoreboard([record]);
  assert.deepEqual(board.falseComplete, []);
});

test('a result classified complete without a proven boundary is a false complete', () => {
  const listings = [{ title: 'Home', sourceUrl: 'https://agent.example/1', status: 'active' }];
  const record = summarize(target('agent_example', 'discovery'), result(listings, {
    inventoryStatus: 'inventory_complete',
    outcome: 'found',
    expectedCount: 50,
    completenessEvidence: ['collection_boundary_unknown'],
    collectionScope: 'collection',
    accounting: { sourceCollectionExhausted: true, sourceSeen: 1, eligibleImportComplete: true },
  }), { requests: 2, retries: 0, seedStatus: 200 }, 20);
  assert.equal(record.engineInventoryComplete, true);
  assert.equal(record.falseComplete, true);
  assert.deepEqual(scoreboard([record]).falseComplete, ['agent_example']);
});

test('a reconciled source total is not a false complete', () => {
  const listings = [{ title: 'Home', sourceUrl: 'https://agent.example/1', status: 'active' }, { title: 'Sold', sourceUrl: 'https://agent.example/2', status: 'sold' }];
  const record = summarize(target('agent_reconciled', 'discovery'), result(listings, {
    inventoryStatus: 'inventory_complete',
    outcome: 'found',
    expectedCount: 2,
    completenessEvidence: ['published_collection_total_reconciled'],
    accounting: { sourceCollectionExhausted: true, sourceSeen: 2, sourceTotal: 2, eligibleImportComplete: true },
  }), { requests: 1, retries: 0, seedStatus: 200 }, 10);
  assert.equal(record.importedCount, 1);
  assert.equal(record.falseComplete, false);
});
