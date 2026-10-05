import { discoverListings, describeListingArchitecture, collectInventoryLinks, extractListingsFromPage, enrichPublicProperty, type DiscoveredListing, type ListingDiscoveryMeta, type FetchHtml, type SelectInventoryLinks } from "../analyze-realtor-build/listingDiscovery.ts";
import { applyObservation, observeListing, type SyncListing } from "./sync.ts";
import { normalizePublicPage, selectInventoryLinks } from "./normalizePage.ts";

export type ListingSource = {
  id: string; url: string; submittedUrl: string; kind: string; inventoryUrls: string[];
  connectedAt: number; lastCheckedAt?: number; lastCompleteSyncAt?: number; nextSyncAt: number;
  state: "connected" | "unavailable"; error?: string; failures?: number; listingCount: number;
};
export type SourceInventory = { source: ListingSource; listings: DiscoveredListing[]; complete: boolean; meta: ListingDiscoveryMeta };
const TWO_HOURS = 7_200_000;
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizedUrl = (value: string) => { const url = new URL(value); url.hash = ""; return url.toString(); };
const hash = (value: string) => { let n = 2166136261; for (const ch of value) n = Math.imul(n ^ ch.charCodeAt(0), 16777619); return (n >>> 0).toString(36); };

export function detectSourceKind(raw: string) {
  const u = new URL(raw);
  if (/(?:^|\.)flexmls\.com$/i.test(u.hostname)) return "flexmls";
  if (/(?:^|\.)zillow\.com$/i.test(u.hostname)) return "zillow";
  if (/(?:^|\.)realtor\.com$/i.test(u.hostname)) return "realtor.com";
  if (/idx|mls/i.test(u.hostname + u.pathname)) return "public-inventory";
  return "agent-website";
}

export function isPropertyUrl(raw: string) {
  const u = new URL(raw);
  return (/\/(?:homedetails|realestateandhomes-detail|property|properties|listing|listings|homes)\/[^/]+\/?$/i.test(u.pathname) ||
    [...u.searchParams.keys()].some(key => /^(?:listingid|propertyid|mlsnumber|mlsid)$/i.test(key))) &&
    !/\/(?:office|agent)_listing_categories\/[^/]+\/listings\/?$/i.test(u.pathname);
}

