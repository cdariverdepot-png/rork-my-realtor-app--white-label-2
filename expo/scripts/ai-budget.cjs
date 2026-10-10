// AI budget controls for automated testing campaigns (Levels A-D).
//
// Every campaign is planned before it starts: the level's limit, today's spend in the ledger and an
// estimate per site (the measured average of earlier builds, or the configured default) must leave room,
// or the campaign is refused. While it runs, a meter adds each site's reported usage (the importer
// functions return `aiUsage`) and stops the campaign before the next site would cross a hard limit,
// warning at the alert fraction. Spending is appended to diagnostics/ai-ledger.jsonl, so daily totals
// accumulate across workflow runs. Raising a limit requires an `authorization` block in
// diagnostics/ai-budget.json; nothing here can raise it automatically.
//
//   node scripts/ai-budget.cjs status
//   node scripts/ai-budget.cjs plan --level D --sites 25 [--justification "release gate"]
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const CONFIG = path.join(root, 'diagnostics/ai-budget.json');
const LEDGER = path.join(root, 'diagnostics/ai-ledger.jsonl');

function loadConfig(file = CONFIG) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const auth = config.authorization;
  if (auth && auth.by && auth.date && auth.reason) {
    // An authorization may raise limits; it never removes the daily limit or the alert.
    for (const [level, limits] of Object.entries(auth.levels ?? {})) Object.assign(config.levels[level] ??= {}, limits);
    if (typeof auth.dailyUsdLimit === 'number') config.dailyUsdLimit = auth.dailyUsdLimit;
  }
  return config;
}

function readLedger(file = LEDGER) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}

const day = at => new Date(at).toISOString().slice(0, 10);
const spentOn = (ledger, date) => ledger.filter(entry => day(entry.at) === date).reduce((sum, entry) => sum + (entry.estimatedUsd ?? 0) + (entry.unresolvedUsd ?? 0), 0);

/** Measured average spend per full build from the ledger, or the configured default. */
function estimatePerBuild(config, ledger) {
  const builds = ledger.filter(entry => entry.level === 'D' && entry.kind === 'site' && entry.calls > 0);
  if (builds.length >= 3) return builds.reduce((sum, entry) => sum + entry.estimatedUsd, 0) / builds.length;
  return config.defaultEstimateUsdPerBuild;
}

/** Decide whether a campaign may start. Pure: pass `now`, config and ledger for tests. */
function planCampaign({ level, sites, justification, now = Date.now(), config = loadConfig(), ledger = readLedger() }) {
  const limits = config.levels[level];
  if (!limits) return { allowed: false, reason: `Unknown level ${level}.` };
  const perSite = level === 'A' || level === 'B' ? 0 : estimatePerBuild(config, ledger) * (level === 'C' ? 0.5 : 1);
  const estimate = perSite * sites;
  const today = spentOn(ledger, day(now));
  const result = { level, sites, perSiteEstimateUsd: round(perSite), estimateUsd: round(estimate), spentTodayUsd: round(today),
    levelLimitUsd: limits.usdLimit, dailyLimitUsd: config.dailyUsdLimit };
  if (limits.maxSites && sites > limits.maxSites) return { ...result, allowed: false, reason: `Level ${level} allows at most ${limits.maxSites} sites per campaign.` };
  if (level === 'D' && !(justification && justification.trim().length >= 12)) return { ...result, allowed: false, reason: 'A full end-to-end campaign needs a written justification (milestone, integration change or release gate).' };
  if (estimate > limits.usdLimit) return { ...result, allowed: false, reason: `Estimated $${round(estimate)} exceeds the level ${level} limit of $${limits.usdLimit}. Reduce the sites or record an authorization.` };
  if (today + estimate > config.dailyUsdLimit) return { ...result, allowed: false, reason: `Today's spend $${round(today)} plus this estimate would exceed the daily limit of $${config.dailyUsdLimit}.` };
  return { ...result, allowed: true };
}

/** Running meter for one campaign. `beforeSite()` says whether the next site may start. */
function createCampaignMeter({ campaign, level, config = loadConfig(), ledger = readLedger(), now = () => Date.now(), write = appendLedger, warn = console.warn }) {
  const limit = Math.min(config.levels[level]?.usdLimit ?? 0, Math.max(0, config.dailyUsdLimit - spentOn(ledger, day(now()))));
  const perSite = level === 'D' ? estimatePerBuild(config, ledger) : level === 'C' ? estimatePerBuild(config, ledger) * 0.5 : 0;
  let spent = 0, alerted = false, stopped = null;
  return {
    get spent() { return round(spent); },
    get stopped() { return stopped; },
    limit,
    beforeSite() {
      if (stopped) return false;
      if (spent + perSite > limit) {
        stopped = `Stopped before the next site: spent $${round(spent)} of $${round(limit)}; the next site is estimated at $${round(perSite)}.`;
        warn(`[ai-budget] ${stopped}`);
        return false;
      }
      return true;
    },
    recordSite(site, usages) {
      const total = usages.filter(Boolean).reduce((acc, u) => ({ calls: acc.calls + (u.calls ?? 0), blocked: acc.blocked + (u.blocked ?? 0),
        estimatedUsd: acc.estimatedUsd + (u.estimatedUsd ?? 0), unresolvedUsd: acc.unresolvedUsd + (u.unresolvedUsd ?? 0), inputTokens: acc.inputTokens + (u.inputTokens ?? 0), outputTokens: acc.outputTokens + (u.outputTokens ?? 0) }),
      { calls: 0, blocked: 0, estimatedUsd: 0, unresolvedUsd: 0, inputTokens: 0, outputTokens: 0 });
      spent += total.estimatedUsd + total.unresolvedUsd;
      write({ at: new Date(now()).toISOString(), kind: 'site', campaign, level, site, ...total, estimatedUsd: round(total.estimatedUsd) });
      if (!alerted && spent >= limit * config.alertFraction) { alerted = true; warn(`[ai-budget] ALERT: campaign ${campaign} has used $${round(spent)} of its $${round(limit)} limit.`); }
      if (spent >= limit) stopped = `Hard limit reached: $${round(spent)} of $${round(limit)}.`;
      return total;
    },
  };
}

function appendLedger(entry, file = LEDGER) { fs.appendFileSync(file, JSON.stringify(entry) + '\n'); }
const round = n => Math.round(n * 10000) / 10000;

module.exports = { loadConfig, readLedger, planCampaign, createCampaignMeter, estimatePerBuild, appendLedger, spentOn, LEDGER, CONFIG };

if (require.main === module) {
  const [command, ...rest] = process.argv.slice(2);
  const arg = name => rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] : undefined;
  if (command === 'plan') {
    const plan = planCampaign({ level: arg('level'), sites: Number(arg('sites') ?? 1), justification: arg('justification') });
    console.log(JSON.stringify(plan, null, 2));
    process.exit(plan.allowed ? 0 : 3);
  } else {
    const config = loadConfig(), ledger = readLedger(), today = spentOn(ledger, day(Date.now()));
    console.log(JSON.stringify({ today: day(Date.now()), spentTodayUsd: round(today), dailyLimitUsd: config.dailyUsdLimit,
      alert: today >= config.dailyUsdLimit * config.alertFraction, perBuildEstimateUsd: round(estimatePerBuild(config, ledger)),
      ledgerEntries: ledger.length, authorization: config.authorization ? 'present' : 'none' }, null, 2));
  }
}
