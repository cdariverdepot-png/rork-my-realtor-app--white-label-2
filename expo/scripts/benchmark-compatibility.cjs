// Baseline the production discoverListings path. Evaluation metadata is never passed in.
// Run from expo: node scripts/benchmark-compatibility.cjs --out /tmp/audits/corpus-baseline
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine } = require('./listing-compatibility.cjs');

const PRODUCTION_OPTIONS = {
  maxDepth: 5,
  maxPages: 160,
  maxListings: 100,
  maxDetailPages: 100,
  enrichAll: true,
};

const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal)$/i;

function argument(args, key) {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : undefined;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function strategiesFrom(meta) {
  const pages = meta?.compatibility?.pages ?? [];
  const attempted = [];
  const extracted = [];
  for (const page of pages) {
    for (const attempt of page.attempts ?? []) {
      attempted.push(attempt.id);
      if (attempt.outcome === 'extracted') extracted.push(attempt.id);
    }
  }
  return {
    attempted: [...new Set(attempted)],
    extracted: [...new Set(extracted)],
  };
}

function failureClass(record) {
  const codes = new Set((record.obstacles ?? []).map(row => row.code));
  if (codes.has('captcha_required')) return 'captcha_required';
  if (codes.has('script_gate')) return 'requires_rendering';
  if (codes.has('authentication_required')) return 'authentication_required';
  if (codes.has('rate_limited')) return 'rate_limited';
  if (codes.has('access_denied')) return 'access_denied';
  if (codes.has('render_failed')) return 'render_failed';
  if (codes.has('requires_rendering') || (record.issues ?? []).some(issue => issue.code === 'requires-rendering')) return 'requires_rendering';
  if (codes.has('timeout') || record.timedOut) return 'timeout';
  if (codes.has('malformed_payload')) return 'malformed_payload';
  if (record.inventoryStatus === 'inventory_partial') {
    if ((record.expectedCount ?? 0) >= 200 && record.importedCount >= 100) return 'market_scope_only';
    if (record.expectedCount && record.importedCount < record.expectedCount) return 'pagination_incomplete';
    return 'inventory_partial';
  }
  if (record.inventoryStatus === 'inventory_complete' && /enrichment_partial|enrichment_unavailable/.test(record.enrichmentStatus ?? '')) return 'detail_enrichment_partial';
  if (record.inventoryStatus === 'inventory_empty') return (record.detectedCandidates?.length ? 'collection_not_found' : 'platform_unknown');
  if (record.inventoryStatus === 'inventory_blocked') {
    const http = record.staticHttpStatus;
    if (http === 404) return 'collection_not_found';
    if (http === 401 || http === 403) return 'access_denied';
    if (http === 429) return 'rate_limited';
    return record.detectedCandidates?.length ? 'collection_not_found' : 'platform_unknown';
  }
  if (!record.importedCount) return 'unsupported';
  return null;
}

function strictComplete(record) {
  const evidence = new Set(record.completenessEvidence ?? []);
  const provenBoundary = ['pagination_exhausted', 'cursor_exhausted', 'structured_group_exhausted', 'single_page_collection_confirmed', 'provider_terminal_state', 'published_count_match', 'api_total_match', 'published_collection_total_reconciled'].some(code => evidence.has(code));
  const countMatches = Number.isFinite(record.expectedCount) && record.expectedCount === record.importedCount && record.importedCount > 0 && record.importedCount < 100;
  return record.inventoryStatus === 'inventory_complete'
    && record.collectionScope !== 'showcase'
    && record.outcome === 'found'
    && (countMatches || provenBoundary)
    && !(record.expectedCount >= 200)
    && !evidence.has('collection_boundary_unknown');
}

function createFetcher(engine, counters) {
  const { publicListingRequestHeaders, decodePublicListingResponse, isRobotChallenge, isPublishedScriptGate } = engine;
  return async function fetchHtml(uri, options) {
    let current = new URL(uri);
    for (let hop = 0; hop < 5; hop++) {
      if (current.protocol !== 'https:' || current.username || current.password || BLOCKED_HOST.test(current.hostname)) {
        throw new Error('Use a public HTTPS page.');
      }
      let response;
      let retries = 0;
      while (true) {
        counters.requests += 1;
        response = await fetch(current, {
          redirect: 'manual',
          headers: {
            Accept: options?.fragment ? 'application/json,text/html,text/plain' : 'text/html,text/plain',
            'User-Agent': 'MyRealtorAppBuilder/1.0',
            ...(options?.fragment ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
            ...(options?.cookie ? { Cookie: options.cookie } : {}),
            ...(options?.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {}),
            ...publicListingRequestHeaders(current, options),
          },
          signal: AbortSignal.timeout(12000),
        });
        if (hop === 0 && !options?.fragment) counters.seedStatus = response.status;
        if (response.status !== 429 || retries >= 2) break;
        retries += 1;
        counters.retries += 1;
        const wait = Math.min(15000, (Number(response.headers.get('retry-after')) || 2) * 1000);
        await response.body?.cancel();
        await new Promise(resolve => setTimeout(resolve, Number.isFinite(wait) ? wait : 2000));
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || hop === 4) throw new Error('The page redirected too many times.');
        current = new URL(location, current);
        continue;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (Number(response.headers.get('content-length') ?? 0) > 2_000_000) throw new Error('The page is too large to analyze.');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('The page is empty.');
      const chunks = [];
      let size = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 2_000_000) {
          await reader.cancel();
          throw new Error('The page is too large to analyze.');
        }
        chunks.push(next.value);
      }
      const joined = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const html = await decodePublicListingResponse(new TextDecoder().decode(joined), contentType, current, options);
      if (!response.ok && !isRobotChallenge(html) && !isPublishedScriptGate(html)) throw new Error('The page returned ' + response.status + '.');
      return { html, finalUrl: current };
    }
    throw new Error('The page redirected too many times.');
  };
}

