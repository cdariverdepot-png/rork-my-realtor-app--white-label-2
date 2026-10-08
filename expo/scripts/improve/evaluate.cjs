// DISCOVER (offline, Level A): replay every recorded site through the current engine and the production
// save-boundary steps, then check the imported records against structural quality rules. Each finding
// says what is wrong, where, the evidence in the recorded responses, and what kind of problem it is:
//   code_defect                 the recorded source shows the information, and the engine lost or misread it
//   blocked_source              the site refused, challenged or gated the reader
//   temporary_outage            a timeout or server error in the recording
//   missing_source_information  the recorded source does not publish it
//   harness_failure             the recording is incomplete for what the engine now requests
//   needs_review                the evidence cannot decide (a person must look)
// Recorded live responses are observations, not verified truth. Findings never edit expected output.
//
//   node scripts/improve/evaluate.cjs [--functions DIR] [--only id,id] [--out FILE]
const fs = require('node:fs');
const path = require('node:path');
const { loadPipeline, replayCapture, readCapture, requestKey, repoRoot } = require('./engine.cjs');

/** Recorded corpus: known regression sites (diagnostics/discovery) and unseen evaluation sites. */
function corpus({ only, captures } = {}) {
  const sets = captures ? [{ set: 'verify', dir: captures, sites: path.join(repoRoot, 'diagnostics/evaluation/sites.json') }] : [
    { set: 'regression', dir: path.join(repoRoot, 'diagnostics/discovery'), sites: path.join(repoRoot, 'diagnostics/sites-25.json') },
    { set: 'unseen', dir: path.join(repoRoot, 'diagnostics/evaluation/captures'), sites: path.join(repoRoot, 'diagnostics/evaluation/sites.json') },
  ];
  const entries = [];
  for (const { set, dir, sites } of sets) {
    if (!fs.existsSync(dir)) continue;
    const meta = fs.existsSync(sites) ? new Map(JSON.parse(fs.readFileSync(sites, 'utf8')).map(s => [s.id, s])) : new Map();
    for (const file of fs.readdirSync(dir).filter(f => /\.json(\.gz)?$/.test(f)).sort()) {
      const id = file.replace(/\.json(\.gz)?$/, '');
      if (only && !only.includes(id)) continue;
      entries.push({ id, set, file: path.join(dir, file), category: meta.get(id)?.category ?? 'unknown', holdout: meta.get(id)?.holdout === true });
    }
  }
  return entries;
}

const stripTags = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
const key = text => String(text ?? '').toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]/g, '');
const CARD_TEXT = /\$\s?\d|\b\d+\s*(?:beds?|bd|baths?|ba)\b|view details|add to favorites|&(?:nbsp|#\d+);/i;
const PRICE_ONLY = /^\s*\$?\s?[\d,.]+\s*(?:[kKmM]|million)?\s*$/;
const GENERIC = /^(?:listing|property|home|details?|view( property| listing)?|untitled|for sale|new listing|featured( listing)?)$/i;
const STATE = /\b(?:A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/;

/** A title that names a property: a street address, or a place name with locality (city/state/zip). */
function namesProperty(title) {
  const t = String(title ?? '').trim();
  if (!t || PRICE_ONLY.test(t) || GENERIC.test(t) || CARD_TEXT.test(t)) return false;
  return /\d+\s+\S+/.test(t) && /[a-z]{2,}/i.test(t) || /,/.test(t) && (STATE.test(t) || /\b\d{5}\b/.test(t));
}

/** What a captured detail page itself says the property is (structured address or main heading). */
function detailPageName(html) {
  if (!html) return null;
  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const street = block[1].match(/"streetAddress"\s*:\s*"([^"]{3,120})"/)?.[1];
    if (street) {
      const locality = block[1].match(/"addressLocality"\s*:\s*"([^"]{2,60})"/)?.[1];
      const region = block[1].match(/"addressRegion"\s*:\s*"([^"]{2,30})"/)?.[1];
      return [street, locality, region].filter(Boolean).join(', ');
    }
  }
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const text = heading ? stripTags(heading) : '';
  return text && namesProperty(text) ? text : null;
}

/** Evidence that a captured detail page publishes a description / a gallery. */
function detailPublishes(html) {
  if (!html) return { description: false, photos: 0 };
  const ldDescription = [...html.matchAll(/"description"\s*:\s*"((?:[^"\\]|\\.){120,})"/g)].length > 0;
  const longParagraph = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].some(m => stripTags(m[1]).length >= 300);
  const photos = new Set([...html.matchAll(/(?:src|data-src|data-lazy|href|content)=["'](https?:\/\/[^"']+\.(?:jpe?g|webp|png)(?:\?[^"']*)?)["']/gi)]
    .map(m => m[1]).filter(url => !/logo|icon|avatar|sprite|placeholder|agent|headshot|favicon/i.test(url))).size;
  return { description: ldDescription || longParagraph, photos };
}

