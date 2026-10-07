// Build-pipeline contracts: the single-file bundle is generated from source, and the
// orchestration does not repeat or serialize work it already has.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '../..');

test('deploy bundle is generated from the current function sources', () => {
  const { build } = require(path.join(repo, 'scripts/bundle-analyze-function.cjs'));
  const bundle = fs.readFileSync(path.join(repo, 'supabase/functions/analyze-realtor-build/deploy.bundle.ts'), 'utf8');
  assert.ok(bundle === build(), 'deploy.bundle.ts is stale: run node scripts/bundle-analyze-function.cjs');
});
