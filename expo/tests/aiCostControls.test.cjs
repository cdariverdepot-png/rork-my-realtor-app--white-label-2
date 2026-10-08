// Phase 9, cost controls (synthetic contracts): every importer model request goes through one metered
// gateway. Offline runs cannot reach a paid model, staging cannot spend the production key unless that
// is explicitly allowed, staging requests have hard limits, identical completed requests are not bought
// twice, and every response reports what it used. The offline guard itself is also pinned here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { runBuild, currentBundle } = require('../scripts/build-pipeline-harness.cjs');

let gatewayModule;
const load = async () => gatewayModule ??= await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(
  fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/analyze-realtor-build/aiGateway.ts'), 'utf8'))).toString('base64'));

const envFrom = values => name => values[name];
const completed = (usage = { input_tokens: 1000, output_tokens: 200 }, extra = {}) => ({ status: 'completed', model: 'gpt-4.1-2025-04-14', usage, output: [], ...extra });
const scripted = (...replies) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
    const reply = replies.length > 1 ? replies.shift() : replies[0];
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.http ? reply.body : reply), { status: reply.http ?? 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
};
const silent = () => {};

test('offline mode blocks every model request before anything is sent', async () => {
  const { createAiGateway, AiBlockedError } = await load();
  const net = scripted(completed());
  const ai = createAiGateway({ env: envFrom({ AI_MODE: 'offline', OPENAI_API_KEY: 'prod' }), channel: 'production', fetch: net.fetch, log: silent });
  assert.equal(ai.available(), false);
  await assert.rejects(ai.request('profile', { input: 'x' }), error => error instanceof AiBlockedError && error.code === 'ai_offline');
  assert.equal(net.calls.length, 0);
  assert.equal(ai.summary().blocked, 1);
  assert.equal(ai.summary().calls, 0);
});

test('staging never uses the production key by default; its own key or an explicit opt-in is required', async () => {
  const { createAiGateway } = await load();
  const none = createAiGateway({ env: envFrom({ OPENAI_API_KEY: 'prod' }), channel: 'staging', fetch: scripted(completed()).fetch, log: silent });
  assert.equal(none.available(), false);
  await assert.rejects(none.request('navigation', {}), { code: 'ai_key_missing' });

  const ownNet = scripted(completed());
  const own = createAiGateway({ env: envFrom({ OPENAI_API_KEY: 'prod', OPENAI_API_KEY_STAGING: 'dev' }), channel: 'staging', fetch: ownNet.fetch, log: silent });
  await own.request('navigation', { input: 'a' });
  assert.equal(ownNet.calls[0].auth, 'Bearer dev');

  const sharedNet = scripted(completed());
  const shared = createAiGateway({ env: envFrom({ OPENAI_API_KEY: 'prod', AI_STAGING_ALLOW_SHARED_KEY: '1' }), channel: 'staging', fetch: sharedNet.fetch, log: silent });
  await shared.request('navigation', { input: 'a' });
  assert.equal(sharedNet.calls[0].auth, 'Bearer prod');
});

test('staging requests stop at their call and spending limits; production is metered but not capped here', async () => {
  const { createAiGateway } = await load();
  const net = scripted(completed());
  const capped = createAiGateway({ env: envFrom({ OPENAI_API_KEY_STAGING: 'dev', AI_STAGING_MAX_CALLS: '2' }), channel: 'staging', fetch: net.fetch, log: silent });
  await capped.request('navigation', { input: 1 });
  await capped.request('navigation', { input: 2 });
  await assert.rejects(capped.request('navigation', { input: 3 }), { code: 'ai_budget' });
  assert.equal(net.calls.length, 2);

  const pricey = scripted(completed({ input_tokens: 100_000, output_tokens: 10_000 })); // $0.28 at gpt-4.1 list price
  const dollars = createAiGateway({ env: envFrom({ OPENAI_API_KEY_STAGING: 'dev', AI_STAGING_MAX_USD: '0.25' }), channel: 'staging', fetch: pricey.fetch, log: silent });
  await dollars.request('profile', { input: 1 });
  await assert.rejects(dollars.request('profile', { input: 2 }), { code: 'ai_budget' });
  assert.equal(pricey.calls.length, 1);

  const prodNet = scripted(completed());
  const production = createAiGateway({ env: envFrom({ OPENAI_API_KEY: 'prod' }), channel: 'production', fetch: prodNet.fetch, log: silent });
  for (let i = 0; i < 12; i++) await production.request('navigation', { input: i });
  assert.equal(prodNet.calls.length, 12);
  assert.equal(production.policy.maxCalls, Infinity);
});

