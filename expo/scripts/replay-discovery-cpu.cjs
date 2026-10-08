// Replays recorded listing discovery (diagnostics/discovery/*.json.gz) offline and reports the CPU
// the engine itself spends per site: the refresh-listings and build functions both run this code
// inside the ~2 s Edge Function CPU allowance.
//   node scripts/replay-discovery-cpu.cjs [DIR] [--only id,id] [--runs N]
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { loadEngine, requestKey, snapshot } = require('./listing-compatibility.cjs');

const args = process.argv.slice(2);
const dir = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(__dirname, '../../diagnostics/discovery'));
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const runs = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) : 2;

const load = file => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));

async function replayDiscovery(engine, fixture) {
  const pages = new Map(fixture.pages.map(page => [page.key, page]));
  const missing = [];
  const read = async (url, options) => {
    const page = pages.get(requestKey(url, options, false));
    if (!page) { missing.push(url); throw Error('Unrecorded request: ' + url); }
    if (page.error) throw Error(page.error);
    return { html: page.html, finalUrl: new URL(page.finalUrl) };
  };
  const cpu = process.cpuUsage();
  const started = performance.now();
  const result = await engine.discoverListings(fixture.seeds, read, { ...fixture.options, maxDurationMs: 600000 })
    .catch(error => ({ error: String(error.message ?? error), listings: [], meta: {} }));
  const used = process.cpuUsage(cpu);
  return { cpuMs: Math.round((used.user + used.system) / 1000), wallMs: Math.round(performance.now() - started), result, missing };
}

module.exports = { replayDiscovery, load };

if (require.main === module) (async () => {
  const engine = await loadEngine();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).sort();
  for (const file of files) {
    const id = file.replace('.json.gz', '');
    if (only && !only.includes(id)) continue;
    const fixture = load(path.join(dir, file));
    let last;
    for (let i = 0; i < runs; i++) last = await replayDiscovery(engine, fixture);
    const same = last.result.error ? 'error' : JSON.stringify(snapshot(last.result)) === JSON.stringify(fixture.expected) ? 'same' : 'DIFF';
    console.log([id.padEnd(36), `${fixture.pages.length} pages`.padStart(10), `${last.result.listings.length} listings`.padStart(13),
      `${last.cpuMs} ms CPU`.padStart(13), `missing ${last.missing.length}`, same].join('  '));
  }
})();
