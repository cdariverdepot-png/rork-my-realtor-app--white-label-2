// REMEMBER: record the outcome of a repair attempt in the failure registry, and keep the knowledge index.
// Integrated repairs keep their knowledge record (cause, structural pattern, strategy, evidence, tests,
// performance, coverage) in docs/compatibility-knowledge/. Rejected attempts keep the gate report and
// the evidence hash, so the same failure is not retried until the evidence or the hypothesis changes.
//
//   node scripts/improve/remember.cjs --failure ID --outcome integrated|rejected --gate GATE.json
//        [--branch NAME] [--commit SHA] [--hypothesis TEXT]
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot } = require('./engine.cjs');
const { loadRegistry, saveRegistry } = require('./failures.cjs');

const KNOWLEDGE = path.join(repoRoot, 'docs/compatibility-knowledge');

function recordAttempt(registry, { failureId, outcome, gate, branch, commit, hypothesis, at = new Date().toISOString() }) {
  const failure = registry.failures[failureId];
  if (!failure) throw new Error(`Unknown failure ${failureId}`);
  const attempt = { at, outcome, branch, commit, evidenceHash: failure.evidenceHash,
    ...(hypothesis ? { hypothesis, newHypothesis: true } : {}),
    gate: gate ? { accepted: gate.accepted, head: gate.head, base: gate.baseSha,
      target: gate.checks?.corpus ? `${gate.checks.corpus.targetBefore} -> ${gate.checks.corpus.targetAfter}` : undefined,
      problems: Object.values(gate.checks ?? {}).flatMap(c => c.problems ?? []).slice(0, 20) } : undefined };
  const status = outcome === 'integrated' ? 'integrated' : outcome === 'rejected' ? 'rejected' : failure.status;
  const knowledge = fs.existsSync(path.join(KNOWLEDGE, `${failureId}.md`)) ? `docs/compatibility-knowledge/${failureId}.md` : failure.knowledge;
  return { ...registry, failures: { ...registry.failures, [failureId]: { ...failure, status, knowledge, attempts: [...failure.attempts ?? [], attempt] } } };
}

/** docs/compatibility-knowledge/index.json: every integrated repair and what it taught the engine. */
function knowledgeIndex(registry) {
  return Object.values(registry.failures).filter(f => (f.attempts ?? []).some(a => a.outcome === 'integrated')).map(f => {
    const last = [...f.attempts].reverse().find(a => a.outcome === 'integrated');
    return { failure: f.id, symptom: f.code, stage: f.stage, record: f.knowledge, architectures: f.architectures,
      integratedAt: last.at, commit: last.commit, gate: last.gate?.target };
  });
}

module.exports = { recordAttempt, knowledgeIndex };

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = name => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined;
  const gateFile = arg('gate');
  const next = recordAttempt(loadRegistry(), { failureId: arg('failure'), outcome: arg('outcome'),
    gate: gateFile ? JSON.parse(fs.readFileSync(gateFile, 'utf8')) : undefined, branch: arg('branch'), commit: arg('commit'), hypothesis: arg('hypothesis') });
  saveRegistry(next);
  fs.mkdirSync(KNOWLEDGE, { recursive: true });
  fs.writeFileSync(path.join(KNOWLEDGE, 'index.json'), JSON.stringify(knowledgeIndex(next), null, 2) + '\n');
  console.log(`${arg('failure')}: ${next.failures[arg('failure')].status}`);
}
