// Loads the listing engine and the save-boundary normalizer from any checkout of supabase/functions,
// so the acceptance gate can evaluate a base and a candidate with the same (protected) evaluator.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { stripTypeScriptTypes } = require('node:module');

// The gate runs a protected copy of these scripts from outside the candidate checkout; IMPROVE_REPO_ROOT points it at the candidate.
const repoRoot = process.env.IMPROVE_REPO_ROOT ? path.resolve(process.env.IMPROVE_REPO_ROOT) : path.resolve(__dirname, '../../..');
const importTs = file => import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(fs.readFileSync(file, 'utf8'))).toString('base64'));

async function loadPipeline(functionsRoot = path.join(repoRoot, 'supabase/functions')) {
  const quietWarnings = process.emitWarning;
  process.emitWarning = (warning, ...rest) => /stripTypeScriptTypes/.test(String(warning)) ? undefined : quietWarnings.call(process, warning, ...rest);
  try {
    const engine = await importTs(path.join(functionsRoot, 'analyze-realtor-build/listingDiscovery.ts'));
    const records = await importTs(path.join(functionsRoot, 'analyze-realtor-build/listingRecords.ts'));
    return { engine, records };
  } finally { process.emitWarning = quietWarnings; }
}

const requestKey = (url, options, rendering = false) => JSON.stringify(options?.cookie ? [url, !!options?.fragment, rendering, 'gate'] : [url, !!options?.fragment, rendering]);
const readCapture = file => JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(file)).toString('utf8') : fs.readFileSync(file, 'utf8'));

/**
 * Replays one recorded capture through discovery, then the production save-boundary steps the build and
 * refresh functions both apply (inactive statuses dropped, one normalizer). No network, no AI.
 */
async function replayCapture({ engine, records }, capture) {
  const pages = new Map(capture.pages.map(page => [page.key, page]));
  const missing = [];
  const requested = new Set();
  const read = rendering => async (url, options) => {
    const key = requestKey(url, options, rendering);
    requested.add(key);
    const page = pages.get(key);
    if (!page) { missing.push(url); throw Error('Unrecorded request: ' + url); }
    if (page.error) throw Error(page.error);
    return { html: page.html, finalUrl: new URL(page.finalUrl), ...(page.network ? { network: page.network } : {}) };
  };
  const cpu = process.cpuUsage();
  const result = await engine.discoverListings(capture.seeds, read(false), { ...capture.options, maxDurationMs: 600000,
    ...(capture.pages.some(p => p.rendering) ? { renderPage: read(true) } : {}) })
    .catch(error => ({ error: String(error?.message ?? error), listings: [], meta: {} }));
  const used = process.cpuUsage(cpu);
  const active = result.listings.filter(item => item.status !== 'sold' && item.status !== 'off_market' && item.sourceStatus !== 'unknown');
  const normalized = records.normalizeListingRecords(active);
  return { result, listings: normalized.listings, dropped: normalized.dropped ?? [], missing, requested,
    cpuMs: Math.round((used.user + used.system) / 1000) };
}

module.exports = { loadPipeline, replayCapture, readCapture, requestKey, repoRoot };