/** The structural architecture of a site: the strategies that actually extracted, else the top candidate. */
function architectureOf(result) {
  const pages = result.meta?.compatibility?.pages ?? [];
  const won = [...new Set(pages.flatMap(p => (p.attempts ?? []).filter(a => a.outcome === 'extracted').map(a => a.id)))].sort();
  if (won.length) return won.join('+');
  const candidate = result.meta?.candidates?.[0]?.family ?? result.meta?.candidates?.[0]?.id;
  return candidate ? `candidate:${candidate}` : 'unrecognized';
}

function findingsFor(entry, capture, replay) {
  const { result, listings, missing } = replay;
  const pages = new Map(capture.pages.map(page => [page.key, page]));
  const pageFor = url => pages.get(requestKey(url, undefined, false)) ?? pages.get(requestKey(url.replace(/\/$/, ''), undefined, false)) ?? pages.get(requestKey(url + '/', undefined, false));
  const architecture = architectureOf(result);
  const out = [];
  const add = (code, defectKind, severity, items, detail) => out.push({ site: entry.id, set: entry.set, category: entry.category, architecture,
    code, defectKind, severity, count: items.length, examples: items.slice(0, 5), detail });

  if (missing.length) add('CAPTURE_INCOMPLETE', 'harness_failure', 1, missing.map(url => ({ url })), 'The engine requested pages that were not recorded; recapture this site (Level B) before judging it.');
  const obstacles = result.meta?.obstacles ?? [];
  if (result.error) add('ENGINE_ERROR', 'code_defect', 5, [{ error: result.error }], 'Discovery threw instead of returning a result.');

  // Titles: every imported record must be named by its property, never its price or card text.
  const unnamed = listings.filter(item => !namesProperty(item.title));
  const fixable = [], unpublished = [];
  for (const item of unnamed) {
    const page = pageFor(item.sourceUrl);
    const name = page && !page.error ? detailPageName(page.html) : null;
    (name ? fixable : unpublished).push({ sourceUrl: item.sourceUrl, title: item.title, detailPageNames: name, detailPage: page ? (page.error ? `error: ${page.error}` : 'recorded') : 'not requested' });
  }
  if (fixable.length) add('TITLE_NOT_PROPERTY', 'code_defect', 3, fixable, 'The property detail page names the property, but the imported title is a price, card text or label.');
  const unpublishedTimeouts = unpublished.filter(u => /timeout|aborted|5\d\d/i.test(u.detailPage));
  if (unpublishedTimeouts.length) add('TITLE_NOT_PROPERTY', 'temporary_outage', 1, unpublishedTimeouts, 'The detail page could not be read in this recording, so the property name is unknown.');
  const unpublishedOther = unpublished.filter(u => !unpublishedTimeouts.includes(u));
  if (unpublishedOther.length) add('TITLE_NOT_PROPERTY', 'needs_review', 1, unpublishedOther, 'Neither the card nor a recorded detail page names the property.');

  // One record per property: the same named property with the same published content twice.
  const groups = new Map();
  for (const item of listings.filter(item => namesProperty(item.title))) {
    const id = key(item.title) + '|' + key(item.neighborhood ?? '');
    groups.set(id, [...groups.get(id) ?? [], item]);
  }
  // Same address alone is not enough: one parcel can carry two listings (house and land, a split lot) with
  // different prices and remarks. Same address, same price and the same remarks or lead photo is one property.
  const samePrice = (a, b) => key(a.price) === key(b.price);
  const duplicates = [...groups.values()].filter(group => group.length > 1 && group.some((a, i) => group.some((b, j) => j > i && samePrice(a, b) &&
    ((a.description && a.description === b.description) || (a.images?.[0] && a.images[0] === b.images?.[0])))));
  if (duplicates.length) add('DUPLICATE_PROPERTY', 'code_defect', 2, duplicates.map(group => ({ title: group[0].title, sourceUrls: group.map(i => i.sourceUrl) })),
    'The same property (same address and the same description or lead photo) is imported more than once under different URLs.');

  // Details: a recorded detail page that publishes a description or gallery the record does not have.
  const thin = [];
  for (const item of listings) {
    const page = pageFor(item.sourceUrl);
    if (!page || page.error) continue;
    const published = detailPublishes(page.html);
    const lacksDescription = !item.description && published.description;
    const lacksPhotos = (item.images?.length ?? 0) < 2 && published.photos >= 3;
    if (lacksDescription || lacksPhotos) thin.push({ sourceUrl: item.sourceUrl, title: item.title, description: (item.description ?? '').length, photos: item.images?.length ?? 0, pagePhotos: published.photos, pageDescription: published.description });
  }
  if (thin.length) add('DETAIL_INCOMPLETE', thin.length >= 2 ? 'code_defect' : 'needs_review', 2, thin, 'The recorded detail page publishes a description or photos that the imported record lacks.');

  // Attribution: records shown with an office but not labelled own or featured stay uncertain.
  const unverified = listings.filter(item => item.listingOffice && !item.ownership);
  if (unverified.length) add('ATTRIBUTION_UNVERIFIED', 'needs_review', 1, unverified.map(i => ({ sourceUrl: i.sourceUrl, listingOffice: i.listingOffice })), 'Listing office is known but not matched to the site identity.');

  // Nothing imported: say why.
  if (!listings.length && !result.error) {
    const resolutions = new Set((result.meta?.compatibility?.pages ?? []).map(p => p.resolution));
    const issues = new Set((result.meta?.issues ?? []).map(issue => issue.code));
    const seedFailures = (result.meta?.failed ?? []).map(url => ({ url, error: pageFor(url)?.error ?? '' }));
    const refused = seedFailures.filter(f => /returned 40[1359]|returned 451/.test(f.error));
    const outage = seedFailures.filter(f => /timeout|aborted|returned 5\d\d|returned 429/.test(f.error));
    const raw = result.listings ?? [];
    if (obstacles.length || refused.length) add('BLOCKED_SOURCE', 'blocked_source', 0, [...obstacles.map(o => ({ obstacle: o.code ?? o, url: o.url })), ...refused], 'The site gated or refused the reader.');
    else if (outage.length) add('SOURCE_UNAVAILABLE', 'temporary_outage', 0, outage, 'The site did not answer in this recording.');
    else if (raw.length) {
      const reasons = {};
      for (const item of raw) { const why = item.status === 'sold' || item.status === 'off_market' ? `status:${item.status}` : item.sourceStatus === 'unknown' ? 'sourceStatus:unknown' : 'normalizer'; reasons[why] = (reasons[why] ?? 0) + 1; }
      add('ALL_FILTERED', 'needs_review', 2, [{ discovered: raw.length, reasons, sample: raw.slice(0, 3).map(i => ({ title: i.title, sourceUrl: i.sourceUrl, status: i.status, sourceStatus: i.sourceStatus })) }],
        'Listings were discovered but none survived the save-boundary status and normalizer rules.');
    }
    else if (resolutions.has('requires-rendering') || issues.has('requires-rendering')) add('REQUIRES_RENDERING', 'needs_review', 1, [{ resolutions: [...resolutions] }], 'The inventory is rendered in the browser; offline replay without a recorded rendering cannot judge it.');
    else if (resolutions.has('needs-strategy')) add('NEEDS_STRATEGY', 'code_defect', 3, [{ resolutions: [...resolutions], visited: (result.meta?.visited ?? []).slice(0, 5) }], 'Pages were read but no extraction strategy recognized their listings.');
    else if (resolutions.has('excluded-market')) add('MARKET_ONLY', 'missing_source_information', 0, [{ excluded: result.meta?.scope?.excludedOtherOffice ?? 0 }], 'Only other brokerages\' listings were found; nothing is imported by design.');
    else add('NO_LISTINGS', 'needs_review', 1, [{ resolutions: [...resolutions], visited: (result.meta?.visited ?? []).slice(0, 5) }], 'Nothing was imported and no obstacle explains it.');
  }
  return out;
}

