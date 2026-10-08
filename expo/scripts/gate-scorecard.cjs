// Scorecard for a stage-gate run (diagnostics/gate-<run>): completion and accuracy, separately.
// Completion: the build reached review, or stopped with its reason and a way forward (never stranded).
// Accuracy is judged from what each throwaway account actually saved (SELECT-only snapshot):
// listings attributed to the agent's own office, labelled featured, or unattributed; full details;
// titles that are addresses rather than card text.
//   node scripts/gate-scorecard.cjs ../diagnostics/gate-<run>
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(process.argv[2]);
const rows = [];
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.saved.json')).sort()) {
  const run = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const savedFile = path.join(dir, file.replace('.json', '.saved.json'));
  const saved = fs.existsSync(savedFile) ? JSON.parse(fs.readFileSync(savedFile, 'utf8')) : [];
  const listings = saved.flatMap(account => account.listings ?? []);
  const final = run.finalBuildScreen ?? '';
  const stopped = /The build stopped/.test(final) || /BUILD STOPPED/.test(final);
  // The harness could not open an owner-test session (sign-in), so the importer never ran: not an import outcome.
  const harness = !run.reviewMs && !stopped && !(run.calls ?? []).length && /waitForURL|portal|Access code/i.test(run.error ?? '');
  const outcome = run.reviewMs ? 'review' : stopped ? 'stopped-with-reason' : harness ? 'harness-sign-in-failed' : 'stranded';
  const reason = stopped ? (final.split('\n').find((line, i, all) => all[i - 1] === 'The build stopped') ?? '') : '';
  const cardText = /\$\s?\d|\b\d+\s*(?:beds?|bd|baths?|ba)\b|view details|add to favorites|&(?:nbsp|#\d+);/i;
  rows.push({ site: run.id, outcome, seconds: run.reviewMs ? Math.round(run.reviewMs / 1000) : null, reason: reason.slice(0, 140),
    saved: listings.length, own: listings.filter(l => l.ownership === 'own').length, featured: listings.filter(l => l.ownership === 'featured').length,
    unattributed: listings.filter(l => !l.ownership).length, fullDetails: listings.filter(l => l.detailsComplete).length,
    cardTextTitles: listings.filter(l => cardText.test(l.title ?? '')).length });
}
const harness = rows.filter(r => r.outcome === 'harness-sign-in-failed').length;
const total = rows.length - harness, reached = rows.filter(r => r.outcome === 'review').length, stranded = rows.filter(r => r.outcome === 'stranded').length;
console.log(`completion: ${reached}/${total} reached review; ${total - reached - stranded} stopped with a reason; ${stranded} stranded` +
  (harness ? `; ${harness} not run (test harness could not sign in; reported separately)` : ''));
console.table(rows);
fs.writeFileSync(path.join(dir, 'scorecard.json'), JSON.stringify({ reached, total, stranded, harness, rows }, null, 2));