test('an identical completed request is answered once; failed and incomplete answers are never reused', async () => {
  const { createAiGateway } = await load();
  const net = scripted(completed());
  const ai = createAiGateway({ env: envFrom({ OPENAI_API_KEY: 'prod' }), channel: 'production', fetch: net.fetch, log: silent });
  const first = await (await ai.request('navigation', { input: 'same' })).json();
  const second = await (await ai.request('navigation', { input: 'same' })).json();
  assert.deepEqual(second, first);
  assert.equal(net.calls.length, 1);
  assert.equal(ai.summary().reused, 1);

  const flaky = scripted({ http: 500, body: { error: 'overloaded' } }, completed(undefined, { status: 'incomplete' }), completed());
  const retrying = createAiGateway({ env: envFrom({ OPENAI_API_KEY: 'prod' }), channel: 'production', fetch: flaky.fetch, log: silent });
  for (let i = 0; i < 3; i++) await retrying.request('copy-variation', { input: 'retry me' });
  assert.equal(flaky.calls.length, 3, 'a retry after a failure or an incomplete answer is a real new request');
});

test('usage is priced per stage from reported tokens; unknown models are priced high and flagged', async () => {
  const { createAiGateway, estimateAiCost } = await load();
  assert.deepEqual(estimateAiCost('gpt-4.1-2025-04-14', { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 }), { usd: 10, priced: true });
  assert.deepEqual(estimateAiCost('gpt-4.1-mini', { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 0 }), { usd: 0.25, priced: true });
  const unknown = estimateAiCost('brand-new-model', { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 });
  assert.equal(unknown.priced, false);
  assert.ok(unknown.usd >= 5, 'an unknown model never looks cheap');

  const net = scripted(completed({ input_tokens: 10_000, output_tokens: 1_000, input_tokens_details: { cached_tokens: 4_000 } }));
  const logged = [];
  const ai = createAiGateway({ env: envFrom({ OPENAI_API_KEY: 'prod', OPENAI_MODEL_NAVIGATION: 'gpt-4.1-mini' }), channel: 'production', fetch: net.fetch, log: r => logged.push(r) });
  await ai.request('profile', { input: 1 });
  await ai.request('navigation', { input: 2 });
  assert.equal(net.calls[0].body.model, 'gpt-4.1', 'default model is unchanged');
  assert.equal(net.calls[1].body.model, 'gpt-4.1-mini', 'a stage model is used only when explicitly configured');
  const summary = ai.summary();
  assert.equal(summary.calls, 2);
  assert.equal(summary.inputTokens, 20_000);
  // 6,000 uncached x $2 + 4,000 cached x $0.50 + 1,000 out x $8, per million = $0.022 each (reported model is gpt-4.1)
  assert.equal(summary.byStage.profile.estimatedUsd, 0.022);
  assert.equal(summary.estimatedUsd, 0.044);
  assert.ok(logged.every(record => typeof record.ms === 'number'), 'durations are logged');
  assert.ok(summary.records.every(record => !('ms' in record)), 'the returned summary is deterministic');
});

const agentSite = { seeds: ['https://agent.example/'], pages: [{ url: 'https://agent.example/', finalUrl: 'https://agent.example/',
  html: '<html><head><title>Jane Agent | Realtor</title></head><body><h1>Jane Agent</h1><p>Helping buyers and sellers in Springfield.</p></body></html>' }] };
const stagingBundle = () => {
  const source = currentBundle();
  const marker = 'const DEPLOYMENT_CHANNEL: "production" | "staging" = "production";';
  assert.ok(source.includes(marker), 'the deploy bundle embeds the deployment channel');
  return source.replace(marker, 'const DEPLOYMENT_CHANNEL: "production" | "staging" = "staging";');
};
const quiet = async work => {
  const log = console.log, error = console.error;
  console.log = () => {}; console.error = () => {};
  try { return await work(); } finally { console.log = log; console.error = error; }
};

test('a staging build without its own AI key stops before any model request, with a coded reason', () => quiet(async () => {
  const run = await runBuild(stagingBundle(), agentSite, { latencyMs: 1, aiLatencyMs: 1, env: { OPENAI_API_KEY_STAGING: undefined, AI_STAGING_ALLOW_SHARED_KEY: undefined } });
  assert.equal(run.status, 503);
  assert.equal(run.body.code, 'ai_blocked');
  assert.match(run.body.error, /no separate AI key/);
  assert.match(run.body.error, /sources and any imported listings are saved/);
  assert.equal(run.requests.filter(r => r.url.startsWith('https://api.openai.com/')).length, 0);
  assert.equal(run.body.aiUsage.calls, 0);
  assert.equal(run.body.aiUsage.blocked, 1);
}));

