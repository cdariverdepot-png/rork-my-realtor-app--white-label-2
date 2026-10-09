// 25-site diagnostic: runs the deployed web app's setup import for each site in its own isolated
// owner-test session (REALTOR access code), captures the importer's streamed events and results,
// the screen over time, the review and client preview (including what each preview button opens),
// a single render of the source page for comparison, and image dimensions for imported listings.
// Read-only toward the sites beyond one import and one page view each.
const fs = require('node:fs');
const path = require('node:path');

const APP = process.env.APP_URL ?? 'https://cdariverdepot-my-realtor.expo.app';
const out = process.env.OUT_DIR ?? path.resolve('diag-out');
fs.mkdirSync(out, { recursive: true });
const sites = JSON.parse(process.env.SITES);

function parseSse(text) {
  const events = [], results = [];
  for (const frame of text.split('\n\n')) {
    const data = frame.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
    if (!data) continue;
    try { const m = JSON.parse(data); if (m.event) events.push(m.event); if (m.result) results.push(m.result); } catch { /* keep going */ }
  }
  return { events, result: results.at(-1) ?? null };
}

async function imageSize(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const buf = Buffer.from(await res.arrayBuffer());
    const { imageSize } = require('image-size');
    const d = imageSize(buf);
    return { status: res.status, width: d.width, height: d.height, type: d.type, bytes: buf.length };
  } catch (e) { return { error: String(e.message ?? e).slice(0, 120) }; }
}

async function sourceView(browser, site, inventoryUrls) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const views = [];
  for (const url of [site.url, ...inventoryUrls.slice(0, 1)]) {
    const view = { url };
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      view.status = res?.status();
      await page.waitForTimeout(5000);
      view.finalUrl = page.url();
      view.title = await page.title();
      const info = await page.evaluate(() => {
        const text = document.body?.innerText ?? '';
        const prices = text.match(/\$\s?\d{1,3}(?:,\d{3})+(?!\d)/g) ?? [];
        const links = [...document.querySelectorAll('a[href]')].map(a => a.href);
        const propertyLinks = [...new Set(links.filter(h => /listing|property|homedetails|\/idx\/|mls|details/i.test(h)))];
        return { textLength: text.length, priceCount: prices.length, uniquePrices: [...new Set(prices)].length, propertyLinkCount: propertyLinks.length,
          sample: text.slice(0, 1200), challenge: /just a moment|verify you are human|access denied|client challenge|captcha/i.test(document.title + ' ' + text.slice(0, 2000)) };
      });
      Object.assign(view, info);
      view.screenshot = `${site.id}-source-${views.length}.png`;
      await page.screenshot({ path: path.join(out, view.screenshot), fullPage: false });
    } catch (e) { view.error = String(e.message ?? e).slice(0, 300); }
    views.push(view);
  }
  await context.close();
  return views;
}

/**
 * UI walkthrough of the review and client preview at phone size: what the review offers after the import, the
 * Home screen, the Listings tab (every card fully inside the screen width, count of cards, scroll to the end),
 * a property and back (on-screen Back and browser Back), saving a home, and the Saved tab. Screenshots are
 * viewport-sized, as the phone shows them.
 */