function summarize(target, result, counters, elapsedMs, error) {
  const meta = result?.meta ?? {};
  const engineListings = result?.listings ?? [];
  const listings = engineListings.filter(row => row.status !== 'sold' && row.status !== 'off_market' && row.sourceStatus !== 'unknown');
  const strategy = strategiesFrom(meta);
  const record = {
    id: target.id,
    input: target.input,
    inputShape: target.inputShape,
    expectedScope: target.expectedScope,
    controlOrDiscovery: target.controlOrDiscovery,
    expectedFamily: target.expectedFamily,
    detectedCandidates: meta.candidates ?? [],
    winningStrategies: strategy.extracted,
    strategiesAttempted: strategy.attempted,
    staticHttpStatus: counters.seedStatus ?? null,
    renderEscalation: (meta.stages ?? []).includes('browser_render_escalated'),
    structuredSourceDiscovered: (meta.stages ?? []).includes('api_discovered') || strategy.extracted.some(id => /json|api|reso|bootstrap|json-ld|public-json/i.test(id)),
    collectionScope: meta.coverage ?? null,
    accounting: meta.accounting ?? null,
    completenessEvidence: meta.completenessEvidence ?? [],
    collectionBoundary: meta.collectionBoundary ?? null,
    discoveredCount: listings.length,
    importedCount: listings.length,
    engineCount: engineListings.length,
    enrichmentScheduled: meta.enrichment?.scheduled ?? 0,
    enrichmentAttempted: meta.enrichment?.attempted ?? 0,
    enrichmentSucceeded: meta.enrichment?.enriched ?? 0,
    enrichmentFailed: meta.enrichment?.failed ?? 0,
    inventoryStatus: meta.inventoryStatus ?? null,
    enrichmentStatus: meta.enrichment?.status ?? null,
    obstacles: meta.obstacles ?? [],
    resumeState: meta.resume ?? null,
    requestCount: counters.requests,
    renderCount: 0,
    retryCount: counters.retries,
    elapsedMs,
    outcome: meta.outcome ?? null,
    issues: (meta.issues ?? []).map(issue => ({ code: issue.code, interface: issue.interface ?? null })),
    stages: meta.stages ?? [],
    interfaces: meta.interfaces ?? [],
    transport: 'http_only',
    error: error ? String(error.message ?? error).slice(0, 300) : null,
    timedOut: /timeout|aborted/i.test(error?.message ?? ''),
  };
  record.failureClass = record.error && !record.inventoryStatus ? (record.timedOut ? 'timeout' : 'unsupported') : failureClass(record);
  record.strictAutomaticComplete = record.controlOrDiscovery === 'control' ? false : strictComplete(record);
  record.engineInventoryComplete = record.inventoryStatus === 'inventory_complete';
  record.weakComplete = record.engineInventoryComplete && !strictComplete(record) && record.controlOrDiscovery !== 'control';
  record.controlChecks = {};
  if (target.id === 'control_brenda') {
    record.controlChecks.inventory21 = listings.length === 21 && record.inventoryStatus === 'inventory_complete';
    record.controlChecks.classifiedObstacle = (record.obstacles ?? []).some(row => /captcha_required|script_gate|requires_rendering|authentication_required/.test(row.code));
  }
  if (target.id === 'control_compass') {
    record.controlChecks.scopedFour = listings.length === 4 && record.expectedCount === 4 && !(record.expectedCount > 100);
    record.controlChecks.absorbedMarket = (record.expectedCount ?? 0) > 100 || listings.length > 4;
  }
  if (target.id === 'control_challenge') {
    record.controlChecks.classifiedObstacle = (record.obstacles ?? []).some(row => /captcha_required|script_gate|requires_rendering/.test(row.code)) || (record.issues ?? []).some(issue => issue.code === 'requires-rendering');
    record.controlChecks.emptySuccess = record.outcome === 'found' && listings.length === 0;
  }
  record.falseComplete = !!record.weakComplete || !!record.controlChecks.absorbedMarket || (record.engineInventoryComplete && Number.isFinite(record.expectedCount) && record.expectedCount !== engineListings.length && !(meta.accounting?.sourceCollectionExhausted && meta.accounting?.sourceSeen === record.expectedCount));
  record.sourceCountReconciled = !!(meta.accounting?.sourceCollectionExhausted && (meta.accounting.sourceTotal == null || meta.accounting.sourceSeen === meta.accounting.sourceTotal));
  record.eligibleCountReconciled = !!meta.accounting?.eligibleImportComplete;
  record.falseEmpty = (target.id === 'control_brenda' && listings.length === 0 && !record.controlChecks.classifiedObstacle)
    || (record.inventoryStatus === 'inventory_empty' && record.outcome === 'not-found' && !(record.obstacles ?? []).length && !(meta.failed ?? []).length && counters.requests > 0 && target.controlOrDiscovery === 'control');
  return record;
}