/** Connect the inventory behind an observed public URL, rather than bookmarking one home. */
export async function readSource(raw: string, fetchHtml: FetchHtml, existing?: ListingSource,
  selectLinks: SelectInventoryLinks = selectInventoryLinks, renderPage?: FetchHtml): Promise<SourceInventory> {
  const submittedUrl = normalizedUrl(raw);
  const pages = new Map<string, Promise<Awaited<ReturnType<FetchHtml>>>>();
  const deadline = Date.now() + 45_000;
  const cachedFetch: FetchHtml = (uri, options) => { const cacheKey = `${uri}|${options?.fragment ?? false}`;
    if (!pages.has(cacheKey)) {
      if (pages.size >= 192 || Date.now() > deadline) throw new Error("We could only check part of that source. We'll retry the rest later.");
      pages.set(cacheKey, fetchHtml(uri, options));
    }
    return pages.get(cacheKey)!;
  };
  let uri = existing?.url ?? submittedUrl;
  const firstPage = await cachedFetch(uri);
  const firstUrl = firstPage.finalUrl;
  const firstArchitecture = describeListingArchitecture(firstPage.html, firstPage.finalUrl);
  const firstProperties = extractListingsFromPage(firstPage.html, firstPage.finalUrl, firstArchitecture.attempts);
  if (firstProperties.length) firstArchitecture.resolution = "known-pattern";
  const singleProperty = firstProperties.length === 1 && firstProperties[0].sourceUrl === firstPage.finalUrl.toString() &&
    [...firstPage.html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].some(m => key(m[1].replace(/<[^>]+>/g, " ")) === key(firstProperties[0].title)) &&
    /["']@type["']\s*:\s*["'](?:RealEstateListing|SingleFamilyResidence|Apartment|House)["']/i.test(firstPage.html);
  let directProperty: DiscoveredListing[] | undefined;
  if (isPropertyUrl(firstPage.finalUrl.toString()) || singleProperty) {
    const page = firstPage;
    const original = extractListingsFromPage(page.html, page.finalUrl);
    const observed = collectInventoryLinks(page.html, page.finalUrl, 12);
    for (const match of page.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = match[2].replace(/<[^>]+>/g, " ");
      if (!/listing agent|agent profile|view profile|my listings|our listings/i.test(label)) continue;
      try { const url = new URL(match[1].replace(/&amp;/g, "&"), page.finalUrl); if (url.protocol === "https:") observed.push({ url: url.toString(), label, score: 100 }); } catch { /* invalid link */ }
    }
    const links = observed.filter(link => !isPropertyUrl(link.url) &&
      !/all\s+(?:homes|listings)|property\s+search|search\s+homes|buyer'?s? agent|sponsored/i.test(link.label) &&
      /\bmy\b|\bour\b|listing agent|profile|\/(?:agents?|realtors?|profile)\/|(?:office|agent)_listing_categories|[?&](?:agent|office)(?:id)?=/i.test(link.label + " " + link.url));
    let associated: string | undefined;
    for (const link of links.slice(0, 3)) {
      const candidate = await discoverListings([link.url], cachedFetch, { maxPages: 12, maxListings: 100, maxDetailPages: 0, selectLinks, renderPage });
      if (candidate.listings.some(item => normalizedUrl(item.sourceUrl) === submittedUrl ||
        original.some(home => key(home.title) === key(item.title) && key(home.neighborhood) === key(item.neighborhood)))) {
        associated = link.url; break;
      }
    }
    if (associated) uri = associated;
    else directProperty = await Promise.all(original.map(async item=>{try{return await enrichPublicProperty(item,cachedFetch,page);}catch{return item;}}));
  }
  const discovery = directProperty?.length ? { listings: directProperty, meta: { visited: [firstUrl.toString()], hops: 0, found: directProperty.length, maxDepth: 0, inventoryUrls: [], outcome: "found", coverage: "showcase", compatibility: { version: 1, pages: [firstArchitecture] } } as ListingDiscoveryMeta } : await discoverListings([uri], cachedFetch, { maxDepth: 5, maxPages: 160, maxListings: 100, maxDetailPages: 100, enrichAll: true, selectLinks, normalizePage: normalizePublicPage, renderPage });
  // Empty is trustworthy only when the known inventory explicitly reports zero properties.
  let explicitEmpty = false;
  if (existing && !discovery.listings.length && !discovery.meta.failed?.length) {
    for (const inventoryUrl of existing.inventoryUrls) {
      try {
        const page = await cachedFetch(inventoryUrl);
        if (/data-search-results-search-count=["']0["']|\b(?:no active listings|no properties found|no listings found|0 properties|0 listings)\b/i.test(page.html)) explicitEmpty = true;
      } catch { /* disappearance or blocked pages cannot establish sold status */ }
    }
  }
  if (!discovery.listings.length && !explicitEmpty && discovery.meta.issues?.some(issue => issue.code === "requires-rendering")) throw new Error("This site loads its listings dynamically. We could not read the property data yet. Try its public listings page or an MLS export; your existing listings are preserved.");
  if (!discovery.listings.length && !explicitEmpty) throw new Error("We couldn’t find your listings on that page. Try pasting the page where all of your active listings are shown. The page must open without signing in.");
  const now = Date.now();
  const source: ListingSource = { ...existing, id: existing?.id ?? `source-${hash(uri)}`, url: uri, submittedUrl: existing?.submittedUrl ?? submittedUrl,
    kind: detectSourceKind(uri), inventoryUrls: [...new Set([...discovery.meta.inventoryUrls ?? [], ...existing?.inventoryUrls ?? []])].filter(u => !isPropertyUrl(u) && !(new URL(u).hostname === "www.idxhome.com" && new URL(u).pathname.startsWith("/api/kestrel/"))),
    connectedAt: existing?.connectedAt ?? now, lastCheckedAt: now, nextSyncAt: now + TWO_HOURS,
    state: "connected", error: undefined, failures: 0, listingCount: discovery.listings.length };
  const inventoryComplete = discovery.meta.inventoryStatus === "inventory_complete" || (!discovery.meta.inventoryStatus && discovery.meta.outcome === "found");
  const complete = explicitEmpty || discovery.meta.coverage === "collection" && inventoryComplete && discovery.listings.length < 100;
  if (complete) source.lastCompleteSyncAt = now;
  return { source, listings: discovery.listings, complete, meta: discovery.meta };
}

/** Match full source URLs, then exposed MLS ids; no address-only cross-source merging. */
export function reconcileInventory(current: SyncListing[], inventory: SourceInventory, now: number): SyncListing[] {
  const next = [...current];
  const seen = new Set<string>();
  const sharedUrls = new Set(inventory.listings.filter((home, i, all) => all.some((other, j) => j !== i && other.sourceUrl === home.sourceUrl)).map(home => home.sourceUrl));
  for (const incoming of inventory.listings) {
    const index = next.findIndex(item => item.sourceUrl === incoming.sourceUrl && ((!sharedUrls.has(incoming.sourceUrl) && next.filter(p => p.sourceUrl === incoming.sourceUrl).length === 1) || item.title === incoming.title) ||
      item.sourceId === inventory.source.id && !!incoming.listingNumber && item.listingNumber === incoming.listingNumber);
    const prior: SyncListing = index >= 0 ? next[index] : { id: `listing-${hash(incoming.sourceUrl + "|" + incoming.title)}`, title: incoming.title,
      neighborhood: "", price: "", beds: 0, baths: 0, sqft: "", images: [], image: "", tag: "", elizaTake: "", hidden: false, sourceUrl: incoming.sourceUrl };
    let merged = applyObservation(prior, { sourceUrl: incoming.sourceUrl, checkedAt: now, property: incoming, status: incoming.status });
    merged = { ...merged, title: incoming.title, sourceUrl: incoming.sourceUrl, sourceId: inventory.source.id,
      listingNumber: incoming.listingNumber || prior.listingNumber, propertyType: incoming.propertyType || prior.propertyType,
      sourceArchived: false, sourceMissingCount: 0, sourceMissingAt: undefined };
    const changed = ["title", "price", "status", "description", "image", "images", "beds", "baths", "sqft", "neighborhood", "sourceArchived"]
      .some(field => JSON.stringify(prior[field]) !== JSON.stringify(merged[field]));
    if (changed || index < 0) merged.updatedAt = now;
    seen.add(merged.id);
    if (index >= 0) next[index] = merged; else next.push(merged);
  }
  if (inventory.complete) for (let i = 0; i < next.length; i++) {
    const item = next[i];
    if (item.sourceId !== inventory.source.id || seen.has(item.id)) continue;
    // Require two complete inventories, at least two hours apart, before archiving.
    if (typeof item.sourceMissingAt === "number" && now - item.sourceMissingAt < TWO_HOURS) continue;
    const misses = Number(item.sourceMissingCount ?? 0) + 1;
    next[i] = { ...item, sourceMissingCount: misses, sourceMissingAt: now, sourceArchived: misses >= 2,
      ...(misses >= 2 ? { updatedAt: now } : {}) };
  }
  return next;
}

/** Verify disappeared homes individually when they still expose explicit status. */
export async function verifyMissing(items: SyncListing[], inventory: SourceInventory, fetchHtml: FetchHtml): Promise<SyncListing[]> {
  const found = new Set(inventory.listings.map(item => item.sourceUrl));
  const next = [...items];
  const deadline = Date.now() + 20_000;
  for (const item of items.filter(item => item.sourceId === inventory.source.id && item.sourceUrl && !found.has(item.sourceUrl)).slice(0, 4)) {
    if (Date.now() > deadline) break;
    try {
      const page = await fetchHtml(item.sourceUrl!);
      const observation = observeListing(item, page.html, page.finalUrl, Date.now());
      const index = next.findIndex(p => p.id === item.id);
      if (index >= 0) next[index] = applyObservation(next[index], observation);
    } catch { /* confirmed inventory absence is separate from an unreadable detail page */ }
  }
  return next;
}
