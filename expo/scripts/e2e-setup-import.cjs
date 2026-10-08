// Production end-to-end check of the realtor setup import, run from CI against the deployed web app.
// Phase "request": creates throwaway credentials and writes only {email, bcrypt hash} for an operator
// to provision a confirmed test realtor (the password never leaves the runner).
// Phase "run": signs in through the real portal UI, imports one website on /admin/build, and records
// what the screen showed over time, the importer network calls, screenshots, and the outcome.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const APP = process.env.APP_URL ?? 'https://cdariverdepot-my-realtor.expo.app';
const SUPABASE = 'https://xdcqjaodcvnlawqcunrr.supabase.co';
const PUBLIC_KEY = 'sb_publishable_yAEO6l9LfHPccsDDPUR-uQ_5pRbv4Dt';
const out = process.env.OUT_DIR ?? path.resolve('e2e-out');
fs.mkdirSync(out, { recursive: true });

async function request(cases) {
  const bcrypt = require('bcryptjs');
  const secrets = {}, ask = [];
  for (const item of cases) {
    const password = crypto.randomBytes(24).toString('base64url');
    const email = `import-probe-${item.name}-${process.env.GITHUB_RUN_ID ?? Date.now()}@example.com`;
    secrets[item.name] = { email, password };
    ask.push({ ...item, email, hash: bcrypt.hashSync(password, 10) });
  }
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP ?? out, 'secrets.json'), JSON.stringify(secrets));
  return ask;
}

async function waitForAccount({ email, password }, minutes) {
  const deadline = Date.now() + minutes * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: 'POST',
      headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (response.ok) return true;
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  return false;
}

async function run(item, credentials) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  // The realtor walkthrough is covered elsewhere; this check starts at the builder.
  await context.addInitScript(() => { try { localStorage.setItem('vance.onboarding.v3', JSON.stringify({ realtorTourSeen: true })); } catch {} });
  const page = await context.newPage();
  const result = { site: item.name, url: item.url, email: credentials.email, timeline: [], network: [], console: [], screenshots: [] };
  const t0 = Date.now();
  const shot = async name => { const file = `${item.name}-${String(result.screenshots.length).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: path.join(out, file), fullPage: true }).catch(() => {}); result.screenshots.push(file); };
  page.on('console', message => { if (/error|warn|\[build|\[import/i.test(message.type() + message.text())) result.console.push({ at: Date.now() - t0, type: message.type(), text: message.text().slice(0, 400) }); });
  const calls = new Map();
  page.on('request', req => { if (req.url().includes('/functions/v1/')) calls.set(req, { fn: req.url().split('/functions/v1/')[1], start: Date.now() - t0, accept: req.headers()['accept'] }); });
  page.on('response', res => { const entry = calls.get(res.request()); if (entry) { entry.status = res.status(); entry.headersAt = Date.now() - t0; entry.contentType = res.headers()['content-type']; } });
  page.on('requestfinished', req => { const entry = calls.get(req); if (entry) { entry.end = Date.now() - t0; result.network.push(entry); } });
  page.on('requestfailed', req => { const entry = calls.get(req); if (entry) { entry.failed = req.failure()?.errorText; entry.end = Date.now() - t0; result.network.push(entry); } });
  try {
    await page.goto(`${APP}/portal?entry=realtor`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByPlaceholder('you@example.com').fill(credentials.email);
    await page.getByPlaceholder('••••••••').fill(credentials.password);
    await shot('signin');
    await page.getByText('SIGN IN', { exact: true }).click();
    await page.waitForURL(url => !String(url).includes('/portal'), { timeout: 60_000 });
    result.signedInAt = Date.now() - t0;
    await page.goto(`${APP}/admin/build`, { waitUntil: 'networkidle', timeout: 60_000 });
    const field = page.getByPlaceholder('https://your-website.com');
    await field.waitFor({ timeout: 60_000 });
    await field.fill(item.url);
    await page.waitForTimeout(1500); // the URL check runs before the button enables
    await shot('url');
    const submittedAt = Date.now() - t0;
    result.submittedAt = submittedAt;
    await page.getByLabel('Import my listings').click();
    // Sample the screen as the realtor sees it. Record each distinct activity state with its time.
    let last = '', done = false;
    const deadline = Date.now() + 240_000;
    while (!done && Date.now() < deadline) {
      const text = await page.evaluate(() => document.body.innerText).catch(() => '');
      const start = text.indexOf('Building your app');
      const activity = start >= 0 ? text.slice(start).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 40).join('\n') : '';
      const review = /Here’s your app|Here's your app/.test(text);
      const snapshot = review ? 'REVIEW' : activity || text.slice(0, 600);
      if (snapshot !== last) {
        result.timeline.push({ at: Date.now() - t0 - submittedAt, screen: snapshot });
        last = snapshot;
        if (result.timeline.length % 6 === 1) await shot('progress');
      }
      if (review) { done = true; result.reviewAt = Date.now() - t0 - submittedAt; break; }
      await page.waitForTimeout(150);
    }
    await shot(done ? 'review' : 'timeout');
    result.finalText = (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 4000);
    result.outcome = done ? 'review' : 'did-not-finish';
  } catch (error) {
    result.outcome = 'error';
    result.error = String(error.stack ?? error).slice(0, 1500);
    await shot('error');
    result.finalText = (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 4000);
  } finally {
    await browser.close();
  }
  return result;
}

(async () => {
  const phase = process.argv[2];
  const cases = JSON.parse(process.env.CASES);
  if (phase === 'request') {
    fs.writeFileSync(path.join(out, 'request.json'), JSON.stringify(await request(cases), null, 2));
    return;
  }
  const secrets = JSON.parse(fs.readFileSync(path.join(process.env.RUNNER_TEMP ?? out, 'secrets.json'), 'utf8'));
  const report = { app: APP, ranAt: new Date().toISOString(), results: [] };
  for (const item of cases) {
    const ready = await waitForAccount(secrets[item.name], Number(process.env.WAIT_MINUTES ?? 25));
    report.results.push(ready ? await run(item, secrets[item.name]) : { site: item.name, outcome: 'account-not-provisioned' });
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  }
})();
