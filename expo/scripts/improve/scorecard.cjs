// MEASURE: the cumulative compatibility scorecard. Built from an offline evaluation of the recorded corpus,
// the failure registry, the AI ledger and the strategy registry; appended to a history so every run is
// compared with the previous benchmark. Known regression sites and previously unseen sites are reported
// separately. More records or more tests are not progress by themselves; the quality columns are.
//
//   node scripts/improve/scorecard.cjs [--evaluation FILE]   # evaluates now when no file is given
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot } = require('./engine.cjs');
const { evaluate, namesProperty } = require('./evaluate.cjs');
const { loadRegistry } = require('./failures.cjs');
const { readLedger } = require('../ai-budget.cjs');

const OUT = path.join(repoRoot, 'diagnostics/improvement/scorecard.json');
const HISTORY = path.join(repoRoot, 'diagnostics/improvement/scorecard-history.jsonl');

function strategyRegistry() {
  const source = fs.readFileSync(path.join(repoRoot, 'supabase/functions/analyze-realtor-build/listingDiscovery.ts'), 'utf8');
  const start = source.indexOf('export const LISTING_EXTRACTION_STRATEGIES');
  const block = source.slice(start, source.indexOf('\n];', start));
  return [...block.matchAll(/id:\s*"([^"]+)",\s*version:\s*(\d+)/g)].map(m => `${m[1]}@${m[2]}`);
}

function setSummary(sites) {
  const records = sites.flatMap(s => s.listings);
  const findings = sites.flatMap(s => s.findings);
  const sum = (code, kind) => findings.filter(f => f.code === code && (!kind || f.defectKind === kind)).reduce((n, f) => n + f.count, 0);
  const byArchitecture = new Map();
  for (const s of sites) {
    const entry = byArchitecture.get(s.architecture) ?? { sites: 0, importing: 0, clean: 0 };
    entry.sites++;
    if (s.imported) entry.importing++;
    if (s.imported && !s.findings.some(f => f.defectKind === 'code_defect')) entry.clean++;
    byArchitecture.set(s.architecture, entry);
  }
  const supported = [...byArchitecture].filter(([a, e]) => a !== 'unrecognized' && e.importing && e.clean === e.importing).map(([a]) => a).sort();
  return {
    sites: sites.length,
    sitesImporting: sites.filter(s => s.imported).length,
    sitesClean: sites.filter(s => s.imported && !s.findings.some(f => f.defectKind === 'code_defect')).length,
    records: records.length,
    recordsNamed: records.filter(r => namesProperty(r.title)).length,
    recordsWithDescription: records.filter(r => r.description > 0).length,
    recordsWithGallery: records.filter(r => r.photos >= 2).length,
    attribution: { own: records.filter(r => r.ownership === 'own').length, featured: records.filter(r => r.ownership === 'featured').length,
      unverifiedOffice: sum('ATTRIBUTION_UNVERIFIED'), unattributed: records.filter(r => !r.ownership).length },
    defects: { titleNotProperty: sum('TITLE_NOT_PROPERTY', 'code_defect'), duplicateProperty: sum('DUPLICATE_PROPERTY', 'code_defect'),
      detailIncomplete: sum('DETAIL_INCOMPLETE', 'code_defect'), needsStrategy: sum('NEEDS_STRATEGY'), engineErrors: sum('ENGINE_ERROR') },
    notCode: { blocked: sum('BLOCKED_SOURCE'), outage: sum('SOURCE_UNAVAILABLE'), harness: sum('CAPTURE_INCOMPLETE'), marketOnly: sum('MARKET_ONLY') },
    needsReview: findings.filter(f => f.defectKind === 'needs_review').length,
    architecturesEncountered: [...byArchitecture.keys()].sort(),
    architecturesSupported: supported,
    cpuMsTotal: sites.reduce((n, s) => n + s.cpuMs, 0),
    cpuMsMax: Math.max(0, ...sites.map(s => s.cpuMs)),
  };
}

function scorecard(evaluation, registry, ledger, previous) {
  const regression = setSummary(evaluation.sites.filter(s => s.set === 'regression'));
  const unseen = setSummary(evaluation.sites.filter(s => s.set === 'unseen'));
  const failures = Object.values(registry.failures);
  const attempts = failures.flatMap(f => f.attempts ?? []);
  const status = {};
  for (const f of failures) status[f.status] = (status[f.status] ?? 0) + 1;
  const spend = level => Math.round(ledger.filter(e => !level || e.level === level).reduce((n, e) => n + (e.estimatedUsd ?? 0), 0) * 10000) / 10000;
  const card = {
    at: new Date().toISOString(), evaluation: evaluation.evaluatedAt,
    regression, unseen,
    newlySupportedArchitectures: previous ? [...new Set([...regression.architecturesSupported, ...unseen.architecturesSupported])]
      .filter(a => ![...(previous.regression?.architecturesSupported ?? []), ...(previous.unseen?.architecturesSupported ?? [])].includes(a)) : [],
    strategies: strategyRegistry(),
    failures: status,
    repairs: { attempts: attempts.length, integrated: attempts.filter(a => a.outcome === 'integrated').length,
      rejected: attempts.filter(a => a.outcome === 'rejected').length, rolledBack: attempts.filter(a => a.outcome === 'rolled_back').length },
    aiCostUsd: { total: spend(), levelC: spend('C'), levelD: spend('D'), entries: ledger.length, note: 'Estimated from reported tokens at list price; testing campaigns only.' },
  };
  if (previous) card.delta = {
    regressionDefects: diff(previous.regression?.defects, regression.defects),
    unseenDefects: diff(previous.unseen?.defects, unseen.defects),
    regressionRecordsNamed: regression.recordsNamed - (previous.regression?.recordsNamed ?? 0),
    strategiesAdded: card.strategies.filter(s => !(previous.strategies ?? []).includes(s)),
  };
  return card;
}
const diff = (a = {}, b = {}) => Object.fromEntries(Object.keys(b).map(k => [k, (b[k] ?? 0) - (a[k] ?? 0)]));

module.exports = { scorecard, setSummary, strategyRegistry };

if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  const file = args.includes('--evaluation') ? args[args.indexOf('--evaluation') + 1] : null;
  const evaluation = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : await evaluate();
  const history = fs.existsSync(HISTORY) ? fs.readFileSync(HISTORY, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const card = scorecard(evaluation, loadRegistry(), readLedger(), history.at(-1));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(card, null, 2) + '\n');
  fs.appendFileSync(HISTORY, JSON.stringify(card) + '\n');
  console.log(JSON.stringify({ regression: card.regression.defects, unseen: card.unseen.defects, failures: card.failures, repairs: card.repairs, delta: card.delta }, null, 2));
})();