function scoreboard(results) {
  const discovery = results.filter(row => row.controlOrDiscovery !== 'control');
  const completeAutomatic = discovery.filter(row => row.strictAutomaticComplete);
  const bucket = (predicate) => discovery.filter(predicate).length;
  const families = {};
  for (const row of results) {
    const family = row.expectedFamily;
    families[family] ??= { targets: 0, strictAutomaticComplete: 0, engineComplete: 0, partial: 0, blocked: 0, classes: {} };
    const group = families[family];
    group.targets += 1;
    if (row.strictAutomaticComplete) group.strictAutomaticComplete += 1;
    if (row.engineInventoryComplete) group.engineComplete += 1;
    if (row.inventoryStatus === 'inventory_partial' || row.failureClass === 'detail_enrichment_partial') group.partial += 1;
    if (row.inventoryStatus === 'inventory_blocked' || row.failureClass === 'captcha_required' || row.failureClass === 'requires_rendering') group.blocked += 1;
    const label = row.strictAutomaticComplete ? 'strict_automatic_complete' : (row.failureClass || row.inventoryStatus || 'unclassified');
    group.classes[label] = (group.classes[label] ?? 0) + 1;
  }
  const clusters = {};
  for (const row of discovery) {
    const label = row.strictAutomaticComplete ? 'strict_automatic_complete' : (row.failureClass || row.inventoryStatus || 'unclassified');
    clusters[label] ??= [];
    clusters[label].push(row.id);
  }
  return {
    totalTargets: results.length,
    discoveryTargets: discovery.length,
    controls: results.filter(row => row.controlOrDiscovery === 'control').map(row => ({ id: row.id, inventoryStatus: row.inventoryStatus, importedCount: row.importedCount, expectedCount: row.expectedCount, failureClass: row.failureClass, controlChecks: row.controlChecks, obstacles: row.obstacles.map(item => item.code) })),
    completeAutomatic: completeAutomatic.length,
    completeAfterRender: discovery.filter(row => row.strictAutomaticComplete && row.renderEscalation).length,
    completeAfterAuthorizedContinuation: 0,
    inventoryPartial: bucket(row => row.inventoryStatus === 'inventory_partial'),
    enrichmentPartial: bucket(row => row.failureClass === 'detail_enrichment_partial' || row.enrichmentStatus === 'enrichment_partial'),
    blocked: bucket(row => row.inventoryStatus === 'inventory_blocked' || ['captcha_required', 'authentication_required', 'requires_rendering', 'access_denied', 'rate_limited'].includes(row.failureClass)),
    unsupported: bucket(row => row.failureClass === 'unsupported' || row.failureClass === 'platform_unknown'),
    falseComplete: results.filter(row => row.falseComplete).map(row => row.id),
    falseEmpty: results.filter(row => row.falseEmpty).map(row => row.id),
    sourceCountReconciled: results.filter(row => row.sourceCountReconciled).length,
    eligibleCountReconciled: results.filter(row => row.eligibleCountReconciled).length,
    automaticCompleteRate: discovery.length ? Number((completeAutomatic.length / discovery.length).toFixed(4)) : 0,
    medianRequests: median(results.map(row => row.requestCount)),
    medianRenderCount: 0,
    medianImportMs: median(results.map(row => row.elapsedMs)),
    families,
    clusters: Object.entries(clusters).map(([failureClass, ids]) => ({ failureClass, count: ids.length, ids })).sort((a, b) => b.count - a.count || a.failureClass.localeCompare(b.failureClass)),
  };
}

