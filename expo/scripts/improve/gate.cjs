// VALIDATE: the acceptance gate for an autonomous repair. It runs outside the coding agent, from the
// protected copy of this file on the base branch, and decides whether a candidate branch may integrate.
//
//   1. Change policy: only engine/test/knowledge paths may change; existing tests, fixtures, recorded
//      captures, the gate, workflows, budgets and agent rules are immutable; no test is removed or weakened.
//   2. Regression coverage: new tests naming the failure, and a knowledge record with the required sections.
//   3. Static checks: the Edge bundle is current.
//   4. The full offline suite (Level A guard: no network, no AI).
//   5. Before/after over the whole recorded corpus (base engine vs candidate engine, same evaluator):
//      the target symptom decreases; no other finding increases on any site; no imported record disappears
//      (except merged duplicates), changes or gains ownership, loses its property name, description or photos;
//      new records must be attributed; corpus CPU within 20%.
// Any failure rejects the candidate. Output: a JSON verdict and a readable report.
//
//   node scripts/improve/gate.cjs --failure ID --base REF [--skip-suite] [--out DIR]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { repoRoot } = require('./engine.cjs');
const { evaluate } = require('./evaluate.cjs');

const ALLOWED = [
  /^supabase\/functions\/analyze-realtor-build\/(?:listingDiscovery|listingRecords|listingFiles|websiteDesign|progress)\.ts$/,
  /^supabase\/functions\/analyze-realtor-build\/deploy\.bundle\.ts$/,
  /^supabase\/functions\/refresh-listings\/(?:sources|sourceHandler|sync|publicPage|normalizePage)\.ts$/,
  /^expo\/lib\/websiteDesignRuntime\.ts$/,
  /^expo\/tests\/[A-Za-z0-9]+\.test\.cjs$/,
  /^expo\/tests\/fixtures\//,
  /^docs\/compatibility-knowledge\/[a-z0-9-]+\.md$/,
];
const IMMUTABLE_EXISTING = [/^expo\/tests\/fixtures\//, /^diagnostics\/discovery\//, /^diagnostics\/evaluation\/captures\//];
const KNOWLEDGE_SECTIONS = ['Cause', 'Structural pattern', 'Strategy', 'Evidence', 'Tests', 'Performance', 'Coverage'];

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const count = (text, pattern) => (text.match(pattern) ?? []).length;

function changePolicy(base, failureId) {
  const problems = [], notes = [];
  const rows = git('diff', '--name-status', '--no-renames', `${base}...HEAD`).trim().split('\n').filter(Boolean).map(line => {
    const [status, file] = line.split('\t'); return { status, file };
  });
  if (!rows.length) problems.push('The candidate changes nothing.');
  let addedTests = 0, mentionsFailure = false, knowledge = false;
  for (const { status, file } of rows) {
    if (!ALLOWED.some(rule => rule.test(file))) problems.push(`${file}: outside the paths an autonomous repair may change.`);
    if (status !== 'A' && IMMUTABLE_EXISTING.some(rule => rule.test(file))) problems.push(`${file}: existing fixtures and recorded captures are immutable (${status}).`);
    if (/^expo\/tests\/[^/]+\.test\.cjs$/.test(file)) {
      if (status === 'D') { problems.push(`${file}: a test file was deleted.`); continue; }
      const after = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      const before = status === 'A' ? '' : git('show', `${base}:${file}`);
      const testsBefore = count(before, /\btest\(/g), testsAfter = count(after, /\btest\(/g);
      const assertsBefore = count(before, /\bassert\b/g), assertsAfter = count(after, /\bassert\b/g);
      if (testsAfter < testsBefore) problems.push(`${file}: tests removed (${testsBefore} -> ${testsAfter}).`);
      if (assertsAfter < assertsBefore) problems.push(`${file}: assertions removed (${assertsBefore} -> ${assertsAfter}).`);
      const reviewed = text => (text.match(/REVIEWED_[A-Z_]+\s*=\s*new Set\(\[[\s\S]*?\]\)/g) ?? []).join('\n');
      if (reviewed(after) !== reviewed(before)) problems.push(`${file}: a REVIEWED_* exception set changed. Reviewed exceptions need a person's review, not an autonomous repair.`);
      addedTests += Math.max(0, testsAfter - testsBefore);
      if (after.includes(failureId) && !before.includes(failureId)) mentionsFailure = true;
    }
    if (file === `docs/compatibility-knowledge/${failureId}.md`) {
      knowledge = true;
      const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      const missing = KNOWLEDGE_SECTIONS.filter(section => !new RegExp(`^#+\\s*${section}\\b`, 'mi').test(text));
      if (missing.length) problems.push(`${file}: missing sections ${missing.join(', ')}.`);
    }
  }
  if (!addedTests) problems.push('No new regression test was added.');
  if (!mentionsFailure) problems.push(`No new test names the failure "${failureId}".`);
  if (!knowledge) problems.push(`docs/compatibility-knowledge/${failureId}.md is missing.`);
  notes.push(`${rows.length} files changed; ${addedTests} tests added.`);
  return { ok: !problems.length, problems, notes, files: rows };
}

function staticChecks() {
  const problems = [];
  const bundle = spawnSync(process.execPath, ['scripts/bundle-analyze-function.cjs', '--check'], { cwd: repoRoot, encoding: 'utf8' });
  if (bundle.status !== 0) problems.push(`Edge bundle is stale or broken: ${(bundle.stdout + bundle.stderr).trim().slice(0, 300)}`);
  return { ok: !problems.length, problems };
}

function suite() {
  const run = spawnSync('npm', ['test', '--silent'], { cwd: path.join(repoRoot, 'expo'), encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: { ...process.env } });
  const out = run.stdout + run.stderr;
  const pass = Number(out.match(/^# pass (\d+)/m)?.[1] ?? 0), fail = Number(out.match(/^# fail (\d+)/m)?.[1] ?? NaN);
  const failing = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1]).slice(0, 20);
  return { ok: run.status === 0 && fail === 0, pass, fail, failing, guard: /Level A guard/.test(out) ? 'network or AI request attempted' : 'clean' };
}

/** Base engine sources extracted from git into a temporary directory. */
function baseFunctions(base) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-base-'));
  const tar = execFileSync('git', ['archive', base, 'supabase/functions'], { cwd: repoRoot, maxBuffer: 256 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
  return path.join(dir, 'supabase/functions');
}

const findingCounts = site => Object.fromEntries(site.findings.map(f => [`${f.code}|${f.defectKind}`, f.count]));
const namesProperty = require('./evaluate.cjs').namesProperty;

function compare(before, after, failure) {
  const problems = [], improvements = [], notes = [];
  const target = failure.code;
  const sum = (report, code) => report.sites.reduce((n, s) => n + s.findings.filter(f => f.code === code && f.defectKind === 'code_defect').reduce((m, f) => m + f.count, 0), 0);
  const targetBefore = sum(before, target), targetAfter = sum(after, target);
  if (targetAfter >= targetBefore) problems.push(`${target}: code-defect findings did not decrease (${targetBefore} -> ${targetAfter}).`);
  else improvements.push(`${target}: ${targetBefore} -> ${targetAfter} code-defect records across the corpus.`);
  const bySite = new Map(before.sites.map(s => [s.id, s]));
  let cpuBefore = 0, cpuAfter = 0;
  for (const site of after.sites) {
    const prior = bySite.get(site.id);
    if (!prior) { notes.push(`${site.id}: new in corpus (no baseline).`); continue; }
    cpuBefore += prior.cpuMs; cpuAfter += site.cpuMs;
    const a = findingCounts(prior), b = findingCounts(site);
    for (const [k, n] of Object.entries(b)) {
      const [code] = k.split('|');
      if (code === target) continue;
      if (n > (a[k] ?? 0)) problems.push(`${site.id}: new or increased finding ${k} (${a[k] ?? 0} -> ${n}).`);
    }
    // The target symptom may move between evidence classes only by getting smaller overall at this site.
    const targetAt = r => Object.entries(findingCounts(r)).filter(([k]) => k.startsWith(target + '|')).reduce((n, [, v]) => n + v, 0);
    if (targetAt(site) > targetAt(prior)) problems.push(`${site.id}: ${target} findings increased (${targetAt(prior)} -> ${targetAt(site)}).`);
    const now = new Map(site.listings.map(l => [l.sourceUrl, l]));
    const was = new Map(prior.listings.map(l => [l.sourceUrl, l]));
    const mergedAway = new Set(target === 'DUPLICATE_PROPERTY' ? prior.findingsMerged ?? (prior.findings.filter(f => f.code === 'DUPLICATE_PROPERTY').flatMap(f => f.examples.flatMap(e => e.sourceUrls ?? []))) : []);
    for (const [url, old] of was) {
      const cur = now.get(url);
      if (!cur) { if (!mergedAway.has(url)) problems.push(`${site.id}: imported record disappeared: ${url}`); continue; }
      if ((cur.ownership ?? null) !== (old.ownership ?? null)) problems.push(`${site.id}: ownership changed ${old.ownership} -> ${cur.ownership}: ${url}`);
      if (namesProperty(old.title) && !namesProperty(cur.title)) problems.push(`${site.id}: title no longer names the property ("${old.title}" -> "${cur.title}")`);
      if (cur.description < old.description * 0.9) problems.push(`${site.id}: description shrank (${old.description} -> ${cur.description}): ${url}`);
      if (cur.photos < old.photos) problems.push(`${site.id}: photos decreased (${old.photos} -> ${cur.photos}): ${url}`);
      if (old.price && cur.price !== old.price) problems.push(`${site.id}: price changed ("${old.price}" -> "${cur.price}"): ${url}`);
      if (old.title !== cur.title) improvements.push(`${site.id}: "${old.title}" -> "${cur.title}"`);
    }
    for (const [url, cur] of now) {
      if (was.has(url)) continue;
      if (!cur.ownership) problems.push(`${site.id}: new unattributed record (market listings are not an improvement): ${url}`);
      else improvements.push(`${site.id}: new ${cur.ownership} record ${url}`);
    }
  }
  if (cpuAfter > cpuBefore * 1.2 + 100) problems.push(`Corpus CPU rose more than 20%: ${cpuBefore} ms -> ${cpuAfter} ms.`);
  notes.push(`Corpus CPU ${cpuBefore} ms -> ${cpuAfter} ms.`);
  return { ok: !problems.length, problems, improvements: improvements.slice(0, 200), notes, targetBefore, targetAfter };
}

async function gate({ failureId, base, skipSuite = false, registry }) {
  const failure = registry.failures[failureId];
  if (!failure) throw new Error(`Unknown failure ${failureId}`);
  const verdict = { failure: failureId, base, head: git('rev-parse', 'HEAD').trim(), baseSha: git('rev-parse', base).trim(), at: new Date().toISOString(), checks: {} };
  verdict.checks.policy = changePolicy(base, failureId);
  verdict.checks.static = staticChecks();
  verdict.checks.suite = skipSuite ? { ok: true, skipped: true } : suite();
  const baseDir = baseFunctions(base);
  const before = await evaluate({ functionsRoot: baseDir });
  const after = await evaluate();
  verdict.checks.corpus = compare(before, after, failure);
  verdict.holdout = after.sites.filter(s => !failure.sites.some(f => f.id === s.id)).map(s => s.id);
  verdict.accepted = Object.values(verdict.checks).every(check => check.ok);
  return { verdict, before, after };
}

function report(verdict) {
  const lines = [`# Acceptance gate: ${verdict.failure} — ${verdict.accepted ? 'ACCEPTED' : 'REJECTED'}`, '',
    `Candidate ${verdict.head.slice(0, 10)} against base ${verdict.baseSha.slice(0, 10)} (${verdict.at}).`, ''];
  for (const [name, check] of Object.entries(verdict.checks)) {
    lines.push(`## ${name}: ${check.ok ? 'pass' : 'FAIL'}`);
    for (const p of check.problems ?? []) lines.push(`- ✗ ${p}`);
    for (const p of check.failing ?? []) lines.push(`- ✗ failing test: ${p}`);
    if (check.pass !== undefined) lines.push(`- ${check.pass} passed, ${check.fail} failed; network guard: ${check.guard}`);
    for (const n of check.notes ?? []) lines.push(`- ${n}`);
    for (const i of (check.improvements ?? []).slice(0, 40)) lines.push(`- ✓ ${i}`);
    lines.push('');
  }
  lines.push(`Judged on ${verdict.holdout.length} sites not named in the repair brief: ${verdict.holdout.join(', ')}.`);
  return lines.join('\n') + '\n';
}

module.exports = { gate, changePolicy, compare, report, ALLOWED };

if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  const arg = name => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined;
  const { loadRegistry } = require('./failures.cjs');
  const failureId = arg('failure');
  const base = arg('base') ?? 'origin/repair/compatibility-engine';
  const { verdict } = await gate({ failureId, base, skipSuite: args.includes('--skip-suite'), registry: loadRegistry() });
  const out = arg('out') ?? path.join(repoRoot, 'diagnostics/improvement/gate');
  fs.mkdirSync(out, { recursive: true });
  const name = `${failureId}-${verdict.head.slice(0, 10)}`;
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(verdict, null, 2));
  fs.writeFileSync(path.join(out, `${name}.md`), report(verdict));
  process.stdout.write(report(verdict));
  process.exit(verdict.accepted ? 0 : 1);
})();