/** Identity of each imported record, for before/after comparison by the acceptance gate. */
const identities = listings => listings.map(item => ({ sourceUrl: item.sourceUrl, title: item.title, ownership: item.ownership ?? null,
  listingOffice: item.listingOffice ?? null, description: (item.description ?? '').length, photos: item.images?.length ?? 0, price: item.price ?? '' }));

async function evaluate({ functionsRoot, only, captures } = {}) {
  const pipeline = await loadPipeline(functionsRoot);
  const sites = [];
  for (const entry of corpus({ only, captures })) {
    const capture = readCapture(entry.file);
    const replay = await replayCapture(pipeline, capture);
    sites.push({ id: entry.id, set: entry.set, category: entry.category, holdout: entry.holdout, architecture: architectureOf(replay.result),
      capturedAt: capture.capturedAt, cpuMs: replay.cpuMs, imported: replay.listings.length, missing: replay.missing.length,
      listings: identities(replay.listings), findings: findingsFor(entry, capture, replay) });
  }
  return { evaluatedAt: new Date().toISOString(), engine: functionsRoot ?? 'working tree', sites };
}

module.exports = { evaluate, corpus, namesProperty, detailPageName, detailPublishes, architectureOf, findingsFor };

if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  const arg = name => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined;
  const report = await evaluate({ functionsRoot: arg('functions') && path.resolve(arg('functions')), only: arg('only')?.split(','), captures: arg('captures') && path.resolve(arg('captures')) });
  const out = arg('out');
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  for (const site of report.sites) {
    const codes = site.findings.map(f => `${f.code}:${f.defectKind}(${f.count})`).join(' ');
    console.log(`${site.id.padEnd(34)} ${site.set.padEnd(10)} ${String(site.imported).padStart(4)} listings  ${String(site.cpuMs).padStart(5)} ms  ${codes}`);
  }
})();