async function runTarget(engine, target) {
  const started = Date.now();
  const counters = { requests: 0, retries: 0, seedStatus: null };
  try {
    const result = await engine.discoverListings([target.input], createFetcher(engine, counters), {
      ...PRODUCTION_OPTIONS,
      selectLinks: async () => [],
    });
    return summarize(target, result, counters, Date.now() - started);
  } catch (error) {
    return summarize(target, null, counters, Date.now() - started, error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const outDir = path.resolve(argument(args, '--out') || '/tmp/audits/corpus-baseline');
  const only = argument(args, '--only');
  const concurrency = Math.max(1, Math.min(3, Number(argument(args, '--concurrency') || 2)));
  const corpus = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/compatibility-corpus.json'), 'utf8'));
  let targets = corpus.targets.filter(target => !only || target.id === only);
  fs.mkdirSync(outDir, { recursive: true });
  const engine = await loadEngine();
  const hostTails = new Map();
  const results = [];
  let cursor = 0;
  function onHost(host, task) {
    const previous = hostTails.get(host) ?? Promise.resolve();
    const run = previous.then(task, task);
    hostTails.set(host, run.then(() => {}, () => {}));
    return run;
  }
  async function worker() {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      const host = new URL(target.input).hostname;
      await onHost(host, async () => {
        const record = await runTarget(engine, target);
        if (target.alsoInspect && !only) {
          const extraCounters = { requests: 0, retries: 0, seedStatus: null };
          const started = Date.now();
          try {
            const extra = await engine.discoverListings([target.alsoInspect], createFetcher(engine, extraCounters), { ...PRODUCTION_OPTIONS, selectLinks: async () => [] });
            record.alsoInspect = summarize({ ...target, id: target.id + '_featured', input: target.alsoInspect }, extra, extraCounters, Date.now() - started);
          } catch (error) {
            record.alsoInspect = summarize({ ...target, id: target.id + '_featured', input: target.alsoInspect }, null, extraCounters, Date.now() - started, error);
          }
        }
        results.push(record);
        fs.writeFileSync(path.join(outDir, target.id + '.json'), JSON.stringify(record, null, 2));
        console.log(JSON.stringify({ id: record.id, status: record.inventoryStatus, imported: record.importedCount, expected: record.expectedCount, failure: record.failureClass, ms: record.elapsedMs, requests: record.requestCount }));
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'baseline',
    productionPath: 'discoverListings without renderPage, matching analyze-realtor-build discover-listings options',
    productionOptions: PRODUCTION_OPTIONS,
    rendererConfigured: false,
    navigationModel: false,
    scoreboard: scoreboard(results),
    results,
  };
  fs.writeFileSync(path.join(outDir, 'baseline-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.scoreboard, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