async function uiWalk(page, r) {
  const ui = r.ui = { steps: [] };
  const modal = () => page.locator('[aria-modal="true"]').last();
  const step = async (name, extra = {}) => {
    const file = `${r.id}-ui-${String(ui.steps.length).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(out, file) }).catch(() => {});
    ui.steps.push({ name, file, ...extra });
  };
  const text = async () => page.evaluate(() => document.body.innerText);
  const review = await text();
  ui.review = { importerOffered: /Bring in your listings/.test(review), imported: Number(review.match(/(\d+) listings? imported/)?.[1] ?? 0), url: page.url() };
  await step('review');
  const cards = async () => page.evaluate(() => [...document.querySelectorAll('[data-testid="listing-card"]')].map(el => {
    const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; }));
  await page.getByRole('button', { name: 'Preview My App' }).first().click();
  await page.waitForTimeout(2500);
  const home = await text();
  await step('home', { viewListingsButton: /\bView listings\b/.test(home), propertySection: /Property Search|Available homes|listings/i.test(home) });
  await modal().getByRole('button', { name: 'Listings', exact: true }).last().click();
  await page.waitForTimeout(2000);
  const listingText = await text();
  const boxes = await cards();
  const width = page.viewportSize().width;
  ui.listings = { cards: boxes.length, clipped: boxes.filter(b => b.x < 0 || b.x + b.w > width + 1).length, widths: [...new Set(boxes.map(b => b.w))],
    themeLabel: /THEME PREVIEW/.test(listingText), viewAll: /\bView all\b/.test(listingText), pickedForYou: /picked for you/i.test(listingText),
    heading: (listingText.match(/[^\n]*’s listings|Available homes/) ?? [''])[0], count: (listingText.match(/\d+ homes?\b/) ?? [''])[0],
    titles: await page.evaluate(() => [...document.querySelectorAll('[data-testid="listing-card"] [role="button"]')].map(el => el.getAttribute('aria-label')).filter(Boolean).slice(0, 40)) };
  await step('listings-top');
  // Scroll the preview to the end: every card must be reachable.
  const vp = page.viewportSize();
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let i = 0; i < 80; i++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  await step('listings-end', { lastCardVisible: await page.evaluate(() => { const all = [...document.querySelectorAll('[data-testid="listing-card"]')]; const last = all.at(-1);
    if (!last) return null; const b = last.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; }) });
  for (let i = 0; i < 80; i++) { await page.mouse.wheel(0, -1500); await page.waitForTimeout(40); }
  await page.waitForTimeout(600);
  if (boxes.length) {
    await modal().getByRole('button', { name: 'Save home' }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('[data-testid="listing-card"]').first().getByRole('button').first().click();
    await page.waitForTimeout(1500);
    await step('detail', { property: /PROPERTY PREVIEW/.test(await text()) });
    await modal().getByLabel('Back').first().click();
    await page.waitForTimeout(1200);
    ui.backFromDetail = (await cards()).length > 0 ? 'listings' : 'other';
    await page.locator('[data-testid="listing-card"]').first().getByRole('button').first().click();
    await page.waitForTimeout(1200);
    await page.goBack();
    await page.waitForTimeout(1200);
    ui.browserBackFromDetail = (await cards()).length > 0 ? 'listings' : (await page.locator('[aria-modal="true"]').count()) ? 'preview-other' : 'left-preview';
    await step('after-browser-back');
  }
  await modal().getByRole('button', { name: 'Saved', exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(1200);
  await step('saved', { savedShown: /Saved homes/.test(await text()) });
  // Browser Back until the preview closes: the review must still be there, with the same import.
  for (let i = 0; i < 6 && await page.locator('[aria-modal="true"]').count(); i++) { await page.goBack(); await page.waitForTimeout(900); }
  const after = await text();
  ui.afterClosing = { url: page.url(), review: /Here’s your app|Here's your app/.test(after), importerOffered: /Bring in your listings/.test(after),
    imported: Number(after.match(/(\d+) listings? imported/)?.[1] ?? 0) };
  await step('closed');
}

async function run(browser, site) {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  const r = { id: site.id, url: site.url, category: site.category, timeline: [], console: [], failedResources: [], calls: [], screenshots: [] };
  const t0 = Date.now();
  const shot = async name => { const f = `${site.id}-${String(r.screenshots.length).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: path.join(out, f), fullPage: true }).catch(() => {}); r.screenshots.push(f); };
  page.on('console', m => { if (m.type() === 'error' || /\[import|\[build|uncaught/i.test(m.text())) r.console.push({ at: Date.now() - t0, type: m.type(), text: m.text().slice(0, 300) }); });
  page.on('pageerror', e => r.console.push({ at: Date.now() - t0, type: 'pageerror', text: String(e.message).slice(0, 300) }));
  page.on('response', res => { if (res.status() >= 400) r.failedResources.push({ at: Date.now() - t0, status: res.status(), url: res.url().slice(0, 180) }); });
  const pending = [];
  page.on('requestfinished', req => {
    const fn = req.url().split('/functions/v1/')[1];
    if (!fn || req.method() !== 'POST') return;
    pending.push((async () => {
      const res = await req.response();
      const timing = req.timing();
      let body = ''; try { body = (await res.body()).toString('utf8'); } catch (e) { body = ''; }
      const parsed = /event-stream/.test(res.headers()['content-type'] ?? '') ? parseSse(body) : { events: [], result: (() => { try { return { status: res.status(), body: JSON.parse(body) }; } catch { return null; } })() };
      r.calls.push({ fn, status: res.status(), contentType: res.headers()['content-type'], ttfbMs: Math.round(timing.responseStart), totalMs: Math.round(timing.responseEnd), ...parsed });
    })());
  });
  try {
    // Owner-test sign-in, retried once after a pause: a transient sign-in limit is a harness failure,
    // not an import outcome, and is reported separately when both attempts fail.
    for (let attempt = 1; ; attempt++) {
      try {
        await page.goto(`${APP}/portal?entry=client`, { waitUntil: 'networkidle', timeout: 60000 });
        const code = page.getByLabel('Access code', { exact: true });
        await code.fill('REALTOR');
        await code.press('Enter');
        await page.waitForURL(u => String(u).includes('/admin'), { timeout: 60000 });
        break;
      } catch (error) {
        if (attempt >= 2) throw error;
        r.signInRetried = true;
        await page.waitForTimeout(30000);
      }
    }
    await page.getByLabel('Page 5').click({ timeout: 30000 });
    await page.getByText('BUILD MY APP', { exact: true }).click({ timeout: 30000 });
    await page.waitForURL(u => String(u).includes('/admin/build'), { timeout: 60000 });
    const field = page.getByPlaceholder('https://your-website.com');
    await field.waitFor({ timeout: 60000 });
    await field.fill(site.url);
    // URL validation: what the realtor sees before submitting.
    const button = page.getByLabel('Import my listings');
    const validStart = Date.now();
    while (Date.now() - validStart < 15000 && !(await button.isEnabled().catch(() => false))) await page.waitForTimeout(250);
    r.validation = { enabled: await button.isEnabled().catch(() => false), waitedMs: Date.now() - validStart,
      text: (await page.evaluate(() => document.body.innerText)).split('\n').filter(l => /check|valid|found|couldn|doesn/i.test(l)).slice(0, 4) };
    await shot('url');
    r.submittedAt = Date.now() - t0;
    await button.click({ timeout: 20000 });
    let last = '', done = false;
    const deadline = Date.now() + 420000; // detail jobs run after the inventory job; large imports take several
    while (Date.now() < deadline) {
      const text = await page.evaluate(() => document.body.innerText).catch(() => '');
      const start = text.indexOf('Building your app');
      const review = /Here’s your app|Here's your app/.test(text);
      const snapshot = review ? 'REVIEW' : start >= 0 ? text.slice(start).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 40).join('\n') : text.slice(0, 500);
      if (snapshot !== last) { r.timeline.push({ at: Date.now() - t0 - r.submittedAt, screen: snapshot }); last = snapshot; }
      if (review) { done = true; break; }
      await page.waitForTimeout(200);
    }
    r.reviewMs = done ? Date.now() - t0 - r.submittedAt : null;
    r.finalBuildScreen = r.timeline.filter(t => t.screen !== 'REVIEW').at(-1)?.screen ?? '';
    await shot(done ? 'review' : 'stuck');
    r.reviewText = (await page.evaluate(() => document.body.innerText)).slice(0, 6000);
    // Website changes in one session (cross-website isolation): site.then = [{ url, how: 'change' | 'exit-mid-import' }].
    // 'change' uses the review's Change link after the previous import finished; 'exit-mid-import' leaves the
    // builder a few seconds into the previous import and starts again from the new website.
    const waitReview = async host => {
      const until = Date.now() + 420000;
      while (Date.now() < until) {
        const text = await page.evaluate(() => document.body.innerText).catch(() => '');
        if (/Here’s your app|Here's your app/.test(text) && text.includes(host)) return true;
        await page.waitForTimeout(300);
      }
      return false;
    };
    const submitUrl = async url => {
      const field2 = page.getByPlaceholder('https://your-website.com');
      await field2.waitFor({ timeout: 60000 });
      await field2.fill(url);
      const submit = page.getByLabel('Import my listings');
      for (let i = 0; i < 60 && !(await submit.isEnabled().catch(() => false)); i++) await page.waitForTimeout(250);
      await submit.click({ timeout: 20000 });
    };
    r.changes = [];
    const plan = Array.isArray(site.then) ? site.then : site.replaceWith ? [{ url: site.replaceWith, how: 'change' }] : [];
    let previousUrl = site.url;
    for (const change of plan) {
      const host = new URL(change.url).hostname.replace(/^www\./, '');
      if (change.how === 'exit-mid-import') {
        // Start the previous website again, then leave a few seconds in.
        if (done) { await page.getByText('Change', { exact: true }).first().click({ timeout: 10000 }); await submitUrl(previousUrl); }
        await page.waitForTimeout(4000);
        // The builder's own Exit is disabled while importing; the browser's Back is not.
        await page.goBack();
        await page.waitForTimeout(2000);
        r.leftTo = page.url();
        await page.goto(`${APP}/admin/build`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        const change2 = page.getByText('Change', { exact: true });
        if (await change2.count()) await change2.first().click().catch(() => {});
      } else if (done) {
        await page.getByText('Change', { exact: true }).first().click({ timeout: 10000 });
      }
      await submitUrl(change.url);
      done = await waitReview(host);
      r.changes.push({ url: change.url, how: change.how, review: done, imported: Number((await page.evaluate(() => document.body.innerText)).match(/(\d+) listings? imported/)?.[1] ?? 0) });
      await shot(done ? `changed-${r.changes.length}` : `changed-${r.changes.length}-stuck`);
      previousUrl = change.url;
      if (!done) break;
    }
    if (done && process.env.UI_WALK) await uiWalk(page, r).catch(e => { r.ui = { ...(r.ui ?? {}), error: String(e.stack ?? e).slice(0, 800) }; });
    if (done && !process.env.UI_WALK) {
      // Client preview: record each control and what it opens.
      const preview = page.getByRole('button', { name: 'Preview My App' });
      if (await preview.count()) {
        await preview.first().click();
        await page.waitForTimeout(2500);
        await shot('preview');
        const modalText = async () => page.evaluate(() => { const d = [...document.querySelectorAll('[aria-modal="true"]')].at(-1) ?? document.body; return d.innerText; });
        r.preview = { home: (await modalText()).slice(0, 3000), controls: [] };
        const labels = await page.evaluate(() => { const d = [...document.querySelectorAll('[aria-modal="true"]')].at(-1) ?? document.body;
          return [...new Set([...d.querySelectorAll('[role="button"],a,button')].map(e => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ')).filter(l => l && l.length < 60 && l !== 'Back'))]; });
        for (const label of labels.slice(0, 16)) {
          const entry = { label };
          try {
            const target = page.locator('[aria-modal="true"]').last().getByText(label, { exact: true }).first();
            if (!(await target.count())) { entry.skipped = 'not found by text'; r.preview.controls.push(entry); continue; }
            await target.click({ timeout: 5000 });
            await page.waitForTimeout(1200);
            const text = await modalText();
            entry.opens = text.slice(0, 220).replace(/\s+/g, ' ');
            entry.textLength = text.length;
            entry.stillHome = text.slice(0, 600) === r.preview.home.slice(0, 600);
            const back = page.locator('[aria-modal="true"]').last().getByLabel('Back');
            if (!entry.stillHome && await back.count()) { await back.first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(800); }
            if (!(await page.locator('[aria-modal="true"]').count())) { await preview.first().click().catch(() => {}); await page.waitForTimeout(1500); entry.reopened = true; }
          } catch (e) { entry.error = String(e.message ?? e).slice(0, 160); }
          r.preview.controls.push(entry);
        }
      }
    }
  } catch (e) {
    r.error = String(e.stack ?? e).slice(0, 1200);
    await shot('error');
    r.reviewText = (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 4000);
  }
  await Promise.allSettled(pending);
  await context.close();
  // Listing images: real pixel sizes of the first photo of up to 12 imported listings.
  // Listing import: the connect job and any detail jobs (staging copies carry a suffix).
  const listingCalls = r.calls.filter(c => c.fn.startsWith('refresh-listings'));
  r.listingJobs = listingCalls.map(c => ({ status: c.status, mode: c.result?.body?.detailsPending !== undefined || c.result?.body?.attempted !== undefined ? 'jobs' : 'single',
    imported: c.result?.body?.imported, attempted: c.result?.body?.attempted, detailsPending: c.result?.body?.detailsPending, error: c.result?.body?.error }));
  const sync = [...listingCalls].reverse().find(c => Array.isArray(c.result?.body?.items))?.result?.body ?? listingCalls[0]?.result?.body;
  const items = Array.isArray(sync?.items) ? sync.items : [];
  r.listingImages = [];
  for (const item of items.slice(0, 12)) {
    const first = item.image || item.images?.[0];
    r.listingImages.push({ title: item.title, photos: item.images?.length ?? 0, first, size: first ? await imageSize(first) : null });
  }
  const build = r.calls.find(c => c.fn.startsWith('analyze-realtor-build'))?.result?.body;
  const inventory = [...(sync?.source?.inventoryUrls ?? []), ...(build?.listingDiscovery?.inventoryUrls ?? [])];
  r.source = await sourceView(browser, site, [...new Set(inventory)]);
  return r;
}

(async () => {
  // Level D campaign budget: planned before the first site, metered after each one (see ai-budget.cjs).
  const budget = require('./ai-budget.cjs');
  const campaign = process.env.CAMPAIGN_ID ?? `local-${Date.now()}`;
  const plan = budget.planCampaign({ level: 'D', sites: sites.length, justification: process.env.CAMPAIGN_JUSTIFICATION });
  fs.writeFileSync(path.join(out, 'budget-plan.json'), JSON.stringify(plan, null, 2));
  if (!plan.allowed) { console.error(`[ai-budget] campaign refused: ${plan.reason}`); process.exit(3); }
  const meter = budget.createCampaignMeter({ campaign, level: 'D' });
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  for (const site of sites) {
    if (!meter.beforeSite()) { fs.writeFileSync(path.join(out, `${site.id}.json`), JSON.stringify({ id: site.id, url: site.url, notRun: meter.stopped }, null, 2)); continue; }
    const started = Date.now();
    const startedAt = new Date().toISOString();
    const result = await run(browser, site).catch(e => ({ id: site.id, url: site.url, error: String(e.stack ?? e) }));
    result.wallMs = Date.now() - started;
    result.window = { startedAt, endedAt: new Date().toISOString() };
    result.aiUsage = meter.recordSite(site.id, (result.calls ?? []).map(call => call.result?.body?.aiUsage));
    fs.writeFileSync(path.join(out, `${site.id}.json`), JSON.stringify(result, null, 2));
    console.log(site.id, result.reviewMs ?? result.error?.slice(0, 80), `ai $${result.aiUsage.estimatedUsd}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'budget-spent.json'), JSON.stringify({ campaign, spentUsd: meter.spent, limitUsd: meter.limit, stopped: meter.stopped }, null, 2));
})();