test('a production build reports its model usage with the ordinary result', () => quiet(async () => {
  const run = await runBuild(currentBundle(), agentSite, { latencyMs: 1, aiLatencyMs: 1 });
  assert.equal(run.status, 200);
  assert.equal(run.body.aiUsage.channel, 'production');
  assert.equal(run.body.aiUsage.calls, run.requests.filter(r => r.url.startsWith('https://api.openai.com/')).length);
  assert.ok(run.body.aiUsage.byStage.profile.calls >= 1);
}));

test('the Level A guard refuses live and paid requests in every regression process', async () => {
  assert.equal(process.env.AI_MODE, 'offline');
  await assert.rejects(fetch('https://api.openai.com/v1/responses', { method: 'POST' }), { code: 'LEVEL_A_OFFLINE' });
  await assert.rejects(fetch('https://www.realtor-site.example/'), /live network/);
  assert.throws(() => require('node:https').request('https://www.realtor-site.example/'), { code: 'LEVEL_A_OFFLINE' });
  // These refusals were the point of this test; clear them so the guard does not fail the process.
  globalThis.__levelAGuard.clear();
});

test('campaigns are planned against level and daily limits; full builds need a justification', () => {
  const { planCampaign } = require('../scripts/ai-budget.cjs');
  const config = { levels: { A: { usdLimit: 0 }, B: { usdLimit: 0 }, C: { usdLimit: 0.5, maxSites: 3 }, D: { usdLimit: 2, maxSites: 25 } },
    dailyUsdLimit: 3, alertFraction: 0.8, defaultEstimateUsdPerBuild: 0.12, authorization: null };
  const now = Date.parse('2026-10-08T12:00:00Z');
  assert.equal(planCampaign({ level: 'A', sites: 500, now, config, ledger: [] }).allowed, true, 'offline replay costs nothing');
  assert.equal(planCampaign({ level: 'B', sites: 40, now, config, ledger: [] }).allowed, true, 'live extraction without AI costs nothing');
  assert.match(planCampaign({ level: 'D', sites: 5, now, config, ledger: [] }).reason, /justification/);
  assert.match(planCampaign({ level: 'D', sites: 25, justification: 'release gate before approval', now, config, ledger: [] }).reason, /exceeds the level D limit/);
  assert.match(planCampaign({ level: 'C', sites: 4, now, config, ledger: [] }).reason, /at most 3 sites/);
  const spentToday = [{ at: '2026-10-08T01:00:00Z', kind: 'site', level: 'D', estimatedUsd: 2.5, calls: 4 }];
  assert.match(planCampaign({ level: 'D', sites: 5, justification: 'integration milestone check', now, config, ledger: spentToday }).reason, /daily limit/);
  const yesterday = [{ at: '2026-10-07T23:00:00Z', kind: 'site', level: 'D', estimatedUsd: 2.5, calls: 4 }];
  assert.equal(planCampaign({ level: 'D', sites: 5, justification: 'integration milestone check', now, config, ledger: yesterday }).allowed, true);
});

test('the campaign meter alerts early, stops before a site would cross the limit, and records every site', () => {
  const { createCampaignMeter } = require('../scripts/ai-budget.cjs');
  const config = { levels: { D: { usdLimit: 0.5 } }, dailyUsdLimit: 3, alertFraction: 0.8, defaultEstimateUsdPerBuild: 0.12 };
  const written = [], warnings = [];
  const meter = createCampaignMeter({ campaign: 't', level: 'D', config, ledger: [], now: () => Date.parse('2026-10-08T12:00:00Z'), write: e => written.push(e), warn: w => warnings.push(w) });
  let sites = 0;
  while (meter.beforeSite()) { meter.recordSite(`site-${sites++}`, [{ calls: 2, estimatedUsd: 0.1 }, { calls: 1, estimatedUsd: 0.02 }]); }
  assert.equal(sites, 4, '4 x $0.12 = $0.48; a fifth site estimated at $0.12 would cross $0.50');
  assert.equal(written.length, 4);
  assert.equal(written[0].calls, 3);
  assert.ok(warnings.some(w => /ALERT/.test(w)), 'alert at 80%');
  assert.match(meter.stopped, /Stopped before the next site/);
});
