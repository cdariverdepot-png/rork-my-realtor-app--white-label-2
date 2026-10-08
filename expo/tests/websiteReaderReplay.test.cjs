// Website-reader replay corpus: every public response the profile/design reader requested from the
// 25 sites of the Oct 7 2026 diagnostic (live captures, provenance "public-response-capture").
// *.expected.json.gz holds what the reader produced BEFORE the CPU work (AI input + website design),
// captured from the then-current main; refactors must reproduce it exactly. The CPU ceiling guards the
// Edge Function allowance: production killed 11 of these builds with "CPU Time exceeded" (Elevate
// alone used 28.9 s of CPU); after compiling selectors once, indexing elements and skipping the style
// cascade for linked pages, the worst site uses well under a second.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { loadCapture, replayCapture } = require('../scripts/replay-build-capture.cjs');
const { currentBundle } = require('../scripts/build-pipeline-harness.cjs');

const dir = path.join(__dirname, 'fixtures/build-pipeline');
const ids = fs.readdirSync(dir).filter(f => f.endsWith('.capture.json.gz')).map(f => f.replace('.capture.json.gz', '')).sort();
const CPU_CEILING_MS = 1500;
const quiet = async work => {
  const log = console.log, error = console.error, warn = console.warn;
  console.log = (...a) => { if (!/^\[(build|listing-sync)\]/.test(String(a[0]))) log(...a); };
  console.error = () => {}; console.warn = () => {};
  try { return await work(); } finally { console.log = log; console.error = error; console.warn = warn; }
};

test('the website-reader corpus covers the 25 diagnostic sites', () => {
  assert.equal(ids.length, 25);
  for (const id of ids) assert.equal(loadCapture(path.join(dir, `${id}.capture.json.gz`)).provenance, 'public-response-capture');
});

// Repair stage 3, reviewed: from the runner's network these two sites answered with a CloudFront
// "Request blocked" 403 page, which the reader used to accept as the website (baselines recorded that).
// An error page is never the website: the build stops with the reason and the model is never called.
const REVIEWED_BLOCKED = new Set(['century21-barbara-patterson', 'remax-alexis-kemp-sagert']);

// Repair stage 7, reviewed: image URLs only. srcset was split on every comma, and image CDNs put commas
// inside URLs (Wix, Cloudflare image resizing), so baselines recorded broken URLs ("/offset-x50",
// "/width=960/https://…", an SVG placeholder as John Holden's portrait); Wix blurred placeholders are now
// full-size. Everything else the reader produces must be byte-identical.
const REVIEWED_IMAGE_URL_FIXES = new Set(['bridge-realty', 'houses-of-kansas-city', 'john-holden-homes', 'scott-a-jacobs-realtor']);
const imageField = path => /(?:url|Url|variants|width|height|selectedUrl|imageUrl)(?:\.|$)|\.variants\.\d+/.test(path);
function onlyImageDifferences(now, was, path = 'design', found = []) {
  if (JSON.stringify(now) === JSON.stringify(was)) return found;
  if (now && was && typeof now === 'object' && typeof was === 'object') {
    for (const key of new Set([...Object.keys(now), ...Object.keys(was)])) onlyImageDifferences(now[key], was[key], `${path}.${key}`, found);
  } else if (!imageField(path)) found.push(path);
  return found;
}

const bundle = currentBundle();
for (const id of ids) {
  test(`${id}: reader output is unchanged and stays within the CPU allowance`, () => quiet(async () => {
    const capture = loadCapture(path.join(dir, `${id}.capture.json.gz`));
    const expected = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, `${id}.expected.json.gz`))).toString('utf8'));
    await replayCapture(bundle, capture); // warm-up: JIT and module evaluation are not the import's work
    const run = await replayCapture(bundle, capture);
    if (REVIEWED_BLOCKED.has(id)) {
      assert.equal(run.status, 422);
      assert.equal(run.aiRequest, undefined, 'no profile is written from an error page');
      assert.ok(run.cpuMs < CPU_CEILING_MS);
      return;
    }
    if (REVIEWED_IMAGE_URL_FIXES.has(id)) {
      const json = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
      const lines = value => JSON.stringify(value).split('\\n').filter(line => !/^Images: /.test(line));
      assert.equal(run.status, expected.status);
      assert.deepEqual(lines(json(run.aiRequest)), lines(expected.ai), 'only the Images line of the profile input may change');
      assert.deepEqual(onlyImageDifferences(json(run.design), expected.design), [], 'only image URLs/sizes may change');
      for (const url of [run.design.portraitImageUrl, run.design.heroImageUrl, run.design.logoUrl].filter(Boolean)) {
        assert.doesNotMatch(url, /%3Csvg|\/(?:width|quality|offset-[xy])\d*=|blur_\d|\/fill\/w_\d+$/, `well-formed full-size image: ${url}`);
      }
      assert.ok(run.cpuMs < CPU_CEILING_MS);
      return;
    }
    const json = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    assert.equal(run.status, expected.status);
    assert.deepEqual(json(run.aiRequest), expected.ai, 'the profile model must receive exactly the same source text');
    assert.deepEqual(json(run.design), expected.design, 'the website design must be unchanged');
    assert.ok(run.cpuMs < CPU_CEILING_MS, `${id} used ${run.cpuMs} ms CPU (ceiling ${CPU_CEILING_MS} ms)`);
  }));
}
