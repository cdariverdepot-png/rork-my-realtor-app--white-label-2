// Diagnostic probe (no AI, no writes to any site): how a page behaves for a plain request, for the deployed
// renderer service (with a long client timeout and timings), and for a local headless browser with a
// timeline. Usage: node render-probe.cjs <out.json> <url> [<url>...]
const fs = require('node:fs');
const [out, ...urls] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const title = html => (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim().slice(0, 80);
const summary = html => ({ bytes: String(html).length, title: title(html), prices: (String(html).match(/\$\s?\d{1,3}(?:,\d{3})+/g) ?? []).length,
  detailLinks: (String(html).match(/listing_detail\/\d{10,}/g) ?? []).length,
  listingIds: [...new Set(String(html).match(/listings\/(\d{20,})/g) ?? [])].map(s => s.slice(-8)).slice(0, 30) });

async function plain(url, extra = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'MyRealtorAppBuilder/1.0', Accept: 'text/html', ...extra }, signal: AbortSignal.timeout(20000) });
    const html = await res.text();
    if (process.env.PROBE_SAVE_DIR && !extra['X-Requested-With']) {
      fs.mkdirSync(process.env.PROBE_SAVE_DIR, { recursive: true });
      fs.writeFileSync(require('node:path').join(process.env.PROBE_SAVE_DIR, 'plain-' + url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 120) + '.txt'), html.slice(0, 200000));
    }
    const frames = [...html.matchAll(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1].slice(0, 200));
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1].slice(0, 160)).filter(u => !/wp-includes|jquery|wp-content\/themes/.test(u));
    const links = [...new Set([...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]).filter(u => !/wp-content|wordpress|studiopress|fonts/.test(u)))].slice(0, 40);
    return { status: res.status, ms: Date.now() - started, finalUrl: res.url, ...summary(html), frames, scripts, links };
  } catch (error) { return { error: String(error.message), ms: Date.now() - started }; }
}

async function service(url) {
  const started = Date.now();
  try {
    const res = await fetch(process.env.LISTING_RENDER_URL, { method: 'POST', headers: { authorization: 'Bearer ' + process.env.LISTING_RENDER_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ url }), signal: AbortSignal.timeout(90000) });
    const body = await res.json().catch(() => ({}));
    if (body.html && process.env.PROBE_SAVE_DIR) {
      const name = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 120) + '.html.gz';
      fs.mkdirSync(process.env.PROBE_SAVE_DIR, { recursive: true });
      fs.writeFileSync(require('node:path').join(process.env.PROBE_SAVE_DIR, name), require('node:zlib').gzipSync(body.html));
    }
    return { status: res.status, ms: Date.now() - started, error: body.error, finalUrl: body.finalUrl, ...(body.html ? summary(body.html) : {}),
      network: (body.network ?? []).map(n => ({ url: n.url.slice(0, 160), ...summary(n.html) })) };
  } catch (error) { return { error: String(error.message), ms: Date.now() - started }; }
}

async function local(url) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: UA });
  const page = await context.newPage();
  const timeline = [];
  const responses = [];
  page.on('response', r => { if (responses.length < 60) responses.push({ url: r.url().slice(0, 160), status: r.status(), type: (r.headers()['content-type'] || '').slice(0, 40) }); });
  const started = Date.now();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    timeline.push({ at: Date.now() - started, event: 'domcontentloaded', url: page.url().slice(0, 160) });
  } catch (error) { timeline.push({ at: Date.now() - started, event: 'goto-error', error: String(error.message).slice(0, 200) }); }
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    let html = '';
    try { html = await page.content(); } catch { timeline.push({ at: Date.now() - started, event: 'navigating' }); continue; }
    const s = summary(html);
    const last = timeline[timeline.length - 1];
    if (!last || last.title !== s.title || last.bytes !== s.bytes) timeline.push({ at: Date.now() - started, url: page.url().slice(0, 160), ...s });
    if (s.detailLinks > 0 && i > 3) break;
  }
  const cookies = (await context.cookies()).map(c => ({ name: c.name, domain: c.domain }));
  await browser.close();
  return { timeline, responses, cookies };
}

(async () => {
  const result = { at: new Date().toISOString(), runner: process.env.RUNNER_NAME ?? null, sites: [] };
  for (const url of urls) {
    const row = { url, plain: await plain(url), plainFragment: await plain(url, { 'X-Requested-With': 'XMLHttpRequest' }) };
    if (process.env.LISTING_RENDER_URL) { row.service = await service(url); row.serviceAgain = await service(url); }
    try { row.local = await local(url); } catch (error) { row.local = { error: String(error.message).slice(0, 300) }; }
    result.sites.push(row);
    console.log(JSON.stringify({ url, plain: row.plain, service: row.service && { status: row.service.status, ms: row.service.ms, title: row.service.title, error: row.service.error },
      serviceAgain: row.serviceAgain && { status: row.serviceAgain.status, ms: row.serviceAgain.ms, title: row.serviceAgain.title }, localLast: row.local.timeline?.slice(-1)[0] }));
  }
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
})();
