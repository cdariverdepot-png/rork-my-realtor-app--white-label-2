/**
 * Multi-hop listing inventory discovery for the realtor app builder.
 *
 * From a landing page, score CTA links (View properties, Listings, IDX, FlexMLS…),
 * Follow ranked links across domains, embeds and public inventory fragments.
 * Extract only evidenced properties; never invent inventory from navigation pages.
 */

export type DiscoveredListing = {
  title: string;
  description: string;
  price: string;
  beds: number;
  baths: number;
  sqft: string;
  neighborhood: string;
  image: string;
  images: string[];
  sourceUrl: string;
  status?: "active" | "pending" | "contingent" | "sold" | "off_market";
  /** Provider status before product mapping. Unknown is never coerced to active. */
  sourceStatus?: "active" | "coming_soon" | "pending" | "contingent" | "under_contract" | "backup" | "sold" | "closed" | "off_market" | "expired" | "withdrawn" | "cancelled" | "private" | "unknown" | "unspecified";
  listingNumber?: string;
  propertyType?: string;
  importKey?: string;
  /** True only when a property detail/gallery, rather than a collection card, was read. */
  detailsComplete?: boolean;
  /** Listing brokerage/agent attribution published with the property (IDX attribution). */
  listingOffice?: string;
  /**
   * "own": attributed to the site's own agent/office. "featured": shown on the agent's site but
   * attributed to another office (kept, and labelled so it is never presented as the agent's own).
   * Absent: the source published no attribution.
   */
  ownership?: "own" | "featured";
  facts?: Record<string, string>;
};

/**
 * Per-document memo. One fetched page is examined by several readers (architecture, interface
 * detection, public fragments, navigation, extraction, per-property status) and several of them
 * used to re-scan the same HTML from scratch, once per caller or once per listing on the page.
 * Each pure derivation of (html, base URL) is now computed once. Bounded to the most recent
 * documents so a 160-page crawl never retains every page; results are returned as copies so no
 * caller can alter what another caller sees.
 */
const DOCUMENT_MEMO_LIMIT = 8;
const documentMemos = new Map<string, Map<string, unknown>>();
function documentOnce<T>(html: string, key: string, compute: () => T): T {
  let memo = documentMemos.get(html);
  if (memo) { documentMemos.delete(html); documentMemos.set(html, memo); }
  else {
    memo = new Map();
    documentMemos.set(html, memo);
    if (documentMemos.size > DOCUMENT_MEMO_LIMIT) documentMemos.delete(documentMemos.keys().next().value as string);
  }
  if (memo.has(key)) return memo.get(key) as T;
  const value = compute();
  memo.set(key, value);
  return value;
}
/** Strategy and adapter applicability is a property of the document; it is decided once per id. */
function documentMatches(id: string, matches: (html: string, base: URL) => boolean, html: string, base: URL): boolean {
  return documentOnce(html, `matches:${id}|${base.href}`, () => matches(html, base));
}

export type ListingDiscoveryMeta = {
  /** Versioned architectural evidence, including failed/empty attempts, never widget credentials. */
  compatibility?: { version: 1; pages: CompatibilityPage[] };
  visited: string[];
  hops: number;
  found: number;
  /** Highest hop depth reached while looking for inventory. */
  maxDepth: number;
  failed?: string[];
  failureDetails?: {url:string;reason:string}[];
  inventoryUrls?: string[];
  outcome?: "found" | "unreadable" | "not-found" | "partial";
  expectedCount?: number;
  interfaces?: string[];
  coverage?: "collection" | "showcase" | "unknown";
  issues?: { code: "requires-rendering" | "limited-showcase" | "missing-photos"; url: string; interface?: string }[];
  /** Inventory completeness, independent of optional detail enrichment. */
  inventoryStatus?: "inventory_complete" | "inventory_partial" | "inventory_empty" | "inventory_blocked";
  /** Why inventory is complete, or collection_boundary_unknown when it is not proven. */
  completenessEvidence?: string[];
  collectionBoundary?: { mechanism?: string; terminal?: string; continuationRequests?: number; continuationAvailable?: boolean };
  /** Source collection versus the listings the product actually keeps. */
  accounting?: {
    sourceTotal?: number;
    sourceSeen: number;
    sourceClassified: number;
    sourceCollectionExhausted: boolean;
    excludedTotal: number;
    exclusions: { reason: string; count: number }[];
    eligibleTotal: number;
    importedEligible: number;
    eligibleImportComplete: boolean;
  };
  enrichment?: { status: "enrichment_complete" | "enrichment_partial" | "enrichment_unavailable" | "enrichment_not_requested"; scheduled: number; attempted: number; enriched: number; failed: number;
    /** Listings (source URLs) whose details were left for follow-up detail jobs (detailBudget). */
    deferred?: string[] };
  /**
   * Ownership scope: the person page the import was limited to, collection pages recognized as market
   * feeds (only own-office listings kept), how many other offices' listings were excluded, and how many
   * navigation links were outside the scope.
   */
  scope?: { person?: string; marketPages: string[]; excludedOtherOffice: number; outOfScopeLinks: number };
  /** What the site published about itself; decides whether a listing attribution is the site's own. */
  identity?: SiteIdentity;
  /** Machine-readable obstacles. Never a substitute for extracted listings. */
  obstacles?: { code: string; url?: string; detail?: string }[];
  stages?: string[];
  candidates?: { id: string; confidence: number; evidence: string }[];
  /** Preserved when an obstacle stops the import. Never includes cookies, tokens, or credentials. */
  resume?: { seeds: string[]; pending: string[]; obstacle?: string; stage?: string };
};

export type FetchHtml = (uri: string, options?: { fragment?: boolean; activationToken?: string; cookie?: string; csrfToken?: string }) => Promise<{ html: string; finalUrl: URL; network?: { url: string; html: string }[] }>;
export type NavigationCandidate = { url: string; label: string };
export type SelectInventoryLinks = (page: string, candidates: NavigationCandidate[]) => Promise<string[]>;

const decodeEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));

const attr = (tag: string, name: string) =>
  decodeEntities(tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2] ?? "").trim();

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Hosts that commonly host public IDX / FlexMLS inventory (not agent login walls). */
export const MLS_INVENTORY_HOST =
  /(?:^|\.)(?:flexmls\.com|idx\.|mls\.|listingbook\.com|homesnap\.com|showcaseidx\.com|ihomefinder\.com|realgeeks\.com|placester\.com|kvcore\.com|followupboss\.com|liondesk\.com|diverse-solutions\.com|search\.|listings\.)/i;

const LOGIN_PATH = /\/(login|userlogin|usersignup|myaccount|signin|sign-in|auth|account|dashboard|portal|admin|members|agent-only)(\/|$)/i;

/** Phrases that mean "go look at my properties". */
const CTA_LABEL =
  /\b(view\s+(all\s+)?(our\s+)?(properties|listings|homes)|see\s+(all\s+)?(properties|listings|homes)|browse\s+(properties|listings|homes)|our\s+(listings|properties|homes)|current\s+listings|featured\s+(homes|listings|properties)|search\s+(homes|listings|properties)|find\s+(a\s+)?(home|property)|properties\s+for\s+sale|homes\s+for\s+sale|for\s+sale|buy\s+(a\s+)?(home|property)|listings?|properties|inventory|idx|mls|flexmls)\b/i;

const PATH_INVENTORY =
  /\/(?:[a-z]+-)?(listings?|properties|homes?(?:-for-sale)?|for-sale|search|idx|mls|gallery|inventory|featured|buy)(?:[/-]|$)/i;

const DETAIL_PATH =
  /\/(listing|property|home|homes|homes-for-sale|listings|properties|detail|p)\/[^/?#]+/i;

const looksLikeChrome = (u: string) => {
  const lc = u.toLowerCase();
  return (
    lc.endsWith(".svg") ||
    lc.includes("/icon") ||
    lc.includes("logo") ||
    lc.includes("sprite") ||
    lc.includes("favicon") ||
    lc.includes("avatar") ||
    lc.includes("placeholder") ||
    lc.includes("1x1")
  );
};

function absolutize(raw: string, base: URL): string | null {
  try {
    if (!raw || raw.startsWith("data:") || /^(javascript|mailto|tel|vbscript):/i.test(raw)) return null;
    if (raw.startsWith("//")) return new URL("https:" + raw).toString();
    const abs = new URL(raw, base);
    if (abs.protocol === "http:") abs.protocol = "https:";
    if (abs.protocol !== "https:") return null;
    abs.hash = "";
    return abs.toString();
  } catch {
    return null;
  }
}

function sameSite(a: URL, b: URL): boolean {
  const strip = (h: string) => h.replace(/^www\./, "").toLowerCase();
  return strip(a.hostname) === strip(b.hostname);
}

/** Score a candidate inventory link. Higher = more likely property inventory. */
export function scoreInventoryLink(href: string, label: string, seed: URL): number {
  let link: URL;
  try {
    link = new URL(href);
  } catch {
    return 0;
  }
  if (link.protocol !== "https:" || LOGIN_PATH.test(link.pathname) ||
      /\/(?:emissary|shares|carts)\//i.test(link.pathname) || /^(?:log\s*in|sign\s*in|save|share|hide|unhide|print|contact)(?:\s|$)/i.test(label.trim())) return 0;
  if (/\b(?:privacy|terms|cookie|copyright|training|support)\b/i.test(label) ||
      /(?:^|\.)(?:facebook|instagram|twitter|x|linkedin|youtube)\.com$/i.test(link.hostname) ||
      /^(?:www\.)?flexmls\.com$/i.test(link.hostname)) return 0;
  if (/\.(?:pdf|jpg|png|svg|zip|css|js)$/i.test(link.pathname)) return 0;
  const text = `${label} ${link.pathname} ${link.hostname}`.toLowerCase();
  let score = 0;
  if (CTA_LABEL.test(text)) score += 40;
  if (/\b(?:my|our|featured|exclusive|current|active)\b/i.test(label + " " + link.pathname) && CTA_LABEL.test(text)) score += 60;
  if (/office_listing_categories|agent_listing_categories/i.test(link.pathname)) score += 90;
  if (/\b(?:all|market|area)\s+(?:homes|properties|listings)|property\s+search/i.test(label)) score -= 25;
  if (PATH_INVENTORY.test(link.pathname)) score += 35;
  if (MLS_INVENTORY_HOST.test(link.hostname)) score += 50;
  if (/(flexmls|idx|mls)/i.test(text)) score += 25;
  if (sameSite(link, seed)) score += 10;
  else if (!MLS_INVENTORY_HOST.test(link.hostname) && !CTA_LABEL.test(label) && !/(listings?|properties|homes|realestate|realty)/i.test(link.hostname)) {
    // Off-site and not an MLS/IDX host — usually not inventory.
    score -= 20;
  }
  // Prefer collection pages over a single deep detail URL on hop 0.
  if (DETAIL_PATH.test(link.pathname) && !PATH_INVENTORY.test(link.pathname)) score -= 5;
  if (link.toString() === seed.toString()) return 0;
  return score;
}

/** Collect outbound inventory CTAs from a page. */
export function collectInventoryLinks(html: string, base: URL, limit = 8): { url: string; score: number; label: string }[] {
  return documentOnce(html, `inventoryLinks|${base.href}`, () => rankedInventoryLinks(html, base)).slice(0, limit).map(link => ({ ...link }));
}

function rankedInventoryLinks(html: string, base: URL): { url: string; score: number; label: string }[] {
  const seen = new Set<string>();
  const out: { url: string; score: number; label: string }[] = [];
  const hrefs = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const [, attributes, rawLabel] of hrefs) {
    const tag = `<a ${attributes}>`;
    const href = absolutize(attr(tag, "href"), base);
    if (!href || seen.has(href)) continue;
    const label = decodeEntities(`${stripTags(rawLabel)} ${attr(tag, "aria-label")} ${attr(tag, "title")}`).trim().slice(0, 200);
    const score = scoreInventoryLink(href, label, base);
    if (score < 30) continue;
    seen.add(href);
    out.push({ url: href, score, label });
  }
  // iframe / embed IDX frames
  for (const tag of html.match(/<(?:iframe|embed|turbo-frame|button)\b[^>]*>/gi) ?? []) {
    const src = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-href") || attr(tag, "data-url") ||
      attr(tag, "onclick").match(/(?:location(?:\.href)?\s*=|(?:window\.)?open\s*\()\s*["']([^"']+)["']/)?.[1] || "";
    const href = src ? absolutize(src, base) : null;
    if (!href || seen.has(href)) continue;
    const score = scoreInventoryLink(href, `${attr(tag, "title")} ${attr(tag, "aria-label")}`, base) + 15;
    if (score < 30) continue;
    seen.add(href);
    out.push({ url: href, score, label: "embedded listings" });
  }
  // Search forms often carry agent/office filters in hidden GET fields.
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const tag = `<form ${match[1]}>`;
    if ((attr(tag, "method") || "get").toLowerCase() !== "get") continue;
    const target = absolutize(attr(tag, "action"), base);
    if (!target) continue;
    const url = new URL(target);
    for (const input of match[2].match(/<input\b[^>]*>/gi) ?? []) {
      if (attr(input, "type") === "hidden" && attr(input, "name")) url.searchParams.set(attr(input, "name"), attr(input, "value"));
    }
    const label = stripTags(match[2]).slice(0, 200);
    const score = scoreInventoryLink(url.toString(), label, base);
    if (score >= 30 && !seen.has(url.toString())) { seen.add(url.toString()); out.push({ url: url.toString(), score, label }); }
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (attr(tag, "http-equiv").toLowerCase() !== "refresh") continue;
    const raw = attr(tag, "content").match(/url\s*=\s*(.+)$/i)?.[1]?.replace(/^["']|["']$/g, "");
    const url = raw ? absolutize(raw, base) : null;
    if (url && !seen.has(url) && !LOGIN_PATH.test(new URL(url).pathname)) out.push({ url, score: 160, label: "Page redirect" });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Parsed JSON-LD blocks, parsed once per document (readers only walk them, never modify them). */
function jsonLdBlocks(html: string): unknown[] {
  return documentOnce(html, "jsonLd", () => parseJsonLdBlocks(html)).slice();
}

function parseJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* ignore */
    }
  }
  return out;
}

function walkLd(nodes: unknown[], visit: (obj: Record<string, unknown>) => void) {
  const stack: unknown[] = [...nodes];
  let scanned = 0;
  while (stack.length && scanned++ < 5000) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    const obj = node as Record<string, unknown>;
    visit(obj);
    Object.values(obj).forEach((v) => {
      if (v && typeof v === "object") stack.push(v);
    });
  }
}

function typeOf(obj: Record<string, unknown>): string {
  const t = obj["@type"];
  if (Array.isArray(t)) return t.map(String).join(" ").toLowerCase();
  return String(t ?? "").toLowerCase();
}

function priceFrom(obj: Record<string, unknown>): string {
  const offers = obj.offers;
  const candidates = [
    obj.price,
    obj.lowPrice,
    typeof offers === "object" && offers && !Array.isArray(offers) ? (offers as Record<string, unknown>).price : null,
    Array.isArray(offers) && offers[0] && typeof offers[0] === "object"
      ? (offers[0] as Record<string, unknown>).price
      : null,
  ];
  for (const p of candidates) {
    if (typeof p === "number" && p > 0) return `$${p.toLocaleString()}`;
    if (typeof p === "string" && /\d/.test(p)) {
      const n = Number(String(p).replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n) && n > 0) return `$${n.toLocaleString()}`;
      if (p.includes("$")) return p.replace(/\s+/g, "").slice(0, 24);
    }
  }
  return "";
}

function imagesFrom(obj: Record<string, unknown>, base: URL): string[] {
  const raw = obj.image ?? obj.photo ?? obj.associatedMedia ?? obj.thumbnailUrl;
  const list: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") {
      const a = absolutize(v, base);
      if (a && !looksLikeChrome(a)) list.push(a);
    } else if (v && typeof v === "object") {
      const a = absolutize(String((v as { contentUrl?: string; url?: string }).contentUrl ?? (v as {url?:string}).url ?? ""), base);
      if (a && !looksLikeChrome(a)) list.push(a);
    }
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else push(raw);
  return list;
}

function neighborhoodFrom(obj: Record<string, unknown>): string {
  const addr = obj.address;
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    const locality = typeof a.addressLocality === "string" ? a.addressLocality.trim() : "";
    const region = typeof a.addressRegion === "string" ? a.addressRegion.trim() : "";
    if (locality && region) return `${locality}, ${region}`;
    if (locality) return locality;
  }
  return typeof obj.addressLocality === "string" ? obj.addressLocality.trim() : "";
}

function specsFrom(obj: Record<string, unknown>, textFallback = ""): { beds: number; baths: number; sqft: string } {
  let beds = 0;
  let baths = 0;
  let sqft = "";
  const b = obj.numberOfBedrooms ?? obj.numberOfRooms ?? obj.bedrooms;
  if (typeof b === "number" || typeof b === "string") {
    const n = parseFloat(String(b).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) beds = Math.round(n);
  }
  const ba = obj.numberOfBathroomsTotal ?? obj.numberOfBathrooms ?? obj.bathrooms;
  if (typeof ba === "number" || typeof ba === "string") {
    const n = parseFloat(String(ba).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) baths = n;
  }
  const fs = obj.floorSize;
  if (fs && typeof fs === "object") {
    const v = (fs as Record<string, unknown>).value;
    if (typeof v === "number" || typeof v === "string") {
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) sqft = Math.round(n).toLocaleString();
    }
  }
  if (!beds) {
    const m = textFallback.match(/(\d+(?:\.\d+)?)\s*(?:bd|bds|bed|beds|bedrooms?)\b/i);
    if (m) beds = Math.round(parseFloat(m[1]));
  }
  if (!baths) {
    const m = textFallback.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath|baths|bathrooms?)\b/i);
    if (m) baths = parseFloat(m[1]);
  }
  if (!sqft) {
    const m = textFallback.match(/([\d,]{3,})\s*(?:sq\.?\s*ft|sqft|square\s*feet)\b/i);
    if (m) {
      const n = parseInt(m[1].replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(n) && n > 0) sqft = n.toLocaleString();
    }
  }
  return { beds, baths, sqft };
}

const TRACKING_QUERY = /^(?:utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|mc_[a-z]+|ref|referrer|source|timestamp|listingsort|timezone|featurelistingname|requestid)$/i;

function providerListingId(url: URL): string {
  return url.pathname.split("/").find(part => /^\d{8,16}$/.test(part)) ?? "";
}

function canonicalListingUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return raw; }
  url.hash = "";
  const id = providerListingId(url);
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_QUERY.test(key) || (id && /^(?:page|pagesize|siteid|pagenumber)$/i.test(key))) url.searchParams.delete(key);
  }
  const entries = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of entries) url.searchParams.append(key, value);
  return url.toString();
}

function listingIdentityKey(item: Pick<DiscoveredListing, "sourceUrl" | "listingNumber">): string {
  let origin = "";
  let id = (item.listingNumber ?? "").trim();
  try {
    const url = new URL(item.sourceUrl);
    origin = url.origin;
    if (!id) id = providerListingId(url);
  } catch { /* a listing number can still identify the record */ }
  if (id) return `${origin}|id:${id.toLowerCase()}`;
  return `url:${canonicalListingUrl(item.sourceUrl)}`;
}

function preferTitle(current: string, incoming: string): string {
  const weak = /^(?:new|active|pending|sold|featured|just listed|for sale)$/i;
  if (weak.test(current) && incoming && !weak.test(incoming)) return incoming;
  if (weak.test(incoming) && current && !weak.test(current)) return current;
  if (current && incoming && /\d/.test(incoming) && !/\d/.test(current)) return incoming;
  return current.length >= incoming.length ? current : incoming;
}

function listingFromLd(obj: Record<string, unknown>, base: URL): DiscoveredListing | null {
  const types = typeOf(obj);
  const isListing =
    /realestate|residence|house|apartment|product|offer|singlefamily|place/.test(types) ||
    (!!obj.offers && typeof (obj.name ?? obj.title) === "string");
  if (!isListing && !obj.numberOfBedrooms && !priceFrom(obj)) return null;
  const name = typeof obj.name === "string" ? obj.name : typeof obj.title === "string" ? obj.title : "";
  const title = decodeEntities(name).replace(/\s+/g, " ").trim();
  if (!title || title.length < 3) return null;
  const description =
    typeof obj.description === "string" ? decodeEntities(stripTags(obj.description)).trim().slice(0, 16000) : "";
  const price = priceFrom(obj);
  const images = imagesFrom(obj, base);
  const urlRaw =
    typeof obj.url === "string"
      ? obj.url
      : typeof obj["@id"] === "string" && /^https?:/i.test(obj["@id"])
        ? obj["@id"]
        : base.toString();
  const sourceUrl = canonicalListingUrl(absolutize(urlRaw, base) ?? base.toString());
  const { beds, baths, sqft } = specsFrom(obj, `${title} ${description}`);
  // Require a price or beds so we don't treat the whole agency as a "listing".
  if (!price && !beds) return null;
  if (/realestateagent|organization|localbusiness|website|webpage|breadcrumb/i.test(types) && !price) return null;
  return {
    title: title.slice(0, 160),
    description,
    price,
    beds,
    baths,
    sqft,
    neighborhood: neighborhoodFrom(obj),
    image: images[0] ?? "",
    images: images.slice(0, 500),
    facts: structuredPropertyFacts(obj),
    sourceUrl,
    listingNumber: [obj.listingId, obj.listingNumber, obj.mlsNumber, typeof obj.identifier === "object" ? (obj.identifier as Record<string, unknown> | null)?.value : obj.identifier].filter(v => typeof v === "string" || typeof v === "number").map(String).find(Boolean)?.slice(0, 100) ?? "",
    propertyType: [obj.propertyType, obj.additionalType].filter(v => typeof v === "string").map(String).find(Boolean)?.slice(0, 100) ?? "",
  };
}

/** Extract listings from JSON-LD on a page. */
export function listingsFromJsonLd(html: string, base: URL): DiscoveredListing[] {
  const found: DiscoveredListing[] = [];
  const seen = new Set<string>();
  walkLd(jsonLdBlocks(html), (obj) => {
    const item = listingFromLd(obj, base);
    if (!item) return;
    const key = `${item.sourceUrl}|${item.title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(item);
  });
  return found;
}

/**
 * Heuristic card scrape: anchors whose URL looks like a property detail and
 * whose surrounding markup mentions a dollar price.
 */
export function listingsFromCards(html: string, base: URL, limit = 100): DiscoveredListing[] {
  html = html.replace(/<(aside|section)\b[^>]*\b(?:class|id)=["'][^"']*\b(?:nearby|recommended|similar)(?:[-_](?:homes|listings|properties|results))?\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, " ");
  const found: DiscoveredListing[] = [];
  const seen = new Set<string>();
  const hrefs = [...html.matchAll(/<a\b([^>]*)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)];
  const containers = propertyCardContainers(html, base);
  for (const match of hrefs) {
    const href = canonicalListingUrl(absolutize(decodeEntities(match[2]).trim(), base) ?? "");
    if (!href || seen.has(href)) continue;
    let link: URL;
    try {
      link = new URL(href);
    } catch {
      continue;
    }
    const label = stripTags(match[4]).slice(0, 200);
    const pathOk = DETAIL_PATH.test(link.pathname) || /listing|property|home|mls|pin|id=/i.test(link.pathname + link.search);
    // Price-bucket navigation is a filter, not a property, on any host.
    if (/\/\d+k-price\/?$/i.test(link.pathname) || /homes for sale under\b/i.test(label)) continue;
    if (!pathOk && !sameSite(link, base)) continue;
    if (!pathOk && label.length < 8) continue;
    // Peek at a window of HTML around the match for price / beds.
    const idx = match.index ?? 0;
    const ownPrice = /\$\s?\d/.test(stripTags(match[4]));
    // A priced anchor is the complete card. Never borrow fields or a photo from its neighbors.
    const before = html.slice(Math.max(0, idx - 200), idx).split(/<\/a>/i).pop() ?? "";
    const after = html.slice(idx + match[0].length, idx + match[0].length + 400).split(/<a\b/i)[0];
    let window = ownPrice ? match[4] : before + match[0] + after;
    // A card container that names this same property URL bounds the card when its price sits outside the
    // anchor's immediate neighborhood (photo and price above the address link).
    if (!ownPrice && !/\$\s?\d/.test(stripTags(window)) && containers.has(href)) window = containers.get(href)!;
    const text = decodeEntities(stripTags(window));
    const priceMatch = text.match(/\$\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\s?\d+(?:\.\d+)?\s?[MK]/i);
    if (!priceMatch || !pathOk) continue;
    const price = priceMatch ? priceMatch[0].replace(/\s+/g, "") : "";
    const { beds, baths, sqft } = specsFrom({}, text);
    let image = "";
    const img = window.match(/<img\b[^>]*(?:src|data-src|data-lazy-src)\s*=\s*["']([^"']+)["'][^>]*>/i);
    if (img) {
      const a = absolutize(attr(img[0], "data-src") || attr(img[0], "data-lazy-src") || attr(img[0], "src"), base);
      if (a && !looksLikeChrome(a)) image = a;
    }
    if (!image) image = absolutize(window.match(/background-image\s*:\s*url\(["']?([^"')]+)/i)?.[1] ?? "", base) ?? "";
    const address = window.match(/class=["'][^"']*(?:__street|listing-address)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|h[1-6])>/i)?.[1];
    const title =
      (address ? decodeEntities(stripTags(address)) : "") ||
      label.replace(/\s+/g, " ").trim() ||
      decodeEntities(attr(match[0], "title") || attr(`<a ${match[1]}>`, "aria-label") || "").trim() ||
      link.pathname.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") ||
      "Listing";
    if (title.length < 3) continue;
    // Skip pure nav ("Listings", "Home", "Contact").
    if (/^(home|listings?|properties|contact|about|login|sign\s*in|menu)$/i.test(title)) continue;
    seen.add(href);
    const historical = historicalInventoryUrl(href) || soldContext(html, idx, match[0]);
    found.push({
      title: title.slice(0, 160),
      description: "",
      price,
      beds,
      baths,
      sqft,
      neighborhood: "",
      image,
      images: image ? [image] : [],
      sourceUrl: href,
      ...(historical ? { status: "sold" as const, sourceStatus: "sold" as const } : {}),
    });
    if (found.length >= limit) break;
  }
  return found;
}

/**
 * Repeated card containers that carry their property's URL as an attribute (data-url, data-href, data-link,
 * data-detail-url). Each card runs to the next container, so facts cannot leak between properties. Only a
 * repeated pattern counts (3+), and only property detail paths.
 */
function propertyCardContainers(html: string, base: URL): Map<string, string> {
  const starts: { index: number; url: string }[] = [];
  for (const m of html.matchAll(/<(?:div|li|article|section)\b(?:[^>"']|"[^"]*"|'[^']*')*\bdata-(?:url|href|link|detail-url)\s*=\s*["']([^"']+)["'](?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const abs = absolutize(decodeEntities(m[1]).trim(), base);
    if (!abs) continue;
    let url: URL;
    try { url = new URL(abs); } catch { continue; }
    if (!sameSite(url, base) || !DETAIL_PATH.test(url.pathname)) continue;
    starts.push({ index: m.index ?? 0, url: canonicalListingUrl(url.toString()) });
  }
  const out = new Map<string, string>();
  if (starts.length < 3) return out;
  starts.forEach((start, i) => {
    if (out.has(start.url)) return;
    out.set(start.url, html.slice(start.index, Math.min(starts[i + 1]?.index ?? html.length, start.index + 12000)));
  });
  return out;
}

/** Repeated tiles that publish a price, an address, and a property URL as attributes.
 * Placester/Valhalla and similar grids do this without a dollar sign inside the anchor.
 * A price alone is not a listing. The URL must be a property path.
 */
export function listingsFromAttributeCards(html: string, base: URL, limit = 100): DiscoveredListing[] {
  const found: DiscoveredListing[] = [];
  const seen = new Set<string>();
  const tags = [...html.matchAll(/<[a-z][a-z0-9-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)];
  for (let i = 0; i < tags.length && found.length < limit; i++) {
    const tag = tags[i][0];
    const priceRaw = attr(tag, "data-price") || attr(tag, "data-list-price") || attr(tag, "data-listing-price");
    if (!priceRaw) continue;
    const numeric = Number(String(priceRaw).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(numeric) || numeric < 1000 || numeric > 100_000_000) continue;
    const price = priceFrom({ price: priceRaw });
    if (!price) continue;
    const address = decodeEntities(attr(tag, "data-address") || attr(tag, "data-street") || attr(tag, "data-street-address")).trim();
    const label = decodeEntities(attr(tag, "data-pl-navigate-label") || attr(tag, "data-navigate-label")).trim();
    const rawUrl = attr(tag, "data-pl-navigate-url") || attr(tag, "data-navigate-url") || attr(tag, "data-listing-url") || attr(tag, "data-url") || attr(tag, "data-href");
    const start = tags[i].index ?? 0;
    let end = Math.min(html.length, start + 8000);
    for (let j = i + 1; j < tags.length; j++) {
      if (attr(tags[j][0], "data-price") || attr(tags[j][0], "data-list-price") || attr(tags[j][0], "data-listing-price")) {
        end = tags[j].index ?? end;
        break;
      }
    }
    const block = html.slice(start, end);
    const childHref = block.match(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const source = propertyAttributeUrl(rawUrl || childHref, base);
    if (!source) continue;
    const title = address || label.split(",")[0]?.trim() || "";
    if (title.length < 3 || /^(?:home|listings?|properties|contact|about|featured listings)$/i.test(title)) continue;
    const locality = decodeEntities(attr(tag, "data-locality") || attr(tag, "data-city")).replace(/^\[["']?|["']?\]$/g, "").replace(/^["']|["']$/g, "").trim();
    const regionRaw = decodeEntities(attr(tag, "data-region") || attr(tag, "data-state"));
    const region = /^\s*\[/.test(regionRaw) ? (regionRaw.match(/[A-Za-z]{2}/)?.[0] ?? "") : regionRaw.replace(/[\[\]"]/g, "").trim();
    const img = block.match(/<img\b[^>]*>/i)?.[0] ?? "";
    const imageRaw = absolutize(attr(img, "data-src") || attr(img, "data-lazy-src") || attr(img, "src"), base) ?? "";
    const image = imageRaw && !looksLikeChrome(imageRaw) ? imageRaw : "";
    const id = attr(tag, "data-id") || attr(tag, "data-listing-id");
    const listingNumber = /^\d{5,16}$/.test(id) ? id : "";
    if (seen.has(source)) continue;
    seen.add(source);
    const specs = specsFrom({ bedrooms: attr(tag, "data-beds") || attr(tag, "data-bedrooms"), bathrooms: attr(tag, "data-baths") || attr(tag, "data-bathrooms") }, stripTags(block));
    found.push({
      title: title.slice(0, 160), description: "", price, ...specs, neighborhood: [locality, region].filter(Boolean).join(", ").slice(0, 120),
      image, images: image ? [image] : [], sourceUrl: source, ...(listingNumber ? { listingNumber } : {}),
    });
  }
  return found;
}

function propertyAttributeUrl(raw: string, base: URL): string | null {
  const abs = absolutize(decodeEntities(raw).trim(), base);
  if (!abs) return null;
  let url: URL;
  try { url = new URL(abs); } catch { return null; }
  if (!DETAIL_PATH.test(url.pathname) && !/\/property\/|\/listing\//i.test(url.pathname)) return null;
  for (const key of [...url.searchParams.keys()]) {
    const value = url.searchParams.get(key) ?? "";
    if (/^(?:filters|filter|search_filters)$/i.test(key) && (value.startsWith("{") || value.startsWith("[") || value.length > 40)) url.searchParams.delete(key);
  }
  return canonicalListingUrl(url.toString());
}

/** Single-property page fallback via Open Graph / title. */
export function listingFromMeta(html: string, base: URL): DiscoveredListing | null {
  const meta = (key: string, value: string) => {
    const re = new RegExp(`<meta[^>]*${key}=["']${value}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
    const m1 = html.match(re);
    if (m1) return decodeEntities(m1[1]);
    const re2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${key}=["']${value}["'][^>]*>`, "i");
    const m2 = html.match(re2);
    return m2 ? decodeEntities(m2[1]) : "";
  };
  const title =
    meta("property", "og:title") ||
    meta("name", "twitter:title") ||
    decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  const description = meta("property", "og:description") || meta("name", "description") || "";
  const imageRaw = meta("property", "og:image") || meta("name", "twitter:image") || "";
  const image = imageRaw ? absolutize(imageRaw, base) ?? "" : "";
  const text = stripTags(html.slice(0, 80000));
  const priceMatch = text.match(/\$\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\s?\d+(?:\.\d+)?\s?[MK]/i);
  const price = priceMatch ? priceMatch[0].replace(/\s+/g, "") : "";
  const { beds, baths, sqft } = specsFrom({}, text);
  const looksProperty = DETAIL_PATH.test(base.pathname) && (!!price || beds > 0) &&
    !/\/(?:office_listing_categories|agent_listing_categories)\/[^/]+\/listings\/?$/.test(base.pathname);
  if (!looksProperty || !title || title.length < 3) return null;
  if (/^(home|welcome|about)/i.test(title) && !price && !beds) return null;
  return {
    title: title.slice(0, 160),
    description: description.slice(0, 16000),
    price,
    beds,
    baths,
    sqft,
    neighborhood: "",
    image,
    images: image ? [image] : [],
    sourceUrl: canonicalListingUrl(base.toString()),
  };
}

function extractPropertyRecords(html: string, base: URL, attempts?: StrategyAttempt[]): DiscoveredListing[] {
  const merged: DiscoveredListing[] = [];
  const seen = new Set<string>();
  for (const strategy of LISTING_EXTRACTION_STRATEGIES) {
    if (strategy.phase === "fallback" && merged.length) break;
    if (!documentMatches(strategy.id, strategy.matches, html, base)) continue;
    let rows: DiscoveredListing[];
    try { rows = strategy.extract(html, base); }
    catch { attempts?.push({ id: strategy.id, version: strategy.version, evidence: strategy.evidence, outcome: "error", records: 0 }); continue; }
    attempts?.push({ id: strategy.id, version: strategy.version, evidence: strategy.evidence,
      outcome: rows.length ? "extracted" : "empty", records: rows.length });
    // Platform readers preserve scope/status exclusions; generic fallbacks run only if they found nothing.
    if (rows.length && strategy.phase === "specialized") return rows;
    // Same provider id or canonical URL is one listing. Tracking parameters are not a second home.
    for (const row of rows) {
      const sourceUrl = canonicalListingUrl(row.sourceUrl);
      const normalized = sourceUrl === row.sourceUrl ? row : { ...row, sourceUrl };
      const key = listingIdentityKey(normalized);
      const index = merged.findIndex(existing => listingIdentityKey(existing) === key);
      if (index >= 0) {
        const old = merged[index];
        const images = [...new Set([...normalized.images, ...old.images])].slice(0, 500);
        merged[index] = { ...old, title: preferTitle(old.title, normalized.title), description: normalized.description.length > old.description.length ? normalized.description : old.description,
          price: old.price || normalized.price, beds: old.beds || normalized.beds, baths: old.baths || normalized.baths, sqft: old.sqft || normalized.sqft,
          listingNumber: old.listingNumber || normalized.listingNumber, neighborhood: old.neighborhood || normalized.neighborhood,
          image: images[0] || old.image, images, sourceUrl: canonicalListingUrl(old.sourceUrl) };
        continue;
      }
      seen.add(key);
      merged.push(normalized);
    }
  }
  return merged.slice(0, 500);
}

/** Provider-independent status. A published value that does not match stays unknown. */
export function sourceListingStatus(value: unknown): NonNullable<DiscoveredListing["sourceStatus"]> {
  if (typeof value !== "string" || !value.trim()) return "unspecified";
  const label = value.trim().replace(/^https?:\/\/schema\.org\//i, "").toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
  if (/^(active|for sale|new|back on market)$/.test(label)) return "active";
  if (/^coming soon$/.test(label)) return "coming_soon";
  if (/^(pending|pending continue to show|pending taking backups)$/.test(label)) return "pending";
  if (/^under contract$/.test(label)) return "under_contract";
  if (/^(contingent|active contingent|active under contract|active with contingency|active kick out)$/.test(label)) return "contingent";
  if (/^(backup|backup offer)$/.test(label)) return "backup";
  if (/^(sold|just sold)$/.test(label)) return "sold";
  if (/^closed$/.test(label)) return "closed";
  if (/^(off market|temporarily off market)$/.test(label)) return "off_market";
  if (/^expired$/.test(label)) return "expired";
  if (/^withdrawn$/.test(label)) return "withdrawn";
  if (/^(cancelled|canceled)$/.test(label)) return "cancelled";
  if (/^(private|exclusive|pocket|pocket listing)$/.test(label)) return "private";
  return "unknown";
}

/** Product status. Pending, contingent, and coming soon stay in the realtor's inventory. */
export function normalizeListingStatus(value: unknown): DiscoveredListing["status"] {
  const source = sourceListingStatus(value);
  if (source === "active" || source === "coming_soon") return "active";
  if (source === "pending" || source === "under_contract" || source === "backup") return "pending";
  if (source === "contingent") return "contingent";
  if (source === "sold" || source === "closed") return "sold";
  if (source === "off_market" || source === "expired" || source === "withdrawn" || source === "cancelled") return "off_market";
  return undefined;
}

/** Sold, off-market, and unrecognized published statuses are exclusions, not active inventory. */
export function exclusionReason(item: Pick<DiscoveredListing, "status" | "sourceStatus">): string | null {
  const source = item.sourceStatus;
  if (source === "unknown") return "excluded_status_unknown";
  if (source === "sold" || source === "closed" || (!source && item.status === "sold")) return "excluded_status_sold";
  if (source === "expired") return "excluded_status_expired";
  if (source === "withdrawn" || source === "cancelled") return "excluded_status_withdrawn";
  if (source === "off_market" || (!source && item.status === "off_market")) return "excluded_status_off_market";
  return null;
}

export function isProductEligible(item: Pick<DiscoveredListing, "status" | "sourceStatus">): boolean {
  return !exclusionReason(item);
}

const propertyIdentity = (value: unknown) => typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

/** Document-level status evidence shared by every listing read from the same page. */
function statusEvidenceOf(html: string) {
  const nodes = jsonLdBlocks(html);
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { nodes.push(JSON.parse(m[1])); } catch { /* malformed hydration */ }
  }
  const cards: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<[^>]+\bdata-listing=["'][^>]+>/gi)) {
    try { cards.push(JSON.parse(attr(m[0], "data-listing"))); } catch { /* malformed card */ }
  }
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const headings = [...html.matchAll(/<(?:h1|title)\b[^>]*>([\s\S]*?)<\/(?:h1|title)>/gi)].map(m => stripTags(m[1]));
  for (const tag of metas) if (attr(tag, "property") === "og:title") headings.push(attr(tag, "content"));
  const metaStatuses = metas.filter(tag => /^(?:listing:status|property:status|listingstatus|standardstatus)$/i.test(attr(tag, "property") || attr(tag, "name")))
    .map(tag => attr(tag, "content"));
  // Read only on an identified detail page, then kept: the main column (status badges of recommended
  // properties farther down the page are not this property's) and its text.
  let column: { badges: string[]; text: () => string } | undefined;
  const mainColumn = () => column ??= (() => {
    let main = html.replace(/<(?:script|style|nav|footer)\b[^>]*>[\s\S]*?<\/(?:script|style|nav|footer)>/gi, "");
    main = main.split(/<(?:h2|h3)\b|(?:related|similar|recommended|recently sold)\s+(?:homes|properties|listings)/i)[0];
    const badges = [...main.matchAll(/<(?:span|div|p|strong)\b[^>]*(?:class|id)=["'][^"']*(?:listing-status|property-status|standard-status)[^"']*["'][^>]*>([^<]*)<\//gi)].map(m => m[1]);
    let text: string | undefined;
    return { badges, text: () => text ??= stripTags(main) };
  })();
  return { nodes, cards, headings, metaStatuses, mainColumn };
}

/** Only use status attached to the matching property; recommendations and navigation are excluded. */
export function statusForProperty(html: string, item: Pick<DiscoveredListing, "title" | "sourceUrl">, base: URL): DiscoveredListing["status"] {
  const expected = propertyIdentity(item.title);
  if (!expected) return undefined;
  let matched: DiscoveredListing["status"];
  const statusFrom = (obj: Record<string, unknown>): DiscoveredListing["status"] => {
    for (const key of ["StandardStatus", "MlsStatus", "ListingStatus", "PropertyStatus", "Status", "standardStatus", "listingStatus", "propertyStatus", "status"]) {
      const status = normalizeListingStatus(obj[key]);
      if (status) return status;
    }
    const offers = obj.offers;
    if (offers && !Array.isArray(offers) && typeof offers === "object") return statusFrom(offers as Record<string, unknown>);
    return undefined;
  };
  const matches = (obj: Record<string, unknown>) => {
    const address = obj.address && typeof obj.address === "object" ? (obj.address as Record<string, unknown>).streetAddress : obj.address;
    return [obj.StreetAddress, obj.streetAddress, obj.UnparsedAddress, obj.addressLine1, address, obj.name, obj.title]
      .some(value => propertyIdentity(value) === expected);
  };
  // The page's structured data is parsed once per document, not once per listing on the page.
  const page = documentOnce(html, "statusEvidence", () => statusEvidenceOf(html));
  walkLd(page.nodes, obj => { if (!matched && matches(obj)) matched = statusFrom(obj); });
  if (matched) return matched;
  for (const obj of page.cards) {
    try { if (matches(obj)) { const status = statusFrom(obj); if (status) return status; } } catch { /* malformed card */ }
  }
  // Visible labels are accepted only on an identified property detail page.
  const identified = page.headings.some(title => propertyIdentity(title) === expected ||
    title.split(/\s[|–—]\s/).some(part => propertyIdentity(part) === expected));
  if (identified) {
    for (const value of page.metaStatuses) { const status = normalizeListingStatus(value); if (status) return status; }
    for (const badge of page.mainColumn().badges) {
      const status = normalizeListingStatus(stripTags(badge).replace(/^status\s*:\s*/i, "")); if (status) return status;
    }
    const label = page.mainColumn().text().match(/\b(?:listing status|property status|standard status|MLS status)\s*:\s*(active under contract|active contingent|off[- ]market|for sale|active|pending|contingent|sold|closed|withdrawn|expired|cancelled)\b/i);
    const status = normalizeListingStatus(label?.[1]); if (status) return status;
  }
  return undefined;
}

export function extractListingsFromPage(html: string, base: URL, attempts?: StrategyAttempt[]): DiscoveredListing[] {
  return extractPropertyRecords(html, base, attempts).map(item => ({ ...item, status: item.status ?? statusForProperty(html, item, base) ??
    // Flexmls's explicitly filtered collection establishes active membership.
    (/(?:^|\.)flexmls\.com$/i.test(base.hostname) && /\/(?:office|agent)_listing_categories\/Active\/listings/.test(base.pathname) ? "active" : undefined) }));
}

/** Public server-rendered cards with per-property payloads (including Flexmls). */
export function listingsFromStructuredCards(html: string, base: URL): DiscoveredListing[] {
  const starts = [...html.matchAll(/<[a-z][a-z0-9-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .filter(m => attr(m[0], "data-href") && /listingListItem|listing-card|property-card/i.test(attr(m[0], "class")));
  const found: DiscoveredListing[] = [];
  starts.forEach((match, index) => {
    const block = html.slice(match.index, starts[index + 1]?.index ?? html.length);
    const sourceUrl = absolutize(attr(match[0], "data-href"), base);
    if (!sourceUrl) return;
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(attr(block.match(/<[^>]+\bdata-listing=["'][^>]+>/i)?.[0] ?? "", "data-listing")); } catch { /* use card text */ }
    const field = (name: string) => decodeEntities(block.match(new RegExp(`class=["'][^"']*\\b${name}\\b[^"']*["'][^>]*>([^<]+)`, "i"))?.[1] ?? "").trim();
    const title = String(data.StreetAddress ?? field("line-one"));
    const price = priceFrom({ price: data.CurrentPrice ?? data.ListPrice ?? attr(match[0], "data-current-price") });
    if (!title || !price) return;
    const imageTag = block.match(/<img\b[^>]*>/i)?.[0] ?? "";
    const image = absolutize(attr(imageTag, "data-src") || attr(imageTag, "src"), base) ?? "";
    const sqft = block.match(/title=["'](?:Total SqFt\.?|Square Feet)["'][\s\S]{0,150}?class=["']value["'][^>]*>([^<]+)/i)?.[1] ?? "";
    const specs = specsFrom({ bedrooms: data.BedsTotal, bathrooms: data.BathsTotal }, stripTags(block));
    found.push({ title, price, description: "", ...specs, sqft: sqft.trim() || specs.sqft,
      neighborhood: [data.City, data.StateOrProvince].filter(Boolean).join(", ") || field("line-two"),
      image, images: image && !looksLikeChrome(image) ? [image] : [], sourceUrl,
      listingNumber: String(data.ListingId ?? data.MLSNumber ?? data.ListingNumber ?? ""), propertyType: String(data.PropertyType ?? "") });
  });
  return found;
}

/** Read JSON hydration, never execute scripts or accept generated property facts. */
export function listingsFromHydration(html: string, base: URL): DiscoveredListing[] {
  const nodes: unknown[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { nodes.push(JSON.parse(m[1])); } catch { /* malformed hydration */ }
  }
  const found: DiscoveredListing[] = [];
  walkLd(nodes, obj => {
    const title = obj.streetAddress ?? obj.StreetAddress ?? obj.addressLine1 ?? obj.title ?? obj.name;
    const price = obj.listPrice ?? obj.ListPrice ?? obj.CurrentPrice ?? obj.price;
    const url = obj.detailUrl ?? obj.listingUrl ?? obj.url;
    // A record must identify a property, a price and its actual detail URL.
    if (typeof title !== "string" || !price || typeof url !== "string" ||
      (!obj.streetAddress && !obj.StreetAddress && !obj.addressLine1 && !/listing|property|home|realestate/i.test(String(obj.type ?? obj["@type"] ?? url)))) return;
    const item = listingFromLd({ ...obj, "@type": "RealEstateListing", name: title, price, url,
      bedrooms: obj.bedrooms ?? obj.BedsTotal, bathrooms: obj.bathrooms ?? obj.BathsTotal,
      image: obj.images ?? obj.photos ?? obj.image }, base);
    if (item) found.push(item);
  });
  return found;
}


/** Brivity's public featured widget exposes its exact agent/office search scope.
 * Ignore the accompanying regional "new listings" widget and never use fallback inventory.
 */
export function brivityInventoryFragments(html: string, base: URL): string[] {
  if (!/cdn\d*\.brivityidx\.com\/[^"']*FeaturedProperties/i.test(html)) return [];
  const out: string[] = [];
  for (const tag of html.match(/<[^>]+\bdata-settings=["'][^>]+>/gi) ?? []) {
    try {
      const data = JSON.parse(attr(tag, "data-settings")).mlsData;
      if (!data || Number(data.agent_office_listings_only) !== 1) continue;
      const strings = (xs: unknown) => Array.isArray(xs) ? xs.map(String).filter(x => x.trim() && x.length < 100) : [];
      const agents = strings(data.mls_agent_ids), offices = strings(data.mls_office_ids);
      const mls = Array.isArray(data.mls_ids) ? data.mls_ids.map((x: { id?: unknown }) => String(x.id ?? "")).filter(Boolean) : [];
      if (!mls.length || (!agents.length && !offices.length)) continue;
      const url = new URL("/pages/search.php/", base);
      url.searchParams.set("mlsId", mls.join("|"));
      const priority = data.user_priority === "office"
        ? `office.id=${offices.join(",")}|agents.0.id=${agents.join(",")}`
        : `agents.0.id=${agents.join(",")}|office.id=${offices.join(",")}`;
      url.searchParams.set("q_prioritize", priority);
      url.searchParams.set("q_include_all", "0");
      url.searchParams.set("status", "1");
      url.searchParams.set("q_sort", String(data.sort_by || "price-"));
      url.searchParams.set("q_include_total_count", "false");
      url.searchParams.set("q_photos_available", "true");
      const types = strings(data.property_type);
      if (types.length) url.searchParams.set("propertyType", types.join("|"));
      if (data.min_price || data.max_price) url.searchParams.set("price", `${data.min_price || ""}:${data.max_price || ""}`);
      for (const [key, field] of [["city", "multi_search"], ["multi_cat", "multi_cat"]]) {
        const values = strings(data[key]); if (values.length) url.searchParams.set(field, values.join("|"));
      }
      for (const [key, field] of [["beds", "bedrooms"], ["baths", "totalBaths"], ["garage", "garageCap"], ["sqft", "sqFeet"], ["lot", "acreage"], ["year", "year"]]) {
        if (data[key]) url.searchParams.set(field, String(data[key]) + ":");
      }
      out.push(url.toString());
    } catch { /* malformed widgets cannot authorize an unscoped search */ }
  }
  return [...new Set(out)];
}

export function listingsFromBrivityResponse(html: string, base: URL): { listings: DiscoveredListing[]; count: number } | null {
  if (!/\/pages\/search\.php\/?$/.test(base.pathname) || base.searchParams.get("q_include_all") !== "0" ||
      !base.searchParams.has("q_prioritize")) return null;
  try {
    const payload = JSON.parse(html);
    if (!Array.isArray(payload.data)) return null;
    const listings: DiscoveredListing[] = [];
    const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    for (const row of payload.data) {
      if (!row || row.permissions?.displayListing === false || row.permissions?.displayAddress === false ||
          !row.address?.street || !row.blossorId || !/^[\w-]+$/.test(String(row.blossorId))) continue;
      const status = normalizeListingStatus(row.statusText || row.mlsStatus);
      if (status === "sold" || status === "off_market") continue;
      const a = row.address;
      const url = new URL(`/homes-for-sale/${String(a.state || "").toUpperCase()}/${slug(String(a.city || ""))}/${slug(String(a.zip || ""))}/${slug(a.street)}/bid-${row.blossorId}`, base).toString();
      const item = listingFromLd({ "@type": "RealEstateListing", name: a.street, price: row.price,
        url, description: row.description || row.remarks || "", bedrooms: row.bedrooms, bathrooms: row.totalBaths,
        floorSize: { value: row.sqFeet }, image: row.photos || row.main_photo,
        address: { addressLocality: a.city, addressRegion: a.state }, listingNumber: row.mlsNum, propertyType: row.propertyType }, base);
      if (item) listings.push({ ...item, status });
    }
    return { listings, count: Number(payload.count) || listings.length };
  } catch { return null; }
}


/** Read the public IDX Broker showcase's literal property fields without executing JavaScript. */
export function listingsFromIdxShowcase(script: string, base: URL): DiscoveredListing[] {
  if (!/\/idx\/customshowcasejs\.php$/.test(base.pathname) || !base.searchParams.has("widgetid")) return [];
  const starts = [...script.matchAll(/aLink\s*=\s*idx\(\s*'(<a\b[^']+)'\s*\)/g)];
  const out: DiscoveredListing[] = [];
  starts.forEach((m, i) => {
    const block = script.slice(m.index, starts[i + 1]?.index ?? script.length);
    const sourceUrl = absolutize(attr(m[1], "href"), base);
    if (!sourceUrl || !/\/idx\/details\/listing\//.test(new URL(sourceUrl).pathname)) return;
    const literal = (value: string) => decodeEntities(value.replace(/\\(['"\\])/g, "$1").replace(/\\[nr]/g, " "));
    const field = (name: string) => literal(block.match(new RegExp(`['"]IDX-showcase${name}(?:[^'"]*)['"]\\)\\s*\\.html\\(\\s*'((?:\\\\.|[^'\\\\])*)'`))?.[1] ?? "").trim();
    const title = field("Address");
    const status = normalizeListingStatus(field("Status"));
    if (status === "sold" || status === "off_market") return;
    let image = "";
    try { image = decodeURIComponent(block.match(/imgUrl\s*=\s*decodeURIComponent\(\s*["']([^"']+)/)?.[1] ?? ""); } catch { /* invalid image */ }
    const url = new URL(sourceUrl); url.searchParams.delete("widgetReferer");
    const item = listingFromLd({ "@type": "RealEstateListing", name: title, price: field("Price"), url: url.toString(),
      bedrooms: parseFloat(field("Beds")), bathrooms: parseFloat(field("Baths")), image,
      description: field("Remarks"), listingNumber: field("ListingID"), address: { addressLocality: field("City"), addressRegion: field("StateAbrv") } }, base);
    if (item) out.push({ ...item, status });
  });
  return out;
}

/** Provider-scoped detail fields avoid treating wrapper navigation or related homes as the property. */
export function listingFromIdxDetail(html: string, base: URL): DiscoveredListing | null {
  if (!/\/idx\/details\/listing\//.test(base.pathname)) return null;
  const field = (id: string) => decodeEntities(stripTags(html.match(new RegExp(`<(?:span|div|p)[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/(?:span|div|p)>`, "i"))?.[1] ?? ""));
  const part = (name: string) => decodeEntities(stripTags(html.match(new RegExp(`<span[^>]*class=["']IDX-detailsAddress${name}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i"))?.[1] ?? ""));
  const title = [part("Number"),part("Direction"),part("Name")].filter(Boolean).join(" ");
  const imageTag = (html.match(/<img\b[^>]*>/gi) ?? []).find(t => attr(t, "id") === "IDX-detailsPhoto");
  const item = listingFromLd({ "@type": "RealEstateListing", name: title, url: base.toString(), price: field("IDX-detailsPrice"),
    bedrooms: field("IDX-summaryField-bedrooms-data"), bathrooms: field("IDX-summaryField-totalBaths-data"),
    floorSize: {value: field("IDX-summaryField-sqFt-data")}, image: imageTag ? attr(imageTag, "src") : "",
    description: field("IDX-detailsDescription"), address: { addressLocality: part("City"), addressRegion: part("StateAbrv") },
    propertyType: field("IDX-field-propType").replace(/^Property Type:\s*/i,""),
    listingNumber: base.pathname.match(/\/listing\/[^/]+\/([^/]+)/)?.[1] }, base);
  return item ? { ...item, status: normalizeListingStatus(field("IDX-summaryField-propStatus-data")) } : null;
}


/** Prefer a multi-photo gallery over a single preview when both are published. */
function listingMedia(row: Record<string, unknown>): unknown {
  const pictures = row.listingPictures;
  if (typeof pictures === "string" && pictures.includes("|")) {
    const parts = pictures.split("|").map(part => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }
  const media = row.images ?? row.photos ?? row.image ?? row.previewPicture ?? row.picture ?? row.previewPictures ?? pictures ?? row.Media;
  if (typeof media === "string" && media.includes("|")) return media.split("|").map(part => part.trim()).filter(Boolean);
  return media;
}

/** Decode \\xNN escapes published in interstitial scripts. Do not execute the script. */
function decodeScriptLiterals(html: string): string {
  return html.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Published SHA-1 cookie interstitial. Structural match only — not a hostname and not a CAPTCHA. */
export function isPublishedScriptGate(html: string): boolean {
  if (html.length > 20000 && /sitePageJSON|pageJsonAndGlobalData|application\/ld\+json/i.test(html)) return false;
  const decoded = decodeScriptLiterals(html);
  return /subtle\.digest\(\s*['"]SHA-1['"]/i.test(decoded)
    && /\bnonce\s*=\s*['"][0-9a-f]{8,64}['"]/i.test(decoded)
    && /\bdifficulty\s*=\s*[1-9]\d?\b/.test(decoded)
    && /cf_pow/.test(decoded)
    && /cf_pass/.test(decoded);
}

/** Solve the page's own published proof once. Difficulty above 5 is left for a real browser. */
export async function publishedScriptGateCookie(html: string): Promise<string | null> {
  if (!isPublishedScriptGate(html)) return null;
  const decoded = decodeScriptLiterals(html);
  const nonce = decoded.match(/\bnonce\s*=\s*['"]([0-9a-f]{8,64})['"]/i)?.[1];
  const difficulty = Number(decoded.match(/\bdifficulty\s*=\s*(\d+)/)?.[1]);
  if (!nonce || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) return null;
  const expression = decoded.match(/cf_pass['"]?\s*\+\s*['"]=['"]\s*\+\s*\(([^)]+)\)/i)?.[1]
    ?? decoded.match(/cf_pass['"]?\s*\+\s*['"]=['"]\s*\+\s*['"]([^'"]+)['"]/i)?.[1];
  if (!expression) return null;
  const parts = expression.split("+").map(part => {
    const token = part.trim();
    const literal = token.match(/^['"]([^'"]*)['"]$/);
    if (literal) return literal[1];
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return "";
    return decoded.match(new RegExp(`\\b${token}\\s*=\\s*['"]([^'"]*)['"]`))?.[1] ?? "";
  });
  if (parts.some(part => !part)) return null;
  const pass = parts.join("");
  if (!/^[A-Za-z0-9._-]{8,200}$/.test(pass)) return null;
  const { createHash } = await import("node:crypto");
  const target = "7".repeat(difficulty);
  const limit = Math.min(16 ** difficulty * 8, 2_000_000);
  let solved: number | null = null;
  for (let x = 0; x < limit; x++) {
    if (createHash("sha1").update(nonce + String(x)).digest("hex").startsWith(target)) { solved = x; break; }
  }
  if (solved == null) return null;
  return `cf_pow=${solved}; cf_time=1; cf_pass=${pass}`;
}

/** A robot or challenge document, not an empty listing collection. Footer widgets are not this page. */
/**
 * A rendered document that is the renderer being refused (a WAF "Request Blocked"/"Access Denied"/403 page or
 * a challenge) rather than the page. It must never replace a readable plain response: the renderer runs from
 * other network addresses than the importer, and some sites block one but not the other.
 */
export function isBlockedRender(html: string): boolean {
  if (isRobotChallenge(html)) return true;
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  if (/^(?:request blocked|access denied|forbidden|403(?: forbidden)?|blocked|error 403|you have been blocked|sorry, you have been blocked)$/i.test(title)) return true;
  return html.length < 4000 && !/<a\b[^>]*href=/i.test(html) && /\b(?:blocked|denied|forbidden)\b/i.test(stripTags(html));
}

export function isRobotChallenge(html: string): boolean {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  if (/^robot validate$/i.test(title)) return true;
  if (/^just a moment\.\.\.$/i.test(title)) return true;
  if (/^attention required\b/i.test(title)) return true;
  if (/^client challenge$/i.test(title)) return true;
  const heading = stripTags(html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1] ?? "");
  if (/\baccess denied\b/i.test(heading) && /recaptcha|verify your are human|verify you are human/i.test(html)) return true;
  if (/<form\b[^>]*id=["'](?:challenge-form|cf-challenge)/i.test(html)) return true;
  const head = html.slice(0, 12000);
  if (/px-captcha/i.test(head) && /access to this page has been denied/i.test(title)) return true;
  return false;
}

/** Machine-readable obstacle. A footer widget or optional login form is not an obstacle. */
export function classifyObstacle(html: string, status?: number): string | null {
  if (isPublishedScriptGate(html)) return "script_gate";
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const head = html.slice(0, 12000);
  if (/^robot validate$/i.test(title.trim())) return "captcha_required";
  if (/recaptcha|hcaptcha|cf-turnstile|challenges\.cloudflare\.com/i.test(head) && /verify you are human|verify your are human|security check|human verification|access denied/i.test(head)) return "captcha_required";
  if (/px-captcha/i.test(head) && /access to this page has been denied/i.test(title)) return "captcha_required";
  if (/^just a moment\.\.\.$/i.test(title.trim()) || /^attention required\b/i.test(title.trim()) || /^client challenge$/i.test(title.trim())) return "requires_rendering";
  if (status === 429 || /\btoo many requests\b/i.test(title)) return "rate_limited";
  if (status === 401) return "authentication_required";
  if (status === 403 && !isRobotChallenge(html)) return "access_denied";
  if (typeof status === "number" && status >= 500 && status <= 599) return "temporarily_unavailable";
  if (/<form\b[^>]*id=["'](?:challenge-form|cf-challenge)/i.test(html)) return "requires_rendering";
  if (/awsWafCookieDomainList|window\.gokuProps\b/.test(html)) return "requires_rendering";
  if (/^(?:\s*sign in|\s*log ?in)(?:\s*[|—-]|\s*$)/i.test(title) && /<input\b[^>]*type=["']password["']/i.test(head)) return "authentication_required";
  return null;
}

/** Public CSRF tokens only. Ignore short or secret-looking values that are not page-published. */
export function csrfTokenFromHtml(html: string): string | undefined {
  const tag = html.match(/<meta\b[^>]*(?:name|id)=["'](?:csrf-token|_csrf)["'][^>]*>/i)?.[0];
  if (!tag) return;
  const token = attr(tag, "content");
  if (!/^[A-Za-z0-9._~+/-]{16,200}$/.test(token)) return;
  return token;
}

/**
 * Rank platform families from structural evidence. Customer hostnames are not signals.
 * Several candidates may stay until a strategy actually extracts records.
 */
export function architectureCandidates(html: string, base?: URL): { id: string; confidence: number; evidence: string }[] {
  const text = html.slice(0, 200_000);
  const host = base?.hostname ?? "";
  const hits: { id: string; confidence: number; evidence: string }[] = [];
  const add = (id: string, confidence: number, evidence: string) => {
    const found = hits.find(row => row.id === id);
    const score = Math.round(Math.min(0.99, confidence) * 100) / 100;
    if (!found) hits.push({ id, confidence: score, evidence });
    else if (score > found.confidence) { found.confidence = score; found.evidence = evidence; }
  };
  const loftyHost = /static\.chimeroi\.com|cdn\.chime\.me/i.test(text);
  const loftyState = /sitePageJSON|pageJsonAndGlobalData/i.test(text);
  const loftySource = /listingSource["']?\s*[:=]/i.test(text);
  if (loftyHost || loftyState || loftySource) add("lofty_chime", (loftyHost ? 0.56 : 0) + (loftyState ? 0.28 : 0) + (loftySource ? 0.16 : 0), [loftyHost && "chime-asset-host", loftyState && "site-page-json", loftySource && "listing-source"].filter(Boolean).join(","));
  if (/wp-content\/|wp-includes\/|\/wp-json\/|name=["']generator["'][^>]*content=["']WordPress/i.test(text)) add("wordpress", 0.9, "wordpress-assets");
  if (/squarespace\.com|squarespace-cdn|static1\.squarespace/i.test(text)) add("squarespace", 0.9, "squarespace-assets");
  if (/wixstatic\.com|static\.parastorage\.com/i.test(text)) add("wix", 0.88, "wix-assets");
  if (/data-wf-site|website-files\.com/i.test(text)) add("webflow", 0.9, "webflow-marker");
  if (/data-price\s*=\s*["']\d/i.test(text) && /data-(?:address|pl-navigate-url|listing-url)\s*=/i.test(text)) add("placester_valhalla", 0.9, "attribute-property-tiles");
  if (/static\.dune\.|data-dune-site|dune-embed/i.test(text)) add("dune", 0.8, "dune-marker");
  if (/idxbroker|idx-broker|customshowcasejs\.php|idxwidgetsrc-/i.test(text)) add("idx_broker", 0.9, "idx-broker-widget");
  if (/ihomefinder|idxhome\.com|ihfKestrel|ihf-main-container/i.test(text) || host === "www.idxhome.com") add("ihomefinder", 0.9, "ihomefinder-widget");
  if (/showcaseidx|showcase-idx/i.test(text)) add("showcase_idx", 0.88, "showcase-idx");
  if (/realtyna|\/plugins\/realtyna|wpl-listing/i.test(text)) add("realtyna", 0.86, "realtyna-plugin");
  if (/(?:^|\.)flexmls\.com$/i.test(host) || /flexmls\.com/i.test(text)) add("flexmls", 0.93, "flexmls-transport");
  if (/brivityidx|FeaturedProperties-1R/i.test(text)) add("brivity", 0.9, "brivity-widget");
  if (/kvcore|kvcorecdn/i.test(text)) add("kvcore", 0.86, "kvcore");
  if (/boomtownroi|bt-idx/i.test(text)) add("boomtown", 0.84, "boomtown");
  if (/realgeeks|real-geeks/i.test(text)) add("real_geeks", 0.86, "realgeeks");
  if (/__NEXT_DATA__|_next\/static/i.test(text)) add("next", 0.92, "next-hydration");
  if (/__NUXT__|_nuxt\//i.test(text)) add("nuxt", 0.92, "nuxt-state");
  if (/data-reactroot|react-dom/i.test(text)) add("generic_react", 0.62, "react-runtime");
  if (/data-v-app|vue\.runtime/i.test(text)) add("generic_vue", 0.6, "vue-runtime");
  if (/customElements\.define|shadowrootmode/i.test(text)) add("generic_web_component", 0.48, "web-component");
  if (!/<script\b[^>]*\bsrc\s*=/i.test(text) && /<(?:article|a)\b/i.test(text)) add("static_html", 0.35, "server-rendered-html");
  return hits.filter(row => row.confidence >= 0.35).sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

/** Lofty/Chime public search transport. listingSource is the published inventory scope.
 * The same markers apply on any customer domain that ships this shell.
 * featureListingName and listingType are the client's own split of that scope.
 * An unscoped "all listings" source is the market, not the agent's collection.
 */
export function chimeListingSearchRequests(html: string, base: URL): string[] {
  return documentOnce(html, `chimeRequests|${base.href}`, () => chimeListingSearchRequestsOf(html, base)).slice();
}

function chimeListingSearchRequestsOf(html: string, base: URL): string[] {
  if (!/static\.chimeroi\.com|cdn\.chime\.me|sitePageJSON|pageJsonAndGlobalData/i.test(html)) return [];
  const sources = new Set<string>();
  for (const match of decodeScriptLiterals(html).matchAll(/listingSource["']?\s*[:=]\s*["']([^"']+)["']/g)) {
    const source = match[1].trim();
    if (/^(?:\d+\+[A-Za-z0-9_+-]+|sold listings|only my listings|only team listings|single property promotion)$/i.test(source)) sources.add(source);
  }
  return [...sources].flatMap(source => {
    const lower = source.toLowerCase();
    // Sold history and the unscoped market are not an active collection.
    if (lower === "all listings" || lower === "sold listings") return [];
    const url = new URL("/api-site/search/realTimeListings", base.origin);
    url.searchParams.set("listingSource", source);
    const named = !["sold listings", "single property promotion"].includes(lower);
    const featureListingName = named ? source.replace(/^\d\+/, "").replace(/\+/g, " ").trim() : "";
    if (featureListingName) url.searchParams.set("featureListingName", featureListingName);
    const listingType = lower === "sold listings" ? "sold-listing" : lower === "single property promotion" ? "single-property-promotion" : "featured-listing";
    url.searchParams.set("listingType", listingType);
    url.searchParams.set("page", "1");
    url.searchParams.set("pageSize", "100");
    return [url.toString()];
  });
}

/** Common public data transport, including RESO-style property fields.
 * URLs must be present in the record; never manufacture provider endpoints or detail URLs.
 */
/** A sold or closed feed is history, not the active collection. */
function historicalInventoryUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const type = (url.searchParams.get("listingType") || "").toLowerCase();
    const source = (url.searchParams.get("listingSource") || "").toLowerCase();
    if (type.includes("sold") || source === "sold listings") return true;
    return /\/sold-listing(?:\/|$)|\/recently-sold(?:\/|$)|\/just-sold(?:\/|$)/i.test(url.pathname);
  } catch {
    return /sold-listing|recently-sold/i.test(raw);
  }
}

function historicalListing(item: Pick<DiscoveredListing, "status" | "sourceStatus" | "sourceUrl">): boolean {
  return item.status === "sold" || item.status === "off_market" || item.sourceStatus === "sold" || item.sourceStatus === "closed" || historicalInventoryUrl(item.sourceUrl);
}

function soldContext(html: string, index: number, anchor: string): boolean {
  if (/\bhouse-sold\b/i.test(html.slice(Math.max(0, index - 500), index) + anchor)) return true;
  const headings = [...html.slice(Math.max(0, index - 6000), index).matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  const title = stripTags(headings.at(-1)?.[1] ?? "");
  if (!title || /\b(?:featured|for sale|active)\b/i.test(title)) return false;
  return /\b(?:recently sold|sold homes|sold listings|just sold|closed sales)\b/i.test(title);
}
function completeSearchGroups(payload: unknown, base: URL): DiscoveredListing[] {
  const nearby = /^(?:nearby|recommended|similar|related|discover)/i;
  const groups: DiscoveredListing[][] = [];
  const walk = (node: unknown, key: string) => {
    if (!node || typeof node !== "object" || Array.isArray(node) || nearby.test(key)) return;
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.data) && typeof obj.totalItems === "number") {
      const rows: DiscoveredListing[] = [];
      for (const item of obj.data) {
        if (!item || typeof item !== "object") continue;
        const listing = (item as Record<string, unknown>).listing;
        if (!listing || typeof listing !== "object") continue;
        const record = listing as Record<string, unknown>;
        const schemas: Record<string, unknown>[] = [];
        const structured = record.structuredData && typeof record.structuredData === "object" ? record.structuredData as Record<string, unknown> : record;
        for (const value of Object.values(structured)) {
          if (typeof value !== "string" || !value.includes('"@type"')) continue;
          try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) schemas.push(parsed as Record<string, unknown>);
          } catch { /* not an embedded schema record */ }
        }
        let built: DiscoveredListing | null = null;
        for (const schema of schemas) {
          const row = listingFromLd(schema, base);
          const geo = schema.geo && typeof schema.geo === "object" ? schema.geo as Record<string, unknown> : undefined;
          const coords = geo && (typeof geo.latitude === "string" || typeof geo.latitude === "number") && (typeof geo.longitude === "string" || typeof geo.longitude === "number")
            ? `${geo.latitude}, ${geo.longitude}`.slice(0, 80) : "";
          if (row) {
            const facts = coords ? { ...(row.facts ?? {}), Coordinates: coords } : { ...(row.facts ?? {}) };
            if (!built) built = { ...row, facts };
            else {
              const current: DiscoveredListing = built;
              built = { ...current, title: current.title.length >= row.title.length ? current.title : row.title, price: current.price || row.price,
                description: current.description.length >= row.description.length ? current.description : row.description,
                neighborhood: current.neighborhood || row.neighborhood, facts: { ...facts, ...(current.facts ?? {}) } };
            }
          } else if (coords && built) {
            const current: DiscoveredListing = built;
            const currentFacts = current.facts ?? {};
            built = { ...current, facts: { ...currentFacts, Coordinates: currentFacts.Coordinates || coords }, neighborhood: current.neighborhood || neighborhoodFrom(schema) };
          }
        }
        const subtitle = Array.isArray(record.subtitles) ? record.subtitles.find((value): value is string => typeof value === "string" && /[A-Za-z]/.test(value)) : undefined;
        const link = typeof record.pageLink === "string" ? record.pageLink : typeof record.navigationPageLink === "string" ? record.navigationPageLink : "";
        if (!built && subtitle && link && typeof record.title === "string" && /\$\s?\d/.test(record.title)) {
          built = listingFromLd({ "@type": "RealEstateListing", name: subtitle.split(",")[0], url: link, price: record.title }, base);
        }
        if (!built) continue;
        const abs = link ? absolutize(link, base) : null;
        if (abs) built = { ...built, sourceUrl: abs };
        if (subtitle) {
          const street = subtitle.split(",")[0].trim();
          const rest = subtitle.split(",").slice(1).join(",").trim();
          if (street) built = { ...built, title: street.slice(0, 160), neighborhood: built.neighborhood || rest.slice(0, 120) };
        }
        if (Array.isArray(record.media)) {
          const images = distinctPropertyImages(record.media.flatMap(media => {
            if (!media || typeof media !== "object") return [];
            const raw = (media as Record<string, unknown>).originalUrl ?? (media as Record<string, unknown>).url;
            const image = typeof raw === "string" ? absolutize(raw, base) : null;
            return image && !looksLikeChrome(image) ? [image] : [];
          }));
          if (images.length) built = { ...built, images, image: images[0] };
        }
        if (Array.isArray(record.subStats)) {
          const specs: Record<string, unknown> = {};
          let acres = "";
          for (const stat of record.subStats) {
            if (!stat || typeof stat !== "object") continue;
            const label = String((stat as Record<string, unknown>).title ?? "").toLowerCase();
            const value = String((stat as Record<string, unknown>).subtitle ?? "");
            if (!/\d/.test(value) || value.trim() === "-") continue;
            if (label === "beds") specs.bedrooms = value;
            if (label === "baths") specs.bathrooms = value;
            if (label === "sqft") specs.floorSize = { value };
            if (label === "acres") acres = value.replace(/[^\d.]/g, "");
          }
          const parsed = specsFrom(specs);
          built = { ...built, beds: parsed.beds || built.beds, baths: parsed.baths || built.baths, sqft: parsed.sqft || built.sqft,
            facts: acres ? { ...built.facts, "Lot Acres": acres } : built.facts };
        }
        if (/\/\d+k-price\/?$/i.test(new URL(built.sourceUrl).pathname) || /homes for sale under\b/i.test(built.title)) continue;
        if (built.price || built.beds) rows.push(built);
      }
      if (rows.length && rows.length === obj.totalItems) groups.push(rows);
    }
    for (const [childKey, child] of Object.entries(obj)) if (child && typeof child === "object") walk(child, childKey);
  };
  walk(payload, "");
  const seen = new Set<string>();
  return groups.flat().filter(row => seen.has(row.sourceUrl) ? false : (seen.add(row.sourceUrl), true));
}

export function listingsFromPublicJson(text: string, base: URL): DiscoveredListing[] {
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return []; }
  const scoped = completeSearchGroups(payload, base);
  if (scoped.length) return scoped;
  const out: DiscoveredListing[] = [];
  walkLd([payload], row => {
    const address = row.address && typeof row.address === "object" ? row.address as Record<string, unknown> : {};
    const street = row.UnparsedAddress ?? row.streetAddress ?? row.StreetAddress ?? row.addressLine1 ??
      (typeof row.address === "string" ? row.address : address.streetAddress);
    const rawUrl = row.detailUrl ?? row.detailLink ?? row.listingUrl ?? row.url ?? row.URL;
    if (typeof street !== "string" || typeof rawUrl !== "string" || !street.trim()) return;
    const media = listingMedia(row);
    const images = Array.isArray(media) ? media.map(value => typeof value === "object" && value ?
      (value as Record<string, unknown>).MediaURL ?? (value as Record<string, unknown>).url : value) : media;
    const item = listingFromLd({ "@type": "RealEstateListing", name: street,
      price: row.ListPrice ?? row.listPrice ?? row.CurrentPrice ?? row.price, url: rawUrl,
      description: row.PublicRemarks ?? row.description ?? row.remarks ?? row.detailsDescribe ?? "",
      bedrooms: row.BedroomsTotal ?? row.BedsTotal ?? row.bedrooms ?? row.beds,
      bathrooms: row.BathroomsTotalInteger ?? row.BathsTotal ?? row.totalBaths ?? row.bathrooms ?? row.baths,
      floorSize: {value: row.LivingArea ?? row.sqFeet ?? row.sqft ?? row.squareFeet}, image: images,
      address: { addressLocality: row.City ?? row.city ?? address.city ?? address.addressLocality,
        addressRegion: row.StateOrProvince ?? row.state ?? address.state ?? address.addressRegion },
      listingNumber: row.ListingId ?? row.MLSNumber ?? row.mlsNumber ?? row.mlsListingId ?? row.mlsid ?? row.listingNumber,
      propertyType: row.PropertyType ?? row.propertyType }, base);
    const rawStatus = row.StandardStatus ?? row.statusText ?? row.listingStatusText ?? row.listingStatus ?? row.mlsStatus ?? row.statusOrigin ?? row.status;
    const sourceStatus = sourceListingStatus(rawStatus);
    const identified = row.ListingId ?? row.MLSNumber ?? row.mlsNumber ?? row.mlsListingId ?? row.mlsid ?? row.listingNumber ?? row.slug ?? row.id;
    if (!item && typeof street === "string" && street.trim() && typeof rawUrl === "string" && identified) {
      const sourceUrl = canonicalListingUrl(absolutize(rawUrl, base) ?? "");
      if (sourceUrl) out.push({ title: street.trim().slice(0, 160), description: "", price: "", beds: 0, baths: 0, sqft: "", neighborhood: "", image: "", images: [], sourceUrl, status: normalizeListingStatus(rawStatus), ...(sourceStatus !== "unspecified" ? { sourceStatus } : {}) });
      return;
    }
    if (item) {
      const facts = { ...item.facts };
      if (typeof row.agentName === "string" && row.agentName.trim()) facts["Listing Agent"] = row.agentName.trim().slice(0, 200);
      if (typeof row.agentOrganizationName === "string" && row.agentOrganizationName.trim()) facts["Brokerage"] = row.agentOrganizationName.trim().slice(0, 200);
      const acres = row.lotSizeAcres ?? row.totalAvailableAcres;
      if (typeof acres === "number" || typeof acres === "string") {
        const n = typeof acres === "number" ? acres : parseFloat(acres);
        // Some listing payloads publish lot area in square feet under an acres label.
        // Integers at or above a tenth-acre in square feet match that shape; smaller numbers stay acres.
        if (Number.isFinite(n) && n > 0) facts["Lot Acres"] = String(Math.round((n >= 4000 ? n / 43560 : n) * 100) / 100);
      }
      if ((typeof row.latitude === "number" || typeof row.latitude === "string") && (typeof row.longitude === "number" || typeof row.longitude === "string")) facts["Coordinates"] = `${row.latitude}, ${row.longitude}`.slice(0, 80);
      const year = Number(row.builtYear ?? row.yearBuilt ?? row.YearBuilt);
      if (year >= 1700 && year <= 2100) facts["Year Built"] = String(year);
      if (Array.isArray(row.openHouseScheduleList) && row.openHouseScheduleList.length) facts["Open House"] = JSON.stringify(row.openHouseScheduleList).slice(0, 400);
      out.push({ ...item, facts, status: normalizeListingStatus(rawStatus), ...(sourceStatus !== "unspecified" ? { sourceStatus } : {}) });
    }
  });
  // JSON-LD APIs may identify a property with name/type instead of streetAddress.
  if (!out.length) return listingsFromJsonLd('<script type="application/ld+json">'+text+'</script>', base);
  return out;
}


/** Public Kestrel widget requests: retain featured scope and never use a general MLS search. */
export function kestrelInventoryRequests(html: string): { url: string; activationToken: string }[] {
  return documentOnce(html, "kestrelRequests", () => kestrelInventoryRequestsOf(html)).map(request => ({ ...request }));
}

function kestrelInventoryRequestsOf(html: string): { url: string; activationToken: string }[] {
  if (!/kestrel\.idxhome\.com\/ihf-kestrel\.js/i.test(html)) return [];
  const raw = html.match(/ihfKestrel\.config\s*=\s*(\{[^;]+\})\s*;/)?.[1];
  let activationToken = "";
  try { activationToken = JSON.parse(raw ?? "{}").activationToken ?? ""; } catch { return []; }
  if (!/^[a-z0-9-]{20,80}$/i.test(activationToken)) return [];
  for (const m of html.matchAll(/ihfKestrel\.render\((\{[^;]+?\})\)/g)) {
    let widget: Record<string, unknown>; try { widget = JSON.parse(m[1]); } catch { continue; }
    if (!(widget.featured === true && widget.component === "listingSearchWidget" || widget.component === "gallerySliderWidget" && widget.featured !== false && !widget.id)) continue;
    const u = new URL("https://www.idxhome.com/api/kestrel/listings.json");
    u.searchParams.set("featuredOnlyYn", "true"); u.searchParams.set("status", "active");
    u.searchParams.set("limit", "100"); u.searchParams.set("context", "RESULT");
    if (typeof widget.sort === "string") u.searchParams.set("sort", widget.sort);
    for (const [key, value] of Object.entries({cityId:widget.cityIds,zip:widget.zip,propertyType:widget.propertyType}))
      if (value != null) u.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
    return [{url:u.toString(), activationToken}];
  }
  return [];
}

/** This public widget token must never travel to another provider or redirect target. */
export function publicListingRequestHeaders(uri: URL, options?: { activationToken?: string }): Record<string,string> {
  if (!options?.activationToken) return {};
  if (uri.hostname !== "www.idxhome.com" || !(uri.pathname === "/api/kestrel/listings.json" && uri.searchParams.get("featuredOnlyYn") === "true" || /^\/api\/kestrel\/listing\/[a-z0-9_-]+\.json$/i.test(uri.pathname) && uri.searchParams.get("context") === "DETAIL")) throw new Error("Unexpected public listing endpoint.");
  return {"X-Activation-Token":options.activationToken,"X-Https-Urls":"true"};
}

/** Decode exactly the public transport used by ihf-kestrel.js; no account/session credentials. */
export async function decodePublicListingResponse(text: string, contentType: string, uri: URL, options?: {activationToken?:string}): Promise<string> {
  if (!/^application\/base64/i.test(contentType)) return text;
  publicListingRequestHeaders(uri,options);
  if (!options?.activationToken) throw new Error("Unknown encoded listing response.");
  const {createDecipheriv} = await import("node:crypto");
  const bytes = Uint8Array.from(atob(text.trim()), c=>c.charCodeAt(0));
  const decoder = createDecipheriv("aes-128-ecb",Uint8Array.from([111,87,76,114,66,90,108,122,52,84,103,114,78,121,100,104]),new Uint8Array(0));
  const first=decoder.update(bytes),last=decoder.final(); const joined=new Uint8Array(first.length+last.length);
  joined.set(first);joined.set(last,first.length); const result=new TextDecoder().decode(joined);
  JSON.parse(result); return result;
}

export function listingsFromKestrel(text: string, base: URL): DiscoveredListing[] {
  if (base.hostname!=="www.idxhome.com" || !/^\/api\/kestrel\/(?:listings|listing\/[a-z0-9_-]+)\.json$/i.test(base.pathname)) return [];
  let rows: unknown; try {rows=JSON.parse(text);} catch{return [];}
  if (!Array.isArray(rows)) rows = rows && typeof rows === "object" ? [rows] : [];
  return (rows as Record<string,any>[]).flatMap(row=>{
    if (!row || !["RESULT","DETAIL"].includes(row.context) || row.featured!==true || row.statusId!=="active" || !row.listingPageUrl || !row.listPrice) return [];
    const sourceUrl=absolutize(row.listingPageUrl,base); if (!sourceUrl) return [];
    const title=String(row.address??"").split(/\\n|\n/)[0].trim(); if (!title) return [];
    const images=(row.images??[]).map((img:{url?:string})=>absolutize(img.url??"",base)).filter((u:string|null)=>u&&!looksLikeChrome(u));
    return [{title,sourceUrl,price:priceFrom({price:row.listPrice}),description:String(row.description??""),beds:Number(row.bedrooms??0),
      baths:Number(row.fullBathrooms??0)+Number(row.partialBathrooms??0)*0.5,sqft:row.squareFeet?String(row.squareFeet):"",
      neighborhood:[row.city,row.state].filter(Boolean).join(", "),image:images[0]??"",images:images.slice(0,500),status:"active" as const,
      listingNumber:String(row.listingNumber??""),propertyType:String(row.propertyTypeLabel??"")}];
  });
}

/** Balanced JSON object literals; never evaluate third-party script code. */
function jsonObjectAfter(html: string, marker: RegExp): Record<string,unknown> | null {
  const m=marker.exec(html);if(!m)return null;const start=(m.index??0)+m[0].length-1;
  let depth=0,quoted=false,escape=false;
  for(let i=start;i<html.length;i++){const c=html[i];if(quoted){if(escape)escape=false;else if(c==="\\")escape=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;else if(c==="{")depth++;else if(c==="}"&&!--depth){try{return JSON.parse(html.slice(start,i+1));}catch{return null;}}}
  return null;
}

/** Primary listing embedded in a Lofty/Chime page assignment. Not recommended-card neighbors. */
export function listingFromChimeDetail(html: string, base: URL): DiscoveredListing | null {
  if (!/sitePageJSON\s*=\s*\{/.test(html)) return null;
  const data = jsonObjectAfter(html, /sitePageJSON\s*=\s*\{/);
  const modules = data && Array.isArray(data.modules) ? data.modules as Record<string, unknown>[] : [];
  for (const entry of modules) {
    const dataRecord = entry.data && typeof entry.data === "object" ? entry.data as Record<string, unknown> : undefined;
    const listingDetail = dataRecord?.listingDetail && typeof dataRecord.listingDetail === "object" ? dataRecord.listingDetail as Record<string, unknown> : undefined;
    const info = listingDetail?.info;
    if (!info || typeof info !== "object") continue;
    return listingsFromPublicJson(JSON.stringify(info), base)[0] ?? null;
  }
  return null;
}


/** dsIDXpress detail fields are property-scoped, unlike recommendation cards or prose. */
export function listingFromDsidxDetail(html:string,base:URL):DiscoveredListing|null{
  if(!/\/idx\/mls-/.test(base.pathname)||!html.includes('id="dsidx-primary-data"'))return null;
  const meta=(name:string)=>{for(const tag of html.match(/<meta\b[^>]*>/gi)??[])if((attr(tag,"property")||attr(tag,"name"))===name)return attr(tag,"content");return "";};
  const image=absolutize(meta("og:image"),base)??"";
  const item:DiscoveredListing={title:meta("og:title")||decodeEntities(stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??"")),price:"",description:"",beds:0,baths:0,sqft:"",neighborhood:"",image,images:image?[image]:[],sourceUrl:base.toString()};
  const field=(name:string)=>decodeEntities(stripTags(html.match(new RegExp('data-dsidx=["\\\']'+name+'["\\\'][^>]*>([\\s\\S]*?)<\\/(?:span|td|b)>',"i"))?.[1]??""));
  const price=field("Price").match(/\$[\d,.]+/)?.[0];if(!price)return null;
  return {...item,price,beds:Number(field("Beds")),baths:Number(field("Baths")),sqft:field("ImprovedSqFt"),description:field("Description"),status:normalizeListingStatus(field("Status")),listingNumber:base.pathname.match(/\/mls-(\d+-\d+)-/)?.[1]??"",propertyType:field("Property Type")};
}

export function listingsFromMoxi(html: string, base: URL): DiscoveredListing[] {
  const data=jsonObjectAfter(html,/\blisting_detail\s*:\s*\{/); const out:DiscoveredListing[]=[];
  if(data && data.location && data.list_price && data.url_slug){
    const loc=data.location as Record<string,unknown>;
    const images=(Array.isArray(data.images)?data.images:[]).map((img:Record<string,unknown>)=>absolutize(String(img.full_url??img.gallery_url??""),base)).filter((u):u is string=>!!u&&!looksLikeChrome(u));
    // Some Moxi detail payloads call this 'image' instead of 'images'.
    if(!images.length) for(const tag of html.match(/<img\b[^>]*>/gi)??[]){if(!/Property Photo:/i.test(attr(tag,"alt")))continue;const u=absolutize(attr(tag,"data-src")||attr(tag,"src"),base);if(u&&!images.includes(u))images.push(u);}
    const sourceUrl=absolutize("/listing"+String(data.url_slug),base);
    if(sourceUrl)out.push({title:String(loc.address??""),description:String(data.comments??""),price:priceFrom({price:data.list_price}),beds:Number(data.bedrooms??0),baths:Number(data.bathrooms??0),sqft:String(data.sqr_footage??data.living_area??""),neighborhood:[loc.city,loc.state].filter(Boolean).join(", "),image:images[0]??"",images:images.slice(0,500),sourceUrl,status:normalizeListingStatus(data.status_name_for_view??data.status),listingNumber:String(data.mlsnumber??""),propertyType:String(data.property_type??"")});
    return out;
  }
  for(const m of html.matchAll(/<a\b[^>]*class=["'][^"']*linktooverlay[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const b=m[1],sourceUrl=absolutize(attr(m[0].split(">")[0]+">","href"),base);if(!sourceUrl)continue;
    const field=(name:string)=>decodeEntities(stripTags(b.match(new RegExp('class=["\\\'][^"\\\']*'+name+'[^"\\\']*["\\\'][^>]*>([\\s\\S]*?)<\\/div>',"i"))?.[1]??""));
    const title=field("single-listing-address"),price=field("single-listing-img-price").match(/\$[\d,.]+/)?.[0]??"";
    if(!title||!price)continue;
    const image=absolutize(attr(b.match(/<[^>]*\bdata-bg=["'][^>]*>/i)?.[0]??"","data-bg"),base)??"";
    const status=normalizeListingStatus(b.match(/class=["']status-label["'][^>]*>([^<]+)/i)?.[1]);
    out.push({title,sourceUrl,price,description:field("single-listing-comments"),...specsFrom({},decodeEntities(stripTags(b))),neighborhood:"",image,images:image?[image]:[],status,listingNumber:field("single-listing-mlsnumber").replace(/^MLS#?\s*/i,"")});
  }
  return out;
}

export type ListingInterfaceAdapter = {
  id: string;
  matches: (html: string, url: URL) => boolean;
  extract: (html: string, url: URL) => DiscoveredListing[];
  fragments?: (html: string, url: URL) => string[];
};

/** Reusable transport/platform adapters. No customer domains or inventory IDs belong here. */
export const LISTING_INTERFACE_ADAPTERS: ListingInterfaceAdapter[] = [
  {id:"moxiworks",matches:h=>/moxiworks|listing_detail\s*:|linktooverlay/.test(h),extract:listingsFromMoxi},
  {id:"ihomefinder",matches:(h,u)=>/kestrel\.idxhome\.com|ihfKestrel/.test(h)||u.hostname==="www.idxhome.com",extract:listingsFromKestrel},
  {id:"agentfire-dsidx",matches:h=>/cbw-slider-listing|agentfire-listing-v3|data-dsidx\s*=|id=["']dsidx-primary-data/.test(h),extract:(h,u)=>{const detail=listingFromDsidxDetail(h,u);return detail?[detail]:listingsFromCards(h,u);}},
  { id: "idx-broker", matches: (h,u) => /\/idx\/(?:customshowcasejs\.php|details\/listing\/)/.test(u.pathname) || /idxwidgetsrc-|customshowcasejs\.php/.test(h),
    extract: (h,u) => { const rows=listingsFromIdxShowcase(h,u); const detail=listingFromIdxDetail(h,u); return rows.length ? rows : detail ? [detail] : []; },
    fragments: (h,u) => (h.match(/<script\b[^>]*>/gi) ?? []).flatMap(tag => { const url=absolutize(attr(tag,"src"),u);
      return url && /\/idx\/customshowcasejs\.php$/.test(new URL(url).pathname) && /^\d+$/.test(new URL(url).searchParams.get("widgetid") ?? "") ? [url] : []; }) },
  { id: "brivity", matches: (h,u) => /brivityidx\.com|FeaturedProperties-1R/.test(h) || /\/pages\/search\.php\/?$/.test(u.pathname),
    extract: (h,u) => listingsFromBrivityResponse(h,u)?.listings ?? [], fragments: brivityInventoryFragments },
  { id: "flexmls", matches: (h,u) => /(?:^|\.)flexmls\.com$/i.test(u.hostname), extract: listingsFromStructuredCards },
  { id: "public-json", matches: h => /^[\s]*[\[{]/.test(h), extract: listingsFromPublicJson },
  { id: "structured-property-data", matches: h => /application\/(?:ld\+json|json)/i.test(h),
    extract: (h,u) => [...listingsFromJsonLd(h,u), ...listingsFromHydration(h,u)] },
];

export function detectListingInterfaces(html: string, base: URL): string[] {
  return LISTING_INTERFACE_ADAPTERS.filter(a => documentMatches(a.id, a.matches, html, base)).map(a => a.id);
}

export type StrategyAttempt = {
  id: string; version: number; evidence: string; outcome: "extracted" | "empty" | "error"; records: number;
};
export type CompatibilityPage = {
  url: string; rendering: "response" | "rendered-dom"; interfaces: string[];
  navigation: string[]; attempts: StrategyAttempt[];
  resolution: "known-pattern" | "navigation-only" | "needs-strategy" | "excluded-market" | "external-normalizer" | "requires-rendering";
};
export type ExtractionStrategy = {
  id: string; version: number; phase: "specialized" | "merge" | "fallback";
  /** Observable contract, not a realtor name or a successful URL. */
  evidence: string; rationale: string;
  matches: ListingInterfaceAdapter["matches"]; extract: ListingInterfaceAdapter["extract"];
};

const PLATFORM_CONTRACTS: Record<string, [string, string]> = {
  moxiworks: ["Moxi listing_detail literals or linktooverlay cards", "Read scoped cards and lazy photos; prefer the published active collection."],
  ihomefinder: ["Kestrel widget configuration or public idxhome response", "Use published featured filters and public transport; reject market and inactive records."],
  "agentfire-dsidx": ["AgentFire cards or dsIDXpress explicit property fields", "Property-local fields preserve identity and avoid neighboring cards and price history."],
  "idx-broker": ["IDX showcase script or IDX detail route", "Parse literal widget facts without executing JavaScript; showcase is partial inventory."],
  brivity: ["Brivity featured widget or scoped search response", "Retain published agent/office filters and display permissions."],
  flexmls: ["Public Flexmls server-rendered listing cards", "Preserve collection scope and per-card payloads through public fragments."],
  "public-json": ["JSON object/array containing evidenced property records", "Normalize RESO and common property fields independent of CMS or framework."],
};

/** Ordered, versioned executable library. Add contracts and replay cases together. */
export const LISTING_EXTRACTION_STRATEGIES: ExtractionStrategy[] = [
  { id: "flexmls-detail", version: 1, phase: "specialized", evidence: "data-map--ldp-listing payload on public Flexmls",
    rationale: "Match the exact listing key before attaching public photos and remarks.",
    matches: (h,u) => /(?:^|\.)flexmls\.com$/i.test(u.hostname) && /data-map--ldp-listing/.test(h),
    extract: (h,u) => { const row = listingFromFlexmlsDetail(h,u); return row ? [row] : []; } },
  ...LISTING_INTERFACE_ADAPTERS.filter(a => a.id !== "structured-property-data").map(a => ({
    id: a.id, version: 1, phase: "specialized" as const,
    evidence: PLATFORM_CONTRACTS[a.id][0], rationale: PLATFORM_CONTRACTS[a.id][1], matches: a.matches, extract: a.extract,
  })),
  { id: "structured-cards", version: 1, phase: "specialized", evidence: "data-href listing/property cards",
    rationale: "Per-card payload boundaries work across server-rendered frameworks.",
    matches: h => /data-href/i.test(h), extract: listingsFromStructuredCards },
  { id: "attribute-cards", version: 1, phase: "specialized", evidence: "Repeated elements with data-price, an address, and a property URL",
    rationale: "Attribute tiles identify a property when the price is not written inside the anchor.",
    matches: h => /data-price\s*=/i.test(h) && /data-(?:address|pl-navigate-url|navigate-url|listing-url)\s*=/i.test(h),
    extract: listingsFromAttributeCards },
  { id: "json-ld", version: 1, phase: "merge", evidence: "application/ld+json script",
    rationale: "Schema property records are portable across CMSs; merge complementary card evidence.",
    matches: h => /application\/ld\+json/i.test(h), extract: listingsFromJsonLd },
  { id: "json-hydration", version: 1, phase: "merge", evidence: "application/json script",
    rationale: "Read inert property data regardless of Next.js, Nuxt or custom framework branding.",
    matches: h => /application\/json/i.test(h), extract: listingsFromHydration },
  { id: "property-cards", version: 1, phase: "merge", evidence: "HTML anchors or property card containers",
    rationale: "Bound each extraction to its property, preventing facts from leaking between cards.",
    matches: h => /<(?:a|div|article|li)\b/i.test(h), extract: listingsFromCards },
  { id: "property-meta", version: 1, phase: "fallback", evidence: "Property detail metadata",
    rationale: "Use metadata only when stronger readers found no records and the page evidences a property.",
    matches: h => /<meta\b/i.test(h), extract: (h,u) => { const row = listingFromMeta(h,u); return row ? [row] : []; } },
];

export function describeListingArchitecture(html: string, base: URL, rendering: CompatibilityPage["rendering"] = "response"): CompatibilityPage {
  const navigation: string[] = [];
  if (collectInventoryLinks(html, base).length) navigation.push("inventory-links");
  if (/<(?:iframe|embed|turbo-frame)\b/i.test(html)) navigation.push("embedded-page");
  if (/<form\b/i.test(html)) navigation.push("form-navigation");
  if (collectInventoryFragments(html, base).length) navigation.push("public-fragment");
  if (kestrelInventoryRequests(html).length) navigation.push("featured-widget-api");
  if (paginationLinks(html, base).length) navigation.push("observed-pagination");
  return { url: base.toString(), rendering, interfaces: detectListingInterfaces(html, base), navigation,
    attempts: [], resolution: navigation.length ? "navigation-only" : "needs-strategy" };
}

/** Recognize unsupported dynamic providers without pretending their data was read. */
function dynamicInterfaceHint(html: string): string | undefined {
  return documentOnce(html, "dynamicHint", () => dynamicInterfaceHintOf(html));
}

function dynamicInterfaceHintOf(html: string): string | undefined {
  if (/static\.chimeroi\.com|cdn\.chime\.me|sitePageJSON|pageJsonAndGlobalData/i.test(html)) return "chime-site-search";
  for (const [id, pattern] of [
    ["ihomefinder", /ihomefinder|idxhome\.com|ihf-container|ihf-main-container/i],
    ["showcase-idx", /showcaseidx|showcase-idx/i],
    ["kvcore", /kvcore|kv-core/i],
    ["realgeeks", /realgeeks|real-geeks/i],
  ] as const) if (pattern.test(html)) return id;
  if (/awsWafCookieDomainList|window\.gokuProps\b/.test(html)) return "waf-challenge";
  // Empty application roots are a rendering architecture, independent of IDX vendor or customer domain.
  if (/<(?:div|main)\b[^>]*\bid=["'](?:root|app|__next)["'][^>]*>\s*<\/(?:div|main)>/i.test(html) &&
      /<script\b[^>]*\bsrc\s*=/i.test(html)) return "javascript-shell";
  return undefined;
}

/** Public fragments keep the exact agent/category/filter instead of broadening the search. */
export function collectInventoryFragments(html: string, base: URL): string[] {
  return documentOnce(html, `fragments|${base.href}`, () => inventoryFragmentsOf(html, base)).slice();
}

function inventoryFragmentsOf(html: string, base: URL): string[] {
  const out = LISTING_INTERFACE_ADAPTERS.filter(adapter => documentMatches(adapter.id, adapter.matches, html, base)).flatMap(adapter => adapter.fragments?.(html,base) ?? []);
  for (const url of chimeListingSearchRequests(html, base)) out.push(url);
  for (const tag of html.match(/<[^>]+\bdata-(?:listings|results|inventory)-(?:url|src)=["'][^>]+>/gi) ?? []) {
    const raw = attr(tag, "data-listings-url") || attr(tag, "data-results-url") || attr(tag, "data-inventory-url") ||
      attr(tag, "data-listings-src") || attr(tag, "data-results-src");
    const url = absolutize(raw, base);
    if (url && sameSite(new URL(url), base)) out.push(url);
  }
  if (/(?:^|\.)flexmls\.com$/i.test(base.hostname) && /\/listings(?:\/\d{20,})?\/?$/.test(base.pathname) &&
      (/data-search-results-search-count|mapSupportData/.test(html) || /\/(?:office|agent)_listing_categories\/[^/]+\/listings(?:\/\d{20,})?\/?$/.test(base.pathname)) && !base.searchParams.has("list_view")) {
    const url = new URL(base);
    // A selected Flexmls property opens the same filtered public collection in
    // the browser. Read that collection’s existing server-rendered photo view.
    url.pathname = url.pathname.replace(/(\/listings)\/\d{20,}\/?$/, "$1");
    url.searchParams.set("list_view", "photo");
    url.searchParams.set("page", "1");
    url.searchParams.set("per_page", "24");
    out.push(url.toString());
  }
  return [...new Set(out)];
}

function visibleDocument(html: string): string {
  return documentOnce(html, "visible", () => visibleDocumentOf(html));
}

function visibleDocumentOf(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
}

const PAGER_PARAM = /^(?:page(?:_\d+)?|pageNumber|offset|limit|per_page|q_offset|cursor|after|start)$/i;
const PAGER_LABEL = /^\s*(?:\d{1,4}|next|prev(?:ious)?|first|last|more|[»«›‹>]+|…)\s*(?:page)?\s*$/i;

/**
 * A pager link of the document being read (same address, only page position or pager-only scope
 * changed). It is a continuation of this collection, never a step toward the agent's inventory:
 * continuations are followed only from a page that produced listings (inspectCollectionDocument).
 * Following them as navigation crawls every page × pager combination of collections we cannot read.
 */
export function isPagerOf(target: string, base: URL, label: string): boolean {
  let next: URL;
  try { next = new URL(target); } catch { return false; }
  if (next.protocol !== base.protocol || !sameSite(next, base) || next.pathname.replace(/\/+$/, "") !== base.pathname.replace(/\/+$/, "")) return false;
  const keys = new Set([...next.searchParams.keys(), ...base.searchParams.keys()]);
  const changed = [...keys].filter(key => next.searchParams.getAll(key).join("\u0000") !== base.searchParams.getAll(key).join("\u0000"));
  if (!changed.length) return false;
  return changed.every(key => PAGER_PARAM.test(key)) || (PAGER_LABEL.test(label) && changed.some(key => PAGER_PARAM.test(key)));
}

// ── Ownership and scope ─────────────────────────────────────────────────────────────────────────
// Importing another agent's inventory is worse than importing nothing. These rules use structural
// signals only (URL scope of the seed, IDX listing attribution, collection shape), never customer names.

/** Registrable domain (example.com, example.co.uk): the boundary of "the agent's own site". */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".");
  const n = labels.length >= 3 && /^(?:co|com|org|net|ac|gov)$/.test(labels[labels.length - 2]) && labels[labels.length - 1].length === 2 ? 3 : 2;
  return labels.slice(-n).join(".");
}

export type SeedScope = { domain: string; person?: { prefix: string; tokens: string[] } };

/**
 * A seed that is one person's page on a multi-agent platform (/agents/<name>, /profile/<name>,
 * /…/agent/<name>/<id>) scopes the import to that person. Pages elsewhere on the platform are the
 * platform's market, not the person's inventory.
 */
export function seedScope(seed: URL): SeedScope {
  const segments = seed.pathname.split("/").filter(Boolean);
  const at = segments.findIndex(part => /^(?:agents?|profiles?|realtors?|people|team-members?|our-agents|associates?|brokers?)$/i.test(part));
  const domain = registrableDomain(seed.hostname);
  if (at < 0 || !segments[at + 1]) return { domain };
  const slug = decodeURIComponent(segments[at + 1]);
  const id = segments[at + 2] && /\d{4,}/.test(segments[at + 2]) ? segments[at + 2] : undefined;
  const prefix = "/" + segments.slice(0, id ? at + 3 : at + 2).join("/");
  const tokens = [slug.toLowerCase(), ...(id ? [id.toLowerCase(), ...(id.match(/\d{4,}/g) ?? [])] : [])].filter(token => token.length >= 4);
  return { domain, person: { prefix: prefix.toLowerCase(), tokens } };
}

/** A link that itself claims the agent's own inventory ("My listings", "Our properties"). */
const OWN_INVENTORY_LABEL = /\b(?:my|our)\s+(?:active\s+|current\s+|featured\s+|exclusive\s+)?(?:listings?|properties|homes|inventory)\b/i;

/**
 * Navigation (not transports, fragments or details) must stay within the seed's scope:
 * - a person page on a multi-agent platform: that person's pages, links carrying the person's
 *   identifier, or links that themselves claim the person's own inventory;
 * - anywhere: another company's homepage (a bare domain's root) is never inventory. That is where
 *   vendor credits ("Powered by…") and brokerage home links lead.
 */
export function navigationInScope(target: string, scope: SeedScope | undefined, label = ""): boolean {
  if (!scope) return true;
  let url: URL;
  try { url = new URL(target); } catch { return false; }
  const domain = registrableDomain(url.hostname);
  const bareHost = url.hostname.toLowerCase().replace(/^www\./, "") === domain;
  const homepage = /^\/?(?:index\.(?:html?|php|aspx?))?$/i.test(url.pathname.replace(/\/+$/, "")) && !url.search;
  if (domain !== scope.domain && bareHost && homepage) return false;
  if (!scope.person) return true;
  const scoped = scope.person.tokens.some(token => decodeURIComponent(url.pathname + url.search).toLowerCase().includes(token));
  const path = url.pathname.toLowerCase().replace(/\/+$/, "");
  const inside = domain === scope.domain && (path === scope.person.prefix || path.startsWith(scope.person.prefix + "/"));
  return inside || scoped || OWN_INVENTORY_LABEL.test(label);
}

const GENERIC_IDENTITY_WORDS = new Set(["real", "estate", "realty", "realtor", "realtors", "homes", "home", "sale", "sales", "for", "the", "and", "group",
  "team", "agent", "agents", "broker", "brokerage", "properties", "property", "llc", "inc", "co", "company", "listings", "listing", "search", "your",
  "best", "top", "luxury", "island", "city", "county", "north", "south", "east", "west", "international", "associates", "partners", "services"]);
const identityKey = (value: string) => decodeEntities(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const identityWords = (value: string) => decodeEntities(value).toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 5 && !GENERIC_IDENTITY_WORDS.has(word));

export type SiteIdentity = { phrases: string[]; words: string[] };

/** What the site publishes about itself: its domain label, site name and title segments. */
export function siteIdentity(html: string, base: URL): SiteIdentity {
  const parts = [registrableDomain(base.hostname).split(".")[0]];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (/^(?:og:site_name|application-name|author)$/i.test(attr(tag, "property") || attr(tag, "name"))) parts.push(...attr(tag, "content").split(/\s[|–—\-:]\s/));
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) parts.push(...decodeEntities(stripTags(title)).split(/\s[|–—\-:]\s/));
  const phrases = [...new Set(parts.map(identityKey).filter(key => key.length >= 6))];
  return { phrases, words: [...new Set(parts.flatMap(identityWords))] };
}

/** "strong": the attribution names the site's own agent or office. "brand": only a shared brand word. */
export function officeMatch(office: string, identity: SiteIdentity | undefined): "strong" | "brand" | "none" {
  if (!identity) return "none";
  const key = identityKey(office);
  if (key.length >= 6 && identity.phrases.some(phrase => key.includes(phrase) || phrase.includes(key))) return "strong";
  return identityWords(office).some(word => identity.words.includes(word)) ? "brand" : "none";
}

const ATTRIBUTION_TEXT = /\b(?:listing office|listing courtesy of|courtesy of|listed by|listing provided by|listing brokerage|brokered by|offered by)\s*:?\s*([^|•\n]{3,90})/i;
const ATTRIBUTION_JSON = /"(?:brokerName|brokerageName|listOfficeName|ListOfficeName|listingOfficeName|listingOffice|officeName|listingBrokerName|ListOfficeFullName)"\s*:\s*"([^"]{2,90})"/;

function cleanAttribution(raw: string): string | undefined {
  let value = decodeEntities(raw).replace(/\\u0026/g, "&").replace(/\s+/g, " ").trim();
  value = value.split(/\s--\s|\s\|\s|,?\s*(?:phone|tel|off|office|cell|mobile)\s*:|\s\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}|\s[\w.+-]+@[\w-]+\./i)[0].replace(/[.,;\s]+$/, "").trim();
  if (value.length < 3 || /mls|multiple listing|information|deemed|reliable|presenting|copyright|©|__|\[\[|\{\{|\$\{/i.test(value)) return undefined;
  return value.slice(0, 80);
}

/**
 * IDX attribution for each listing, read only from that listing's own card: the markup from the
 * listing's link up to the next listing's link (IDX rules require the attribution on every card).
 */
export function attributeListingOffices(html: string, listings: DiscoveredListing[]): Map<string, string> {
  const positions: { url: string; at: number }[] = [];
  for (const item of listings) {
    let path = "";
    try { const url = new URL(item.sourceUrl); path = url.pathname.length > 1 ? url.pathname : url.pathname + url.search; } catch { continue; }
    // The card starts at the listing's link (href / JSON url field), not wherever the URL is first mentioned.
    const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const link = new RegExp(`(?:href\\s*=\\s*["'][^"']*|"(?:url|detailUrl|href|link|permalink|listingUrl)"\\s*:\\s*"[^"]*)(?:${escaped(path)}|${escaped(path.replace(/\//g, "\\/"))})`, "i");
    const at = html.search(link);
    if (at >= 0) positions.push({ url: item.sourceUrl, at });
  }
  positions.sort((a, b) => a.at - b.at);
  const offices = new Map<string, string>();
  positions.forEach((position, i) => {
    const end = Math.min(positions.slice(i + 1).find(next => next.at > position.at)?.at ?? html.length, position.at + 8000);
    const card = html.slice(position.at, end);
    const fromJson = card.match(ATTRIBUTION_JSON)?.[1];
    // Tag boundaries end a value: an attribution never runs on into the next element's text.
    const fromText = decodeEntities(card.replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, "\n").replace(/<[^>]+>/g, "\n")).match(ATTRIBUTION_TEXT)?.[1];
    const office = (fromJson && cleanAttribution(fromJson)) || (fromText && cleanAttribution(fromText));
    if (office && !offices.has(position.url)) offices.set(position.url, office);
  });
  return offices;
}

/**
 * A collection request that publishes an agent or office filter (agentIds, officeId, My=listings,
 * agent_listing_categories…) is the agent's own inventory by construction, whatever offices co-list.
 */
export function agentScopedRequest(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (/\/(?:office|agent)_listing_categories\/|\/(?:my|our)[-_](?:active[-_])?listings\b/i.test(url.pathname)) return true;
  const decoded = decodeURIComponent(url.search).toLowerCase();
  if (/[?&]my=listings\b/.test(decoded)) return true;
  for (const [key, value] of url.searchParams) {
    if (/^(?:agent_?ids?|agentid|office_?ids?|officeid|list_?agent(?:_?mls)?_?id|listagentmlsid|listofficemlsid|aid|agent)$/i.test(key) && value.trim() && value !== "[]") return true;
  }
  return /"(?:agentIds|officeIds|agentId|officeId|listAgentMlsId|listOfficeMlsId)"\s*:\s*(?:\[\s*"[^"]+|"[^"]+)/i.test(decodeURIComponent(url.search));
}

/** IDX attribution on a property's own detail page (the first one: recommendations come later). */
export function detailAttribution(html: string): string | undefined {
  const fromJson = html.match(ATTRIBUTION_JSON)?.[1];
  if (fromJson && cleanAttribution(fromJson)) return cleanAttribution(fromJson);
  const text = decodeEntities(html.replace(/<(?:script|style|nav|header)\b[\s\S]*?<\/(?:script|style|nav|header)>/gi, "\n").replace(/<[^>]+>/g, "\n"));
  const fromText = text.match(ATTRIBUTION_TEXT)?.[1];
  return fromText ? cleanAttribution(fromText) : undefined;
}

/** own when the attribution names the site's own agent or office; otherwise shown as featured. */
export function ownershipFor(office: string | undefined, identity: SiteIdentity | undefined): "own" | "featured" | undefined {
  if (!office || !identity) return undefined;
  return officeMatch(office, identity) === "strong" ? "own" : "featured";
}

/**
 * Labels attributed listings that no collection rule labelled: one or two brokerages across the
 * inventory is the brokerage the agent or team lists under (own); with several, listings not
 * attributed to the site's own agent or office are featured. Unattributed listings stay unlabelled.
 */
export function labelInventoryOwnership<T extends object>(items: T[], identity: SiteIdentity | undefined): T[] {
  const fields = (item: T) => item as { listingOffice?: unknown; ownership?: unknown };
  const officeOf = (item: T) => typeof fields(item).listingOffice === "string" ? fields(item).listingOffice as string : "";
  const unlabeled = items.filter(item => !fields(item).ownership && officeOf(item));
  const brokerages = new Set(unlabeled.map(item => identityKey(officeOf(item)))).size;
  return items.map(item => {
    if (fields(item).ownership || !officeOf(item)) return item;
    const ownership = brokerages <= 2 ? "own" : ownershipFor(officeOf(item), identity);
    return ownership ? { ...item, ownership } : item;
  });
}

export type CollectionScope = {
  kind: "single-office" | "featured" | "market" | "unattributed";
  keep: DiscoveredListing[]; excluded: number; offices: number;
};

/**
 * Scope of one collection page from its listings' IDX attribution. A page whose cards name several
 * offices is either a bounded featured showcase (kept, other offices labelled "featured") or a market
 * feed/search (paginated or counted beyond the page): only listings attributed to the site's own
 * agent or office are kept, and the feed is not paginated further.
 */
export function classifyCollection(listings: DiscoveredListing[], offices: Map<string, string>, identity: SiteIdentity | undefined,
  paginated: boolean, large = false): CollectionScope {
  const attributed = listings.filter(item => offices.has(item.sourceUrl));
  const distinct = new Set(attributed.map(item => identityKey(offices.get(item.sourceUrl)!)));
  const label = (item: DiscoveredListing, ownership?: "own" | "featured") => ({ ...item, listingOffice: offices.get(item.sourceUrl) ?? item.listingOffice,
    ...(ownership ? { ownership } : {}) });
  if (attributed.length < 3 || attributed.length < listings.length * 0.6) {
    return { kind: "unattributed", keep: listings.map(item => label(item, offices.has(item.sourceUrl) && officeMatch(offices.get(item.sourceUrl)!, identity) === "strong" ? "own" : undefined)), excluded: 0, offices: distinct.size };
  }
  const own = (item: DiscoveredListing) => offices.has(item.sourceUrl) && officeMatch(offices.get(item.sourceUrl)!, identity) === "strong";
  // One or two offices on a bounded collection: the brokerage the agent or team lists under.
  // A large paginated collection is a market feed even when one page happens to show one office.
  if (distinct.size <= 2 && !large) return { kind: "single-office", keep: listings.map(item => label(item, "own")), excluded: 0, offices: distinct.size };
  if (!paginated && !large) return { kind: "featured", keep: listings.map(item => label(item, own(item) ? "own" : "featured")), excluded: 0, offices: distinct.size };
  const keep = listings.filter(own).map(item => label(item, "own"));
  return { kind: "market", keep, excluded: listings.length - keep.length, offices: distinct.size };
}

/**
 * The highest page number this collection's own pager reaches (0 when it publishes none). With the
 * collection's cards given, only a pager that follows them counts: a blog or testimonials pager
 * elsewhere on the page says nothing about the listings.
 */
export function pagerExtent(html: string, base: URL, cards?: string[]): number {
  let extent = 0;
  let from = 0, to = html.length;
  if (cards?.length) {
    const at = cards.flatMap(url => { try { const u = new URL(url); const i = html.indexOf(u.pathname.length > 1 ? u.pathname : u.pathname + u.search); return i >= 0 ? [i] : []; } catch { return []; } });
    if (at.length) { from = Math.min(...at); to = Math.min(html.length, Math.max(...at) + 30_000); }
  }
  const near = (index: number | undefined) => index !== undefined && index >= from && index <= to;
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!near(match.index)) continue;
    const href = absolutize(attr(`<a ${match[1]}>`, "href"), base);
    const label = stripTags(match[2]);
    if (!href || !isPagerOf(href, base, label)) continue;
    const url = new URL(href);
    for (const [key, value] of url.searchParams) if (PAGER_PARAM.test(key) && /^\d{1,7}$/.test(value) && !/offset|limit|per_page|start/i.test(key)) extent = Math.max(extent, Number(value));
    if (/^\d{1,7}$/.test(label.trim())) extent = Math.max(extent, Number(label.trim()));
  }
  // A pagination control may page through another URL (a widget on /buyers/ paging via /?pg=N).
  for (const match of html.matchAll(/<(?:div|nav|ul|ol|p|section)\b[^>]*(?:class|id)=["'][^"']*(?:pagination|pager|paging|page-numbers)[^"']*["'][^>]*>([\s\S]{0,4000}?)<\/(?:div|nav|ul|ol|p|section)>/gi)) {
    if (!near(match.index)) continue;
    for (const token of decodeEntities(match[1].replace(/<[^>]+>/g, " ")).split(/\s+/)) if (/^\d{1,7}$/.test(token)) extent = Math.max(extent, Number(token));
  }
  return extent;
}

function sameCollectionQuery(next: URL, base: URL): boolean {
  const scope = (url: URL) => [...url.searchParams].filter(([key]) => !/^(?:page|pageNumber|offset|limit|per_page|q_offset|cursor|after)$/i.test(key)).sort(([a], [b]) => a.localeCompare(b));
  return next.protocol === "https:" && sameSite(next, base) && next.pathname === base.pathname && JSON.stringify(scope(next)) === JSON.stringify(scope(base));
}

function continuationUrl(raw: string, base: URL): string | null {
  const url = absolutize(raw, base);
  if (!url) return null;
  try {
    const next = new URL(url);
    return sameCollectionQuery(next, base) || sameSite(next, base) ? url : null;
  } catch { return null; }
}

/** Continuation and terminal signals for one document. Absence of a next button is not proof. */
export function inspectCollectionDocument(html: string, base: URL, found: DiscoveredListing[]): {
  continuations: string[]; open: boolean; mechanism: string; structuredClosed: boolean; singlePageConfirmed: boolean;
  cursorTerminal: boolean; providerTerminal: boolean; repeatedCursor: boolean; publishedCount?: number; publishedKind?: "api" | "page";
} {
  const continuations: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const url = continuationUrl(raw, base);
    if (!url || seen.has(url)) return;
    seen.add(url);
    continuations.push(url);
  };
  let open = false;
  let mechanism = "none";
  let cursorTerminal = false;
  let providerTerminal = false;
  let repeatedCursor = false;
  let publishedCount: number | undefined;
  let publishedKind: "api" | "page" | undefined;
  const notePublished = (value: number, kind: "api" | "page") => {
    if (Number.isFinite(value) && value > 0) { publishedCount = Math.max(publishedCount ?? 0, value); publishedKind = publishedKind === "api" ? "api" : kind; }
  };
  const readBag = (payload: Record<string, unknown>) => {
    const bags = [payload, payload.pagination, payload.pageInfo].filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
    for (const bag of bags) {
      const scoped = bag === payload ? bag : bag;
      if (scoped.hasNextPage === true || scoped.has_next_page === true || scoped.hasMore === true) open = true;
      if (scoped.hasNextPage === false || scoped.has_next_page === false || scoped.hasMore === false) { cursorTerminal = scoped.hasNextPage === false || scoped.has_next_page === false; providerTerminal = scoped.hasMore === false || providerTerminal; }
      for (const key of ["nextUrl", "next", "nextPage", "@odata.nextLink"]) {
        if (!Object.prototype.hasOwnProperty.call(scoped, key)) continue;
        const value = scoped[key];
        if (value == null) cursorTerminal = true;
        else if (typeof value === "string" && value && (key !== "next" || bag !== payload || /^https?:\/\//i.test(value))) add(value);
      }
      for (const key of ["nextCursor", "next_cursor", "endCursor"]) {
        if (!Object.prototype.hasOwnProperty.call(scoped, key)) continue;
        const value = scoped[key];
        if (value == null) cursorTerminal = true;
        else if (typeof value === "string" && /^https:\/\//i.test(value)) add(value);
        else if (typeof value === "string" && value) open = true;
      }
      const pageNum = Number(scoped.page ?? scoped.currentPage ?? base.searchParams.get("page"));
      const totalPage = Number(scoped.totalPage ?? scoped.totalPages ?? scoped.pageCount);
      if (Number.isInteger(pageNum) && Number.isInteger(totalPage) && pageNum < totalPage && pageNum > 0 && pageNum < 30 && base.searchParams.has("page")) {
        const following = new URL(base);
        following.searchParams.set("page", String(pageNum + 1));
        add(following.toString());
      }
    }
  };
  try { readBag(JSON.parse(html) as Record<string, unknown>); } catch { /* HTML document */ }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { readBag(JSON.parse(match[1]) as Record<string, unknown>); } catch { /* malformed script */ }
  }
  const visible = visibleDocument(html);
  for (const url of paginationLinks(visible, base)) add(url);
  for (const tag of visible.match(/<link\b[^>]*>/gi) ?? []) {
    if (/\bnext\b/i.test(attr(tag, "rel"))) add(attr(tag, "href"));
  }
  for (const match of visible.matchAll(/<(?:a|button)\b([^>]*)>([\s\S]*?)<\/(?:a|button)>/gi)) {
    const tag = `<a ${match[1]}>`;
    const label = `${attr(tag, "aria-label")} ${attr(tag, "title")} ${stripTags(match[2])}`;
    const href = attr(tag, "href") || attr(tag, "data-url") || attr(tag, "data-href") || attr(tag, "data-next-url");
    if (/\b(?:load|show) more\b/i.test(label)) {
      if (href) add(href); else open = true;
      mechanism = "load-more";
    }
  }
  for (const tag of visible.match(/<[^>]+\bdata-next-(?:url|href)=["'][^"']+["'][^>]*>/gi) ?? []) add(attr(tag, "data-next-url") || attr(tag, "data-next-href"));
  if (/data-has-next-page=["']true["']/i.test(visible)) open = true;
  const explicitEnd = /data-has-next-page=["']false["']/i.test(visible) || /data-pagination-complete=["']true["']/i.test(visible);
  const currentPage = Number(base.searchParams.get("page") || base.searchParams.get("pageNumber") || 1);
  let numberedNext: string | null = null;
  let sawPager = false;
  let highestPage = 0;
  for (const match of visible.matchAll(/<(?:nav|div|ul)\b[^>]*(?:class|id)=["'][^"']*pagination[^"']*["'][^>]*>[\s\S]*?<\/(?:nav|div|ul)>/gi)) {
    sawPager = true;
    for (const link of match[0].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const tag = `<a ${link[1]}>`;
      const label = stripTags(link[2]);
      const pageNo = Number(label);
      const href = attr(tag, "href");
      if (Number.isInteger(pageNo) && pageNo > 0) highestPage = Math.max(highestPage, pageNo);
      if (pageNo === currentPage + 1 && href) numberedNext = href;
    }
  }
  if (numberedNext) add(numberedNext);
  const text = stripTags(visible).slice(0, 20000);
  const range = text.match(/\b(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)\s+(?:listings|properties|homes|results)\b/i);
  const showingAll = text.match(/\bshowing all\s+(\d+)\s+(?:listings|properties|homes|results)\b/i);
  if (range && Number(range[1]) === 1 && Number(range[2]) === Number(range[3])) notePublished(Number(range[3]), "page");
  else if (showingAll) notePublished(Number(showingAll[1]), "page");
  if (continuations.length > 0 && continuations.every(url => url === base.toString())) repeatedCursor = true;
  if (continuations.some(url => url !== base.toString())) { open = false; mechanism = mechanism === "load-more" ? "load-more" : numberedNext || sawPager ? "numbered-pagination" : cursorTerminal || /cursor|after=/i.test(continuations.find(url => url !== base.toString()) ?? "") ? "cursor" : "next-link"; }
  else if (open) mechanism = mechanism === "load-more" ? "load-more" : "hidden";
  const structured = [...listingsFromJsonLd(html, base), ...listingsFromHydration(html, base), ...listingsFromPublicJson(html, base)];
  const cards = listingsFromCards(visible, base);
  const sameIds = (left: DiscoveredListing[], right: DiscoveredListing[]) => {
    const a = new Set(left.map(item => item.sourceUrl));
    const b = new Set(right.map(item => item.sourceUrl));
    return a.size > 0 && a.size === b.size && [...a].every(url => b.has(url));
  };
  const structuredClosed = !open && !continuations.length && found.length > 0 && sameIds(structured, found);
  const crossCheck = !open && !continuations.length && found.length > 0 && cards.length > 0 && structured.length > 0 && sameIds(cards, structured) && sameIds(structured, found);
  const pagerExhausted = sawPager && !continuations.length && !open && found.length > 0 && highestPage > 0 && highestPage <= Math.max(currentPage, 1);
  const countMatchesPage = !!publishedCount && publishedCount === found.length;
  const singlePageConfirmed = !open && !continuations.length && found.length > 0 && (explicitEnd || crossCheck || pagerExhausted || (countMatchesPage && publishedKind === "page") || (structuredClosed && cursorTerminal));
  if (/\binfinite-scroll\b|data-infinite/i.test(visible) && !continuations.length) open = true;
  return {
    continuations: continuations.filter(url => url !== base.toString()), open: open || repeatedCursor, mechanism, structuredClosed, singlePageConfirmed,
    cursorTerminal: cursorTerminal && !open, providerTerminal: providerTerminal && !open && !continuations.length, repeatedCursor,
    publishedCount, publishedKind,
  };
}

type PublishedUrlTemplate = { flag: string; whenTrue: string; trueField: string; whenFalse: string; falseField: string };

/** Same-origin GraphQL roots the page itself publishes. Customer hostnames are not part of the contract. */
function publishedGraphqlEndpoints(html: string, base: URL): { gateway?: string; router?: string } {
  const out: { gateway?: string; router?: string } = {};
  for (const match of html.matchAll(/\b(apiGatewayUrl|routerUrl)\s*[:=]\s*["']([^"']+)["']/g)) {
    const abs = absolutize(match[2], base);
    if (!abs) continue;
    let url: URL;
    try { url = new URL(abs); } catch { continue; }
    if (url.protocol !== "https:" || !sameSite(url, base)) continue;
    if (!/\/graphql$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, "") + "/graphql";
    url.search = "";
    url.hash = "";
    if (match[1] === "routerUrl") out.router = url.toString();
    else out.gateway = url.toString();
  }
  return out;
}

function cleanPublishedVariables(value: unknown): unknown {
  if (typeof value === "string") return /\{\{.*\}\}/.test(value) ? undefined : value;
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.map(cleanPublishedVariables).filter(item => item !== undefined);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const cleaned = cleanPublishedVariables(child);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return undefined;
}

function scopedCollectionVariables(variables: Record<string, unknown>): boolean {
  if (variables.globalProperty === true || variables.network === true) return false;
  if (variables.featuredListing === true) return true;
  for (const key of ["agentIds", "teamIds", "officeIds", "propertyIds"]) {
    if (Array.isArray(variables[key]) && variables[key].length > 0) return true;
  }
  const company = typeof variables.companyId === "string" && variables.companyId.trim().length > 0;
  const website = typeof variables.websiteId === "string" && variables.websiteId.trim().length > 0;
  return company && website;
}

/** Published offset collection queries. Unscoped market queries are not followed. */
function publishedPropertiesQuery(html: string): string | null {
  const found = new Set<string>();
  for (const match of html.matchAll(/"properties"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
    let query = "";
    try { query = JSON.parse('"' + match[1] + '"'); } catch { continue; }
    if (typeof query !== "string") continue;
    const text = query.trim();
    if (/^\s*query\s+Properties\b/m.test(text) && /\bcount\b/.test(text) && text.length < 20000) found.add(text);
  }
  return found.size === 1 ? [...found][0] : null;
}

export function publishedCollectionRequests(html: string, base: URL): string[] {
  const endpoints = publishedGraphqlEndpoints(html, base);
  if (!endpoints.gateway && !endpoints.router) return [];
  const sharedQuery = publishedPropertiesQuery(html);
  const candidates: { query: string; record: Record<string, unknown>; pageSize: number; embedded: boolean; useRouter: boolean }[] = [];
  for (const match of html.matchAll(/JSON\.parse\(\s*"((?:\\.|[^"\\])*)"\s*\)/g)) {
    let blob: Record<string, unknown>;
    try { blob = JSON.parse(JSON.parse('"' + match[1] + '"')); } catch { continue; }
    if (!blob) continue;
    const variables = cleanPublishedVariables(blob.variables);
    if (!variables || typeof variables !== "object" || Array.isArray(variables)) continue;
    const record = { ...(variables as Record<string, unknown>) };
    const pageSize = Number(blob.pageSize ?? record.limit);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !scopedCollectionVariables(record)) continue;
    const ownQuery = typeof blob.query === "string" ? blob.query.trim() : "";
    const embedded = /^\s*query\s+Properties\b/m.test(ownQuery) && /\bcount\b/.test(ownQuery);
    const query = embedded ? ownQuery : sharedQuery && blob.resource === "properties" ? sharedQuery : "";
    if (!query) continue;
    candidates.push({ query, record, pageSize, embedded, useRouter: blob.useRouterApi === true });
  }
  const chosen = candidates.some(row => row.embedded) ? candidates.filter(row => row.embedded) : candidates;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of chosen) {
    const record = item.record;
    record.limit = item.pageSize;
    if (record.offset == null) record.offset = 0;
    const root = item.useRouter ? endpoints.router : endpoints.gateway;
    if (!root) continue;
    const url = new URL(root);
    url.searchParams.set("query", item.query);
    url.searchParams.set("variables", JSON.stringify(record));
    const href = url.toString();
    if (href.length > 12000 || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= 2) break;
  }
  return out;
}

/** Href template the collection page publishes for its own records. Paths are not invented. */
function publishedListingUrlTemplate(html: string): PublishedUrlTemplate | null {
  const match = html.match(/\{\{#if\s+([A-Za-z_][A-Za-z0-9_]*)\}\}(?:href\s*=\s*["'])?(\/[A-Za-z0-9_./~-]{1,80})\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}["']?\s*\{\{(?:\^|else)\}\}(?:href\s*=\s*["'])?(\/[A-Za-z0-9_./~-]{1,80})\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/);
  if (!match) return null;
  const fields = new Set(["id", "slug"]);
  if (!fields.has(match[3]) || !fields.has(match[5])) return null;
  return { flag: match[1], whenTrue: match[2], trueField: match[3], whenFalse: match[4], falseField: match[5] };
}

function applyPublishedListingUrls(text: string, template: PublishedUrlTemplate | null): string {
  if (!template) return text;
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return text; }
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const data = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data as Record<string, unknown> : root;
  if (!data) return text;
  let changed = false;
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      if (typeof record.url !== "string") {
        const flag = Boolean(record[template.flag]);
        const token = record[flag ? template.trueField : template.falseField];
        const prefix = flag ? template.whenTrue : template.whenFalse;
        if (typeof token === "string" && /^[A-Za-z0-9._~-]{1,180}$/.test(token)) {
          record.url = prefix + token;
          changed = true;
        }
      }
      if (typeof record.streetAddress !== "string") {
        const priced = record.salesPrice != null && record.salesPrice !== "" && record.salesPrice !== 0;
        const named = typeof record.name === "string" ? record.name.trim() : "";
        const identified = (typeof record.slug === "string" && record.slug.trim()) || (typeof record.id === "string" && record.id.trim());
        const address = typeof record.fullAddress === "string" && record.fullAddress.trim() ? record.fullAddress : named && (/\d/.test(named) || priced || identified) ? named : "";
        if (address) { record.streetAddress = address; changed = true; }
      }
      if (record.price == null && (typeof record.salesPrice === "number" || typeof record.salesPrice === "string")) { record.price = record.salesPrice; changed = true; }
      if (record.bedrooms == null && record.bedroomCount != null) { record.bedrooms = record.bedroomCount; changed = true; }
      if (record.bathrooms == null && record.bathCount != null) { record.bathrooms = record.bathCount; changed = true; }
      if ((record.sqft == null && record.livingSpaceSize != null)) { record.sqft = record.livingSpaceSize; changed = true; }
      if (!record.image && Array.isArray(record.media)) {
        const images = record.media.flatMap(media => {
          if (!media || typeof media !== "object") return [];
          const source = media as Record<string, unknown>;
          const raw = source.largeUrl ?? source.mediumUrl ?? source.url;
          return typeof raw === "string" ? [raw] : [];
        });
        if (images.length) { record.image = images; changed = true; }
      }
    }
  }
  return changed ? JSON.stringify(payload) : text;
}

/** Numeric total published beside a result array, including GraphQL *Count.count. */
function publishedCollectionTotal(payload: unknown): { total?: number; rows: number } {
  if (!payload || typeof payload !== "object") return { rows: 0 };
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data as Record<string, unknown> : root;
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    const countNode = data[key + "Count"];
    const count = countNode && typeof countNode === "object" ? Number((countNode as Record<string, unknown>).count) : NaN;
    if (Number.isFinite(count) && count > 0) return { total: count, rows: value.length };
  }
  const direct = Number(root.total ?? root.totalCount ?? root["@odata.count"]);
  return { total: Number.isFinite(direct) && direct > 0 ? direct : undefined, rows: 0 };
}

function nextPublishedOffsetUrl(current: URL, total: number, rows: number): string | null {
  if (!/\/graphql$/i.test(current.pathname) || rows <= 0) return null;
  const raw = current.searchParams.get("variables");
  const query = current.searchParams.get("query");
  if (!raw || !query) return null;
  let variables: Record<string, unknown>;
  try { variables = JSON.parse(raw); } catch { return null; }
  const limit = Number(variables.limit);
  const offset = Number(variables.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return null;
  if (rows < limit || offset + rows >= total) return null;
  const nextOffset = offset + limit;
  if (nextOffset > 400) return null;
  const url = new URL(current);
  url.searchParams.set("variables", JSON.stringify({ ...variables, offset: nextOffset, limit }));
  return url.toString();
}

function paginationLinks(html: string, base: URL): string[] {
  return documentOnce(html, `pagination|${base.href}`, () => paginationLinksOf(html, base)).slice();
}

function paginationLinksOf(html: string, base: URL): string[] {
  const out: string[] = [];
  try {
    const payload=JSON.parse(html), raw=payload.nextUrl ?? payload["@odata.nextLink"] ?? payload.links?.next ?? payload.pagination?.nextUrl;
    const next=typeof raw === "string" ? new URL(raw,base) : null;
    const scope=(url: URL) => [...url.searchParams].filter(([key]) => !/^(?:page|pageNumber|offset|limit|per_page|q_offset|cursor)$/i.test(key)).sort(([a],[b])=>a.localeCompare(b));
    if (next && next.protocol === "https:" && sameSite(next,base) && next.pathname === base.pathname && JSON.stringify(scope(next)) === JSON.stringify(scope(base))) out.push(next.toString());
    const pageNum = Number(payload.page ?? payload.currentPage ?? base.searchParams.get("page"));
    const totalPage = Number(payload.totalPage ?? payload.totalPages);
    const rows = payload.listings ?? payload.value;
    if (!out.length && Array.isArray(rows) && rows.length && Number.isInteger(pageNum) && pageNum > 0 && Number.isInteger(totalPage) && pageNum < totalPage && pageNum < 30 && base.searchParams.has("page")) {
      const following = new URL(base);
      following.searchParams.set("page", String(pageNum + 1));
      if (sameSite(following, base)) out.push(following.toString());
    }
  } catch { /* ordinary HTML pagination below */ }
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const tag = `<a ${m[1]}>`;
    if (!/\bnext\b/i.test(`${attr(tag, "rel")} ${attr(tag, "aria-label")} ${stripTags(m[2])}`)) continue;
    const url = absolutize(attr(tag, "href"), base);
    if (url && sameSite(new URL(url), base)) out.push(url);
  }
  return out;
}

function navigationCandidates(html: string, base: URL): NavigationCandidate[] {
  const out: NavigationCandidate[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const tag = `<a ${m[1]}>`;
    const url = absolutize(attr(tag, "href"), base);
    if (!url || LOGIN_PATH.test(new URL(url).pathname) || /\.(?:pdf|png|jpg|svg|zip)$/i.test(new URL(url).pathname) || out.some(c => c.url === url)) continue;
    const label = decodeEntities(`${stripTags(m[2])} ${attr(tag, "aria-label")} ${attr(tag, "title")}`).trim().slice(0, 180);
    if (label) out.push({ url, label });
  }
  return out.slice(0, 40);
}

/** Public Flexmls Turbo LDP route: keep the exact agent/office filter and property id. */
export function propertyDetailRequest(raw: string): {url:string;fragment:boolean} {
  const url=new URL(raw);
  if (/(?:^|\.)flexmls\.com$/i.test(url.hostname) && /\/search\/(?:office|agent)_listing_categories\/[^/]+\/listings\/\d{20,32}$/.test(url.pathname)) {
    url.pathname=url.pathname.replace(/\/listings\/(\d{20,32})$/, "/listing_detail/$1");
    return {url:url.toString(),fragment:true};
  }
  return {url:raw,fragment:false};
}

/** Same photo at different Spark sizes is one photo; retain the first, preferred size. */
export function distinctPropertyImages(images:string[]):string[] {
  const seen=new Set<string>();
  return images.filter(raw=>{let key=raw;try{const u=new URL(raw);if(/(?:^|\.)sparkplatform\.com$/i.test(u.hostname))key=u.pathname.match(/\d{20,32}(?=-(?:o|t)\.|\.)/)?.[0]??raw;}catch{/* already validated by extractor */}if(seen.has(key))return false;seen.add(key);return true;}).slice(0,500);
}

function flexmlsDetail(item:DiscoveredListing,html:string,base:URL):DiscoveredListing|undefined {
  if(!/(?:^|\.)flexmls\.com$/i.test(base.hostname))return;
  const tag=html.match(/<[^>]+\bdata-map--ldp-listing\s*=[\s\S]*?>/i)?.[0];
  if(!tag)return;
  try{
    const data=JSON.parse(attr(tag,"data-map--ldp-listing"));
    const id=new URL(item.sourceUrl).pathname.match(/\/(\d{20,32})$/)?.[1];
    if(!id||data.ListingKey!==id)return; // Never attach another property's gallery.
    const media=JSON.parse(attr(tag,"data-map--ldp-listing-native-media")||"{}");
    const images=distinctPropertyImages((media.Photos??[]).filter((p:Record<string,unknown>)=>
      (!p.CurrentPrivacy||p.CurrentPrivacy==="Public")&&(!p.Privacy||p.Privacy==="Public")).map((p:Record<string,unknown>)=>absolutize(String(p.Uri1280??p.UriLarge??p.Uri1024??p.Uri640??""),base)).filter((u: string|null):u is string=>!!u&&!looksLikeChrome(u)));
    const remarks=html.match(/<div\b[^>]*class=["'][^"']*remarks-and-showing-info-clamped[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
    return {...item,description:remarks?decodeEntities(stripTags(remarks)).slice(0,16000):item.description,
      price:priceFrom({price:data.CurrentPrice??data.ListPrice})||item.price,
      beds:Number(data.BedsTotal)||item.beds,baths:Number(data.BathsTotal)||item.baths,
      neighborhood:[data.City,data.StateOrProvince].filter(Boolean).join(", ")||item.neighborhood,
      status:normalizeListingStatus(data.MlsStatus??data.StandardFields?.StandardStatus)??item.status,
      listingNumber:data.ListingId||item.listingNumber,propertyType:data.StandardFields?.PropertyClass||item.propertyType,
      images:images.length?images:item.images,image:images[0]||item.image,detailsComplete:images.length>0};
  }catch{return;}
}

function listingFromFlexmlsDetail(html:string,base:URL):DiscoveredListing|undefined {
  if(!/(?:^|\.)flexmls\.com$/i.test(base.hostname))return;
  const tag=html.match(/<[^>]+\bdata-map--ldp-listing\s*=[\s\S]*?>/i)?.[0];
  if(!tag)return;
  try{
    const data=JSON.parse(attr(tag,"data-map--ldp-listing"));
    const source=new URL(base);source.pathname=source.pathname.replace('/listing_detail/','/listings/');
    const item:DiscoveredListing={title:String(data.StreetAddress??""),sourceUrl:source.toString(),description:"",price:"",beds:0,baths:0,sqft:"",neighborhood:"",images:[],image:""};
    if(!item.title)return;
    return flexmlsDetail(item,html,base);
  }catch{return;}
}

/** Follow only the public report link embedded in this exact LDP. */
export function propertyFactsRequest(html:string,base:URL,item:DiscoveredListing):string|undefined {
  if(!/(?:^|\.)flexmls\.com$/i.test(base.hostname))return;
  const id=new URL(item.sourceUrl).pathname.match(/\/(\d{20,32})$/)?.[1];
  if(!id)return;
  for(const tag of html.match(/<[^>]+\bdata-fragment-path=[^>]*>/gi)??[]){
    const raw=absolutize(attr(tag,"data-fragment-path"),base);
    if(raw){const url=new URL(raw);if(url.origin===base.origin&&url.pathname.endsWith(`/listings/${id}/report/general`))return raw;}
  }
}

export function enrichPropertyFacts(item:DiscoveredListing,html:string):DiscoveredListing {
  const values:Record<string,string>={};
  for(const m of html.matchAll(/<div\b[^>]*class=["'][^"']*listing-detail-field-label[^"']*["'][^>]*>([\s\S]*?)<\/div>([\s\S]*?)<\/div>/gi)){
    const label=decodeEntities(stripTags(m[1])),value=decodeEntities(stripTags(m[2]));
    if(value&&value.length<1000)values[label]=value;
  }
  const facts={...item.facts};
  for(const [label,value]of Object.entries(values))if(/^(?:Year Built|Lot Acres|Lot Size|Garage.*|Heating|Cooling|Roof|Sewer|Water|View|Flooring|Zoning|Style|Levels|Construction|Exterior|Appliances|Basement|Waterfront|Subdivision)$/i.test(label))facts[label]=value;
  return {...item,facts,sqft:values["Total SqFt."]||item.sqft,propertyType:values["Realtor.COM Type"]||values["Listing Type"]||item.propertyType};
}

/** Only factual fields from the property record or provider-scoped detail blocks. */
function structuredPropertyFacts(obj:Record<string,unknown>):Record<string,string>{
  const facts:Record<string,string>={};
  for(const [key,label]of Object.entries({yearBuilt:"Year Built",YearBuilt:"Year Built",lotSize:"Lot Size",LotSizeAcres:"Lot Acres",garageSpaces:"Garage Spaces",heating:"Heating",cooling:"Cooling",roof:"Roof",waterSource:"Water",sewer:"Sewer",zoning:"Zoning"})){
    const raw=obj[key],value=raw&&typeof raw==="object"?(raw as Record<string,unknown>).value:raw;
    if((typeof value==="string"||typeof value==="number")&&String(value).trim())facts[label]=decodeEntities(stripTags(String(value))).slice(0,1000);
  }
  return facts;
}

function structuredFactsForAddress(html:string,item:DiscoveredListing):Record<string,string>{
  const facts:Record<string,string>={},key=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
  walkLd(jsonLdBlocks(html),row=>{
    if(!/House|Residence|Apartment|RealEstateListing/i.test(String(row["@type"]??"")))return;
    const address=row.address as Record<string,unknown>|undefined;
    if(!address||typeof address.streetAddress!=="string")return;
    const full=[address.streetAddress,address.addressLocality,address.addressRegion,address.postalCode].filter(Boolean).join(" ");
    if(key(address.streetAddress)===key(item.title)||key(full)===key(item.title))Object.assign(facts,structuredPropertyFacts(row));
  });
  return facts;
}

function providerPropertyFacts(html:string,base:URL):Record<string,string>{
  const facts:Record<string,string>={};
  if(/\/idx\/details\/listing\//.test(base.pathname)){
    for(const [key,label]of Object.entries({yearBuilt:"Year Built",acres:"Lot Acres",subdivision:"Subdivision",heating:"Heating",cooling:"Cooling",roof:"Roof",waterSource:"Water",sewer:"Sewer",generalPropertyDescriptionGarageStall2:"Garage",lotSizeArea:"Lot Size",zoning:"Zoning"})){
      const block=html.match(new RegExp(`id=["']IDX-field-${key}["'][^>]*>([\\s\\S]*?)<\\/div>`,"i"))?.[1];
      const summary=html.match(new RegExp(`id=["']IDX-summaryField-${key}-data["'][^>]*>([\\s\\S]*?)<\\/span>`,"i"))?.[1];
      const value=decodeEntities(stripTags(summary??block?.replace(/<strong\b[^>]*>[\s\S]*?<\/strong>/i,"")??""));
      if(value&&value.length<1000)facts[label]=value;
    }
  }
  if(/\/idx\/mls-/.test(base.pathname)){
    const labels:Record<string,string>={"LOT SIZE":"Lot Size",LOT:"Lot Size",APPLIANCES:"Appliances",BASEMENT:"Basement",CONSTRUCTION:"Construction",HEAT:"Heating",COOLING:"Cooling",ROOF:"Roof",SUBDIVISION:"Subdivision",WATER:"Water",SEWER:"Sewer","VIEW DESCRIPTION":"View",GARAGE:"Garage","YEAR BUILT":"Year Built"};
    for(const table of html.match(/<table\b[^>]*id=["']dsidx-(?:primary-data|secondary-data|additional-details)["'][^>]*>[\s\S]*?<\/table>/gi)??[])
      for(const row of table.matchAll(/<tr\b[^>]*>\s*<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)){
        const label=labels[decodeEntities(stripTags(row[1])).toUpperCase()],value=decodeEntities(stripTags(row[2]));
        if(label&&value&&value.length<1000)facts[label]=value;
      }
  }
  return facts;
}


// ── Generic property detail reader (repair campaign stage 6) ────────────────────────────────────
// IDX and listing platforms publish a property's photos inside a gallery container (Showcase
// "sidx-photo-array", IDX Broker "IDX-detailsPhotosWrap", iHomefinder "ihf-image-carousel", Flexmls
// "flexmls_connect__photos", WordPress gallery plugins…) and its remarks inside a description
// container. The container's role is in its class or id; platform names are not needed. Photos are
// read only inside those containers (never the site header, logo or a "similar homes" carousel), and
// lazy-load attributes, srcset and lightbox links are honoured so the full-size photo is taken.
const detailDecode = (value: string) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const detailAttr = (tag: string, name: string) => detailDecode(tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2] ?? "").trim();

const GALLERY_ROLE = /photo|gallery|carousel|slider|slideshow|swiper|slides|media-viewer|image-viewer|lightbox/i;
const NOT_THIS_PROPERTY = /similar|related|recommended|nearby|featured|recent|other|agent|team|logo|header|footer|nav(?!igation-?arrow)|menu|sidebar|testimonial|partner|sponsor|banner|map-info|thumb-?nav/i;
const DESCRIPTION_ROLE = /description|remarks|property-?(?:details?-?text|summary|overview)|listing-?(?:details?-?text|summary)/i;
const NOT_DESCRIPTION = /gfield|form|field_|meta|seo|wpcf7|input|label|validation|sublabel/i;
const CHROME_IMAGE = /logo|icon|sprite|avatar|badge|placeholder|spinner|loading|blank|pixel|spacer|marker|\bmaps?\b|agent|headshot|no-photo|nophoto|idx-logos|equal-housing|\/assets\/images\/|\/(?:left|right|prev|next|arrow|close|print|share)[\w-]*\.(?:png|gif|svg)|\.svg(?:$|\?)|^data:/i;

/** The markup of the element that starts at `start`, bounded by its balanced closing tag. */
function detailElementAt(html: string, start: number, limit = 250_000): string {
  const name = html.slice(start).match(/^<([a-z][a-z0-9-]*)/i)?.[1]?.toLowerCase();
  if (!name) return "";
  const pattern = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, "gi");
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    if (match.index - start > limit) break;
    if (match[1]) depth--; else if (!match[2]) depth++;
    if (depth === 0) return html.slice(start, pattern.lastIndex);
  }
  return html.slice(start, Math.min(html.length, start + 20_000));
}

/** Containers whose class or id names a role, outermost first, without nested duplicates. */
function roleContainers(html: string, role: RegExp, exclude: RegExp): string[] {
  const found: { start: number; end: number; markup: string }[] = [];
  // Page chrome by position: anything inside the site's header, navigation or footer is not the property.
  const chrome = [...html.matchAll(/<(?:header|nav|footer)\b[^>]*>/gi)].map(match => ({ start: match.index!, end: match.index! + detailElementAt(html, match.index!).length }));
  for (const match of html.matchAll(/<(?:div|section|ul|ol|figure|article|aside|span|p)\b[^>]*>/gi)) {
    if (chrome.some(range => match.index! >= range.start && match.index! < range.end)) continue;
    const tag = match[0];
    const label = `${detailAttr(tag, "class")} ${detailAttr(tag, "id")}`;
    if (!role.test(` ${label} `) || exclude.test(label)) continue;
    const start = match.index!;
    if (found.some(item => start >= item.start && start < item.end)) continue;
    const markup = detailElementAt(html, start);
    found.push({ start, end: start + markup.length, markup });
  }
  return found.map(item => item.markup);
}

function detailLargestFromSrcset(srcset: string): string {
  let best = "", width = 0;
  for (const part of srcset.split(",")) {
    const [url, size] = part.trim().split(/\s+/);
    const value = Number((size ?? "").replace(/[wx]$/i, "")) || 1;
    if (url && value >= width) { best = url; width = value; }
  }
  return best;
}

const detailAbsolute = (raw: string, base: URL) => { try { const url = new URL(raw, base); return url.protocol === "https:" || url.protocol === "http:" ? url.toString().replace(/^http:/, "https:") : null; } catch { return null; } };

const IMAGE_URL = /^(?:https?:)?\/\/|^\/(?!\/)/;
const IMAGE_FILE = /\.(?:jpe?g|png|webp|avif)(?:$|[?#])|\/images?\/|\/photos?\//i;

/**
 * The photo an <img> really shows. Lazy loaders keep it in a data attribute whose name says so
 * (data-src, data-full, data-ihf-main-source, data-zoom-image…); placeholders and fallbacks are not it.
 */
export function imageSource(tag: string): string {
  let best = "", score = 0;
  for (const match of tag.matchAll(/\s([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    const name = match[1].toLowerCase();
    let value = detailDecode(match[3]).trim();
    if (name === "alt" || name === "class" || name === "style" || /alternate|placeholder|fallback|thumb|blank|lowres|lqip|tiny|preview/.test(name)) continue;
    if (/srcset$/.test(name)) value = detailLargestFromSrcset(value);
    if (!IMAGE_URL.test(value) || !IMAGE_FILE.test(value) || /^data:/i.test(value)) continue;
    const rank = /full|large|zoom|hires|high|main|original/.test(name) ? 4 : /srcset$/.test(name) ? 3 : /^data-.*(?:src|source|image|url)/.test(name) ? 2 : name === "src" ? 1 : 0;
    if (rank > score) { best = value; score = rank; }
  }
  return best;
}

/** Full-size photos published inside the page's gallery containers. */
export function detailGalleryImages(html: string, base: URL): string[] {
  const urls: string[] = [];
  for (const markup of roleContainers(html, GALLERY_ROLE, NOT_THIS_PROPERTY)) {
    // Lightbox links point at the full-size photo; when a gallery has them, its <img>s are thumbnails.
    const links = (markup.match(/<a\b[^>]*>/gi) ?? []).map(tag => detailAttr(tag, "href")).filter(href => /\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(href));
    const sources = links.length ? links : (markup.match(/<(?:img|source)\b[^>]*>/gi) ?? []).flatMap(tag => {
      const width = Number(detailAttr(tag, "width")), height = Number(detailAttr(tag, "height"));
      if ((width && width < 120) || (height && height < 90) || CHROME_IMAGE.test(detailAttr(tag, "alt"))) return [];
      const source = imageSource(tag);
      return source ? [source] : [];
    });
    for (const raw of sources) {
      const url = detailAbsolute(raw, base);
      // Site chrome is recognized by its path, never by the host ("agent.example", "agentimage.com").
      if (url && !CHROME_IMAGE.test(new URL(url).pathname)) urls.push(url);
    }
  }
  return [...new Set(urls)].slice(0, 200);
}

/** The property's remarks from its description container (forms and SEO blocks excluded). */
export function detailDescription(html: string): string {
  let best = "";
  for (const markup of roleContainers(html, DESCRIPTION_ROLE, NOT_DESCRIPTION)) {
    const text = detailDecode(markup.replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, " "))
      .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
      .replace(/^(?:description|remarks|property description|about this (?:home|property))\s*:?\s*/i, "");
    // Header lines above the remarks ("Overview", "Listed Oct 15", "Updated 1h ago") are not remarks.
    const lines = text.split("\n");
    const first = lines.findIndex(line => line.length >= 60 && /[a-z]{3,}.*[.!?,]/i.test(line));
    const remarks = (first > 0 ? lines.slice(first) : lines).join("\n").trim();
    if (remarks.length > best.length) best = remarks;
  }
  return best.length >= 80 ? best.slice(0, 16000) : "";
}

/** Street number + street name keys for a listing, from its card text and its URL's address slug. */
function propertyNameKeys(item: Pick<DiscoveredListing, "title" | "sourceUrl">): string[] {
  const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const keys = [key(item.title)];
  const street = decodeEntities(item.title).match(/\b\d{1,6}[a-z]?\s+(?:[nsew]\.?\s+)?[a-z0-9'.-]+(?:\s+[a-z0-9'.-]+)?/i)?.[0];
  if (street) keys.push(key(street));
  try {
    for (const segment of new URL(item.sourceUrl).pathname.split("/").reverse()) {
      const words = decodeURIComponent(segment).split(/[-_+]+/).filter(Boolean);
      if (words.length >= 3 && /^\d{1,6}[a-z]?$/i.test(words[0]) && /^[a-z]/i.test(words[1])) { keys.push(key(words.slice(0, 3).join(""))); break; }
    }
  } catch { /* no URL key */ }
  return [...new Set(keys.filter(value => value.length >= 7 && /\d/.test(value) && /[a-z]/.test(value)))];
}

function pageNamesProperty(text: string, item: Pick<DiscoveredListing, "title" | "sourceUrl">): boolean {
  const page = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return text.toLowerCase().includes(item.title.toLowerCase()) || propertyNameKeys(item).some(value => page.includes(value));
}

/** Enrich an already evidenced property without replacing its address with an agency title. */
/**
 * A card can name its property only by its price or badges ("$8,500,000", "Featured 4 Beds"). The
 * property's own detail page usually names it: one structured PostalAddress for the listing, and/or one
 * main heading. When the card's title names nothing, that name becomes the title. Guards: the page must
 * be this listing's own document (not a redirect elsewhere), a structured address must be the only one on
 * the page (related-home cards carry others), and a heading is used only when it reads as a located place
 * ("802 Sandpoint Ave #8404, Sandpoint, ID 83864"; "Cottage Island, Hope, ID 83836"). Nothing is invented,
 * and a title that already names something is never replaced. (Autonomous repair: title-not-property.)
 */
const LISTING_LD_TYPE = /"@type"\s*:\s*\[?\s*"(?:RealEstateListing|SingleFamilyResidence|House|Apartment|Residence|Accommodation|Condominium|Townhouse)"/i;
export function detailPageTitle(item: Pick<DiscoveredListing, "title" | "sourceUrl">, html: string, base: URL): string | undefined {
  const residue = decodeEntities(item.title ?? "")
    .replace(/\$\s?\d[\d,.]*(?:\s?(?:[KkMm]|million)\b)?/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:beds?|bd|br|baths?|ba|sq\.?\s*ft|sqft|acres?)\b/gi, " ")
    .replace(/\b(?:new|active|pending|sold|featured|just listed|for sale|listing|property|home|view|details?|price|reduced|mls|add to favou?rites)\b/gi, " ")
    .replace(/[^a-z]/gi, "");
  if (residue.length >= 3) return undefined;
  const sameDocument = (() => {
    try {
      const a = new URL(item.sourceUrl), b = base;
      const host = (h: string) => h.replace(/^www\./, "");
      return host(a.hostname) === host(b.hostname) && a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "");
    } catch { return false; }
  })();
  if (!sameDocument) return undefined;
  const clean = (value: string) => decodeEntities(decodeEntities(value.replace(/\\u0026/g, "&"))).replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
  const located = (text: string) => text.length >= 6 && text.length <= 140 && /[a-z]{2,}/i.test(text) &&
    (/^[NSEW]?\d{1,6}[A-Z]?\s+[A-Za-z0-9]/.test(text) || /,\s*[A-Za-z .'-]+,?\s+[A-Z]{2}\b/.test(text) || /\b\d{5}(?:-\d{4})?\b/.test(text));
  const streets = new Map<string, string>();
  for (const block of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    // Only a listing's own structured data names the property; an agent's or office's Place/Organization
    // address (SEO plugins publish one on every page) never does.
    if (!LISTING_LD_TYPE.test(block[1])) continue;
    for (const match of block[1].matchAll(/"streetAddress"\s*:\s*"((?:[^"\\]|\\.){2,120})"/g)) {
      const street = clean(match[1]);
      const rest = block[1].slice(match.index ?? 0, (match.index ?? 0) + 600);
      const field = (name: string) => clean(rest.match(new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.){1,60})"`))?.[1] ?? "");
      if (street) streets.set(street.toLowerCase(), [street, field("addressLocality"), [field("addressRegion"), field("postalCode")].filter(Boolean).join(" ")].filter(Boolean).join(", "));
    }
  }
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => clean(stripTags(m[1])));
  const heading = headings.length === 1 ? headings[0] : "";
  const structured = streets.size === 1 ? [...streets.values()][0] : "";
  const street = streets.size === 1 ? [...streets.keys()][0] : "";
  if (heading && located(heading) && (!street || heading.toLowerCase().includes(street))) return heading.slice(0, 160);
  if (structured && /[a-z]{2,}/i.test(street)) return structured.slice(0, 160);
  return undefined;
}

export function enrichListingFromPage(item: DiscoveredListing, html: string, base: URL): DiscoveredListing {
  if (isRobotChallenge(html)) throw new Error("Detail page requires human verification");
  if (isPublishedScriptGate(html)) throw new Error("Detail page script gate did not unlock");
  const chime = listingFromChimeDetail(html, base);
  if (chime && (chime.sourceUrl === item.sourceUrl || (!!chime.listingNumber && chime.listingNumber === item.listingNumber) || chime.title.toLowerCase() === item.title.toLowerCase())) {
    const images = chime.images.length ? chime.images : item.images;
    const description = (chime.description || item.description).slice(0, 16000);
    return { ...item, description, price: chime.price || item.price, beds: chime.beds || item.beds, baths: chime.baths || item.baths,
      sqft: chime.sqft || item.sqft, status: chime.status ?? item.status, listingNumber: chime.listingNumber || item.listingNumber,
      propertyType: chime.propertyType || item.propertyType, neighborhood: chime.neighborhood || item.neighborhood,
      image: images[0] || item.image, images, facts: { ...item.facts, ...chime.facts },
      detailsComplete: images.length > 0 && (description.length > 40 || chime.images.length > 0) };
  }
  const flex=flexmlsDetail(item,html,base);
  if(flex)return enrichPropertyFacts(flex,html);
  const brivity=html.match(/<property-details\b[^>]*>/i)?.[0];
  if(brivity&&attr(brivity,"street").trim().toLowerCase()===item.title.trim().toLowerCase()){
    const images=distinctPropertyImages([...attr(brivity,"photos").matchAll(/(['"])(.*?)\1/g)].map(m=>absolutize(m[2],base)).filter((u:string|null):u is string=>!!u&&!looksLikeChrome(u)));
    const facts={...item.facts};
    for(const [key,label]of Object.entries({yearBuilt:"Year Built",lotSize:"Lot Size",garageCapacity:"Garage",zoning:"Zoning",roof:"Roof",water:"Water",sewer:"Sewer",basement:"Basement"}))if(attr(brivity,key))facts[label]=attr(brivity,key);
    return {...item,description:attr(brivity,"description")||item.description,images:images.length?images:item.images,image:images[0]||item.image,
      price:attr(brivity,"price")?priceFrom({price:attr(brivity,"price")}):item.price,
      beds:Number(attr(brivity,"bedrooms"))||item.beds,baths:Number(attr(brivity,"baths"))||item.baths,
      listingNumber:attr(brivity,"mlsNum")||item.listingNumber,propertyType:attr(brivity,"mlsPropertyType")||attr(brivity,"currentUse")||item.propertyType,facts,detailsComplete:images.length>0};
  }
  const structured=listingsFromJsonLd(html,base).find(l=>l.sourceUrl===item.sourceUrl||l.title.toLowerCase()===item.title.toLowerCase());
  const detail = listingFromDsidxDetail(html,base) ?? listingsFromMoxi(html,base).find(l=>l.sourceUrl===item.sourceUrl) ?? listingFromIdxDetail(html, base) ?? listingsFromJsonLd(html, base).find(l => l.sourceUrl === item.sourceUrl || l.title === item.title);
  // The page must name this property. Card text is rarely repeated verbatim ("view property+ 1017 Minor
  // Avenue #1401 … 2 beds $699,000"), so its street number and street name, from the card text or the
  // URL's address slug, are what must appear. A page naming another property is never used.
  if(!detail&&!pageNamesProperty(decodeEntities(stripTags(html)),item))return item;
  const meta = (name: string) => {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      if ((attr(tag, "property") || attr(tag, "name")) === name) return attr(tag, "content");
    }
    return "";
  };
  const remarks=html.match(/<(?:div|section|p)\b[^>]*(?:id|class)=["'][^"']*(?:property-description|listing-description|ihf-description|dsidx-remarks)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|p)>/i)?.[1];
  // Remarks are text: escaped markup is removed and calls to action are not remarks.
  const cleanRemarks = (value: string) => decodeEntities(stripTags(decodeEntities(value))).split(/(?<=[.!?])\s+/)
    .filter(sentence => !/please (?:fill out|contact|call|click)|contact us|click here|request (?:more )?info|schedule a (?:showing|tour)|fill out the form/i.test(sentence)).join(" ").trim();
  const remarksText = remarks ? cleanRemarks(remarks) : "";
  // A meta description is used only for its factual sentences; calls to action are not remarks.
  const description = cleanRemarks(detail?.description || (remarksText.length >= 80 ? remarksText : "") || detailDescription(html) || remarksText || meta("og:description") || meta("description"));
  const cover = absolutize(meta("og:image"), base);
  // Explicit gallery images only; exclude related-home cards and site chrome.
  const gallery:string[]=[];
  for(const tag of html.match(/<img\b[^>]*>/gi)??[]){
    if(!/rsImg|gallery|property-photo|listing-photo/i.test(attr(tag,"class"))&&!attr(tag,"data-full"))continue;
    const url=absolutize(attr(tag,"data-full")||attr(tag,"data-src")||attr(tag,"src"),base);
    if(url&&!looksLikeChrome(url))gallery.push(url);
  }
  if (!(detail?.images.length) && !gallery.length) gallery.push(...detailGalleryImages(html, base));
  const fullGallery=(detail?.images.length??0)>0||gallery.length>0;
  const images = distinctPropertyImages([...(detail?.images ?? []),...gallery, ...(!fullGallery&&cover&&!looksLikeChrome(cover)?[cover]:[]), ...(!fullGallery?item.images:[])]);
  const office = item.listingOffice ?? detailAttribution(html);
  const named = detailPageTitle(item, html, base);
  return { ...item, ...(named ? { title: named } : {}), ...(office ? { listingOffice: office } : {}), facts:{...item.facts,...structured?.facts,...structuredFactsForAddress(html,item),...detail?.facts,...providerPropertyFacts(html,base)}, detailsComplete: fullGallery && !!description, status: detail?.status ?? statusForProperty(html, item, base) ?? item.status, description: description.slice(0, 16000) || item.description,
    beds: detail?.beds || item.beds, baths: detail?.baths || item.baths, sqft: detail?.sqft || item.sqft,
    listingNumber:detail?.listingNumber||item.listingNumber,propertyType:detail?.propertyType||item.propertyType,neighborhood: detail?.neighborhood || item.neighborhood, image: images[0] || item.image, images };
}

export async function enrichPublicProperty(item:DiscoveredListing,fetchHtml:FetchHtml,
  initial?:{html:string;finalUrl:URL}):Promise<DiscoveredListing>{
  const request=propertyDetailRequest(item.sourceUrl);
  const page=initial&&(initial.finalUrl.toString()===request.url||!request.fragment)?initial:await fetchHtml(request.url,{fragment:request.fragment});
  let enriched=enrichListingFromPage(item,page.html,page.finalUrl);
  const factsUrl=propertyFactsRequest(page.html,page.finalUrl,item);
  if(factsUrl)try{const facts=await fetchHtml(factsUrl,{fragment:true});enriched=enrichPropertyFacts(enriched,facts.html);}catch{/* Gallery and remarks remain useful if the optional facts fragment is unavailable. */}
  const galleryRequest=propertyGalleryRequest(page.html,page.finalUrl,item);
  if(galleryRequest)enriched={...enriched,detailsComplete:false};
  if(galleryRequest)try{
    const gallery=await fetchHtml(galleryRequest,{fragment:true});
    if(gallery.finalUrl.toString()===galleryRequest){
      const images=propertyGalleryImages(gallery.html,gallery.finalUrl);
      if(images.length)enriched={...enriched,images,image:images[0],detailsComplete:true};
    }
  }catch{/* Preserve available property data; incomplete details remain visible in source feedback. */}
  return enriched;
}

/** Public provider galleries are scoped to the exact property and same source origin. */
export function propertyGalleryRequest(html:string,base:URL,item:DiscoveredListing):string|undefined {
  const source=new URL(item.sourceUrl);
  const idx=source.pathname.match(/\/idx\/details\/listing\/([^/]+)\/([^/]+)/i);
  if(idx&&base.origin===source.origin){
    for(const tag of html.match(/<a\b[^>]*>/gi)??[]){
      const raw=absolutize(attr(tag,"href"),base);if(!raw)continue;
      const url=new URL(raw);
      if(url.origin===source.origin&&url.pathname===`/idx/photogallery/${idx[1]}/${idx[2]}`)return raw;
    }
  }
  // dsIDXpress publishes its Juicebox config via this read-only action. Parse literals, never execute scripts.
  const pid=html.match(/dsidx\.details\.pid\s*=\s*(\d+)\s*;/)?.[1];
  if(pid&&/configUrl\s*:\s*dsidx\.details\.GetConfigUrl\(\)/.test(html)&&base.origin===source.origin){
    const config=html.match(/(?:var\s+)?dsidxAjaxHandler\s*=\s*(\{[^;]+\})\s*;/)?.[1];
    try{
      const raw=config?JSON.parse(config).ajaxurl:undefined;
      const url=raw?new URL(raw,base):undefined;
      if(url&&url.origin===base.origin&&url.pathname==="/wp-admin/admin-ajax.php"){
        url.search="";url.searchParams.set("action","dsidx_client_assist");url.searchParams.set("dsidx_action","GetPhotosXML");url.searchParams.set("pid",pid);return url.toString();
      }
    }catch{/* Invalid configuration is not a gallery URL. */}
  }
}

export function propertyGalleryImages(html:string,base:URL):string[]{
  const images:string[]=[];
  for(const tag of html.match(/<(?:img|image)\b[^>]*>/gi)??[]){
    const xml=/^<image\b/i.test(tag),cls=attr(tag,"class");
    if(!xml&&!/IDX-detailsPrimaryImg/i.test(cls))continue;
    const raw=xml?attr(tag,"imageURL"):attr(tag,"data-src")||attr(tag,"src");
    const url=absolutize(raw.trim(),base);
    if(url&&!looksLikeChrome(url))images.push(url);
  }
  return distinctPropertyImages(images);
}

/** A frameset whose only document is one HTTPS frame. Widgets and multi-frame pages are not this. */
function soleFrameDocument(html: string, base: URL): string | null {
  if (!/<frameset\b/i.test(html)) return null;
  const frames = [...html.matchAll(/<frame\b([^>]*)>/gi)];
  if (frames.length !== 1) return null;
  const src = absolutize(attr(`<frame ${frames[0][1]}>`, "src"), base);
  if (!src) return null;
  try {
    const next = new URL(src);
    if (next.protocol !== "https:" || next.username || next.password || LOGIN_PATH.test(next.pathname)) return null;
    next.hash = "";
    return next.toString();
  } catch { return null; }
}

/**
 * Walk seed URLs → inventory CTAs → optional detail pages.
 * Caps pages and depth so the builder stays snappy.
 */
/** Property detail pages read at once. Each is an independent public page. After any 429/5xx the
 * extra workers retire, returning to the previous three-at-a-time pace for that import. */
const DETAIL_CONCURRENCY = 6;
const THROTTLED_DETAIL_CONCURRENCY = 3;

/** Observational discovery progress: real tallies only. */
export type DiscoveryProgress =
  | { phase: "inventory"; url: string; pages: number; found: number }
  | { phase: "render"; url: string; state: "start" | "done" | "failed" }
  /** done = detail pages handled; enriched = listings whose full details were actually read. */
  | { phase: "details"; url: string; done: number; total: number; enriched: number };

export async function discoverListings(
  seedUris: string[],
  fetchHtml: FetchHtml,
  options?: { maxDepth?: number; maxPages?: number; maxListings?: number; maxDurationMs?: number; maxDetailPages?: number; selectLinks?: SelectInventoryLinks;
    normalizePage?: (html: string, base: URL) => Promise<DiscoveredListing[]>;
    /** Optional public browser renderer; absent renderers must report unsupported dynamic pages. */
    renderPage?: FetchHtml;
    /** Per-import render attempts. Ordinary static imports never render. */
    maxRenders?: number;
    /** Enrich every discovered listing. Detail requests do not consume the collection page budget. */
    enrichAll?: boolean;
    /**
     * With enrichAll: read details for at most this many listings in this job. The rest are reported
     * as deferred (meta.enrichment.deferred) for follow-up detail jobs; nothing is skipped or marked read.
     */
    detailBudget?: number;
    /** User-authorized session cookie. Never logged, stored in meta, or written into fixtures. */
    sessionCookie?: string;
    /** Observes real progress (pages examined, listings found, renders, detail pages). Never alters discovery. */
    onProgress?: (event: DiscoveryProgress) => void },
): Promise<{ listings: DiscoveredListing[]; meta: ListingDiscoveryMeta }> {
  const report = (event: DiscoveryProgress) => { try { options?.onProgress?.(event); } catch { /* progress is observational */ } };
  if (options?.renderPage && options.onProgress) {
    const render = options.renderPage;
    options = { ...options, renderPage: async (uri, renderOptions) => {
      report({ phase: "render", url: uri, state: "start" });
      try {
        const page = await render(uri, renderOptions);
        report({ phase: "render", url: uri, state: "done" });
        return page;
      } catch (error) {
        report({ phase: "render", url: uri, state: "failed" });
        throw error;
      }
    } };
  }
  const maxDepth = options?.maxDepth ?? 5;
  const maxPages = options?.maxPages ?? 20;
  const maxListings = options?.maxListings ?? 24;

  const visited: string[] = [];
  const visitedSet = new Set<string>();
  const listings: DiscoveredListing[] = [];
  const listingKeys = new Set<string>();
  const failed: string[] = [];
  const failureDetails:{url:string;reason:string}[]=[];
  const inventoryUrls = new Set<string>();
  const interfaces = new Set<string>();
  const compatibilityPages: CompatibilityPage[] = [];
  const publicDetails = new Map<string,{url:string;activationToken:string}>();
  const gateCookies = new Map<string, string>();
  const csrfTokens = new Map<string, string>();
  const candidateMap = new Map<string, { id: string; confidence: number; evidence: string }>();
  const obstacles: NonNullable<ListingDiscoveryMeta["obstacles"]> = [];
  const stages: string[] = [];
  if (options?.sessionCookie) stages.push("session_initialized");
  const cookieFor = (url: string, explicit?: string) => {
    if (explicit) return explicit;
    let gate: string | undefined;
    try { gate = gateCookies.get(new URL(url).origin); } catch { gate = undefined; }
    const session = options?.sessionCookie;
    if (gate && session) return `${gate}; ${session}`;
    return gate || session;
  };
  const csrfFor = (url: string) => { try { return csrfTokens.get(new URL(url).origin); } catch { return undefined; } };
  const requestOptions = (url: string, extra?: { fragment?: boolean; activationToken?: string; cookie?: string }) => {
    const csrf = csrfFor(url);
    return { fragment: extra?.fragment, activationToken: extra?.activationToken, cookie: extra?.cookie ?? cookieFor(url), ...(csrf ? { csrfToken: csrf } : {}) };
  };
  const issues: NonNullable<ListingDiscoveryMeta["issues"]> = [];
  let limitedShowcase = false;
  const deadline = Date.now() + (options?.maxDurationMs ?? 45000);
  let aiRoutes = 0;
  let aiNormalizations = 0;
  let expectedCount = 0;
  let unresolvedPagination = false;
  let openContinuation = false;
  let continuationRequests = 0;
  let collectionPages = 0;
  let structuredPages = 0;
  let singlePagePages = 0;
  let cursorTerminalPages = 0;
  let providerTerminalPages = 0;
  let sawContinuation = false;
  let continuationMechanism = "";
  let apiCount = false;
  const renderedChallenges = new Set<string>();
  let rendersUsed = 0;
  let collectionRowsFetched = 0;
  let offsetQueryTotal = 0;
  let hitSafetyCap = false;
  let omissionTotal = 0;
  const omissionReasons = new Map<string, number>();
  const pendingContinuations = new Set<string>();
  const listingUrlTemplates = new Map<string, PublishedUrlTemplate>();
  const maxRenders = options?.maxRenders ?? 4;
  let hops = 0;
  let maxDepthReached = 0;

  /** claimed: a link on the path to this page claimed the agent's own inventory, or the request is agent-scoped. */
  type QueueItem = { url: string; depth: number; priority: number; fragment?: boolean; broad?: boolean; parent?: string; activationToken?: string; cookie?: string; retries?: number; continuation?: boolean; claimed?: boolean };
  const queue: QueueItem[] = [...new Set(seedUris.filter(Boolean))].map((url, i) => ({ url, depth: 0, priority: 150 - i }));
  // Ownership and scope: navigation stays inside the seed's scope; market feeds keep only own listings.
  const seedScopes = [...new Set(seedUris.filter(Boolean))].flatMap(url => { try { return [seedScope(new URL(url))]; } catch { return []; } });
  const inScope = (url: string, label?: string) => !seedScopes.length || seedScopes.some(scope => navigationInScope(url, scope, label));
  let identity: SiteIdentity | undefined;
  const marketPages: string[] = [];
  /** Listings that came from a paginated or large collection (candidates for detail-level market evidence). */
  const pagedCollectionListings = new Set<string>();
  let largeCollectionSeen = false;
  let excludedOtherOffice = 0, outOfScopeLinks = 0;

  const pushListing = (item: DiscoveredListing) => {
    const sourceUrl = canonicalListingUrl(item.sourceUrl);
    const normalized = sourceUrl === item.sourceUrl ? item : { ...item, sourceUrl };
    const key = listingIdentityKey(normalized);
    const index = listings.findIndex(row => listingIdentityKey(row) === key);
    if (index >= 0) {
      const old = listings[index];
      const images = [...new Set([...normalized.images, ...old.images])].slice(0, 500);
      listings[index] = { ...old, title: preferTitle(old.title, normalized.title),
        description: normalized.description.length > old.description.length ? normalized.description : old.description,
        price: old.price || normalized.price, beds: old.beds || normalized.beds, baths: old.baths || normalized.baths, sqft: old.sqft || normalized.sqft,
        status: old.status ?? normalized.status, image: images[0] || old.image, images,
        listingNumber: old.listingNumber || normalized.listingNumber, neighborhood: old.neighborhood || normalized.neighborhood,
        sourceStatus: old.sourceStatus && old.sourceStatus !== "unspecified" ? old.sourceStatus : normalized.sourceStatus,
        ...(old.listingOffice || normalized.listingOffice ? { listingOffice: old.listingOffice || normalized.listingOffice } : {}),
        ...(old.ownership || normalized.ownership ? { ownership: old.ownership === "own" || normalized.ownership === "own" ? "own" as const : "featured" as const } : {}),
        sourceUrl: canonicalListingUrl(old.sourceUrl) };
      return;
    }
    listingKeys.add(key);
    listings.push(normalized);
  };

  while (queue.length && visited.length < maxPages && listings.length < maxListings && Date.now() < deadline) {
    queue.sort((a, b) => b.priority - a.priority);
    const next = queue.shift()!;
    let normalized = next.url;
    try {
      const u = new URL(normalized);
      u.hash = "";
      normalized = u.toString();
    } catch {
      continue;
    }
    if (visitedSet.has(normalized)) continue;
    visitedSet.add(normalized);
    visited.push(normalized);
    maxDepthReached = Math.max(maxDepthReached, next.depth);
    report({ phase: "inventory", url: normalized, pages: visited.length, found: listings.length });

    let html: string;
    let finalUrl: URL;
    let pendingRenderNetwork: { url: string; html: string }[] | null = null;
    try {
      const page = await fetchHtml(normalized, requestOptions(normalized, { fragment: next.fragment, activationToken: next.activationToken, cookie: cookieFor(normalized, next.cookie) }));
      html = page.html;
      finalUrl = page.finalUrl;
      hops += 1;
      visitedSet.add(finalUrl.toString());
      if (next.continuation) continuationRequests++;
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 180) : "Unreadable public response";
      const rateLimited = /\b429\b|too many requests|rate[- ]limited/i.test(reason);
      const transient = /\b(?:502|503|504)\b|temporarily unavailable/i.test(reason);
      const attempts = next.retries ?? 0;
      if ((rateLimited || transient) && attempts < 2 && Date.now() < deadline) {
        visited.pop();
        visitedSet.delete(normalized);
        const code = rateLimited ? "rate_limited" : "temporarily_unavailable";
        if (!obstacles.some(row => row.code === code && row.url === normalized)) obstacles.push({ code, url: normalized, detail: "retrying" });
        stages.push(rateLimited ? "rate_limit_retry" : "transient_retry");
        const retryAfter = Number(reason.match(/retry-after\s*[:=]?\s*(\d+(?:\.\d+)?)/i)?.[1]);
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 1500) : Math.min(40 * 2 ** attempts, 400);
        await new Promise(resolve => setTimeout(resolve, delay));
        queue.unshift({ ...next, retries: attempts + 1, priority: next.priority + 1 });
        continue;
      }
      if (rateLimited || transient) obstacles.push({ code: rateLimited ? "rate_limited" : "temporarily_unavailable", url: normalized, detail: "exhausted" });
      if (next.continuation) openContinuation = true;
      failureDetails.push({url:normalized,reason});
      failed.push(normalized);
      continue;
    }
    if (!listings.length && !next.fragment && !next.continuation) {
      const framed = soleFrameDocument(html, finalUrl);
      if (framed && framed !== finalUrl.toString() && !visitedSet.has(framed) && !queue.some(item => item.url === framed)) {
        stages.push("frame_document");
        // A page that is only a frame around another document presents that document as its own.
        queue.unshift({ url: framed, depth: next.depth, priority: 250, parent: finalUrl.toString(), claimed: true });
        continue;
      }
    }
    if (isPublishedScriptGate(html)) {
      const solved = await publishedScriptGateCookie(html);
      if (solved) {
        gateCookies.set(finalUrl.origin, solved);
        try {
          const unlocked = await fetchHtml(finalUrl.toString(), requestOptions(finalUrl.toString(), { fragment: next.fragment, activationToken: next.activationToken, cookie: solved }));
          hops += 1;
          if (!isPublishedScriptGate(unlocked.html)) {
            html = unlocked.html;
            finalUrl = unlocked.finalUrl;
            visitedSet.add(finalUrl.toString());
          }
        } catch { /* The published puzzle did not unlock; classified below. */ }
      }
    }

    for (const id of detectListingInterfaces(html, finalUrl)) interfaces.add(id);
    // A general market search is a navigation step, not evidence of the agent's inventory.
    const broad = next.broad && !/office_listing_categories|agent_listing_categories/.test(finalUrl.pathname);
    if (!broad) {
      const count = html.match(/data-(?:search-results-search-count|listings-count|results-count)\s*=\s*["']?(\d+)/i)?.[1];
      if (count) expectedCount = Math.max(expectedCount, Number(count));
    }
    const publicResponse = broad ? null : listingsFromBrivityResponse(html, finalUrl);
    if (publicResponse) { expectedCount = Math.max(expectedCount, publicResponse.count); apiCount = true; }
    try { const payload=JSON.parse(html); const counts=payload.counts;
      const accounted = publishedCollectionTotal(payload);
      const total=Number(payload.total ?? payload.totalCount ?? payload["@odata.count"] ?? accounted.total ?? (typeof counts === "number" ? counts : counts && typeof counts === "object" ? counts.total ?? counts.all ?? counts.active : undefined));
      if (!broad && Number.isFinite(total) && total > 0) { expectedCount=Math.max(expectedCount,total); apiCount = true; }
      if (!broad && accounted.total && /\/graphql$/i.test(finalUrl.pathname)) {
        collectionRowsFetched += accounted.rows;
        offsetQueryTotal = Math.max(offsetQueryTotal, accounted.total);
      }
    } catch { /* HTML */ }
    if(next.activationToken && finalUrl.hostname === "www.idxhome.com"){try{const rows=JSON.parse(html);if(Array.isArray(rows))for(const row of rows){if(row.featured===true && row.statusId==="active" && /^[a-z0-9_-]+$/i.test(row.id) && typeof row.listingPageUrl==="string") publicDetails.set(row.listingPageUrl,{url:"https://www.idxhome.com/api/kestrel/listing/"+row.id+".json?context=DETAIL",activationToken:next.activationToken});}}catch{/* other formats */}}
    const showcase = broad ? [] : listingsFromIdxShowcase(html, finalUrl);
    if (/cbw-slider-listing/.test(html) && next.depth===0) {limitedShowcase=true;issues.push({code:"limited-showcase",url:finalUrl.toString(),interface:"agentfire-dsidx"});}
    if (showcase.length) { limitedShowcase = true; issues.push({code:"limited-showcase",url:finalUrl.toString(),interface:"idx-broker"}); }
    for (const candidate of architectureCandidates(html, finalUrl)) {
      const prior = candidateMap.get(candidate.id);
      if (!prior || candidate.confidence > prior.confidence) candidateMap.set(candidate.id, candidate);
    }
    const publishedCsrf = csrfTokenFromHtml(html);
    if (publishedCsrf) csrfTokens.set(finalUrl.origin, publishedCsrf);
    if (!stages.includes("architecture_detected")) stages.push("architecture_detected");
    const ownInventoryLinks = collectInventoryLinks(html,finalUrl,6).filter(c=>/\bmy\b/i.test(c.label)&&/\bactive\b/i.test(c.label)&&!DETAIL_PATH.test(new URL(c.url).pathname.replace("/listings/", "/inventory/")));
    let observation = describeListingArchitecture(html, finalUrl);
    compatibilityPages.push(observation);
    if (isPublishedScriptGate(html)) {
      if (options?.renderPage && Date.now() < deadline && rendersUsed < maxRenders) {
        rendersUsed++;
        try {
          const gate = cookieFor(finalUrl.toString());
          const rendered = await options.renderPage(finalUrl.toString(), gate ? { cookie: gate } : undefined);
          if (sameSite(rendered.finalUrl, finalUrl) && !isPublishedScriptGate(rendered.html) && !isBlockedRender(rendered.html) && !LOGIN_PATH.test(rendered.finalUrl.pathname)) {
            html = rendered.html;
            finalUrl = rendered.finalUrl;
            stages.push("browser_render_escalated");
            stages.push("browser:script-gate");
            observation = describeListingArchitecture(html, finalUrl, "rendered-dom");
            compatibilityPages.push(observation);
          }
        } catch (error) {
          obstacles.push({ code: "render_failed", url: finalUrl.toString(), detail: error instanceof Error ? error.message.slice(0, 120) : "renderer unavailable" });
        }
      }
      if (isPublishedScriptGate(html)) {
        interfaces.add("script-gate");
        inventoryUrls.add(finalUrl.toString());
        issues.push({ code: "requires-rendering", url: finalUrl.toString(), interface: "script-gate" });
        observation.resolution = "requires-rendering";
        observation.interfaces = [...new Set([...observation.interfaces, "script-gate"])];
        obstacles.push({ code: "script_gate", url: finalUrl.toString(), detail: "Published cookie puzzle did not unlock" });
        stages.push("user_action_required");
        continue;
      }
    }
    if (isRobotChallenge(html)) {
      let obstacle = classifyObstacle(html) ?? "captcha_required";
      let carriedNetwork: { url: string; html: string }[] | null = null;
      if (obstacle === "requires_rendering" && options?.renderPage && !renderedChallenges.has(finalUrl.origin) && Date.now() < deadline && rendersUsed < maxRenders) {
        rendersUsed++;
        stages.push("browser_render_escalated");
        stages.push("browser:interstitial");
        try {
          const gate = cookieFor(finalUrl.toString());
          const rendered = await options.renderPage(finalUrl.toString(), gate ? { cookie: gate } : undefined);
          if (sameSite(rendered.finalUrl, finalUrl) && !LOGIN_PATH.test(rendered.finalUrl.pathname)) {
            html = rendered.html;
            finalUrl = rendered.finalUrl;
            carriedNetwork = rendered.network ?? [];
            if (isRobotChallenge(html)) {
              obstacle = classifyObstacle(html) ?? obstacle;
              renderedChallenges.add(finalUrl.origin);
              stages.push("browser_challenge_persistent");
            } else stages.push("browser_fallback_interstitial");
          }
        } catch (error) {
          obstacles.push({ code: "render_failed", url: finalUrl.toString(), detail: error instanceof Error ? error.message.slice(0, 120) : "renderer unavailable" });
        }
      }
      if (isRobotChallenge(html)) {
        const iface = /\/api-site\/search\/(?:realTimeListings|searchListListing|searchMapListing)\b/.test(finalUrl.pathname) ? "chime-site-search" : obstacle === "requires_rendering" ? "managed-challenge" : "robot-validate";
        interfaces.add(iface);
        inventoryUrls.add(finalUrl.toString());
        issues.push({ code: "requires-rendering", url: finalUrl.toString(), interface: iface });
        observation.resolution = "requires-rendering";
        observation.interfaces = [...new Set([...observation.interfaces, iface])];
        if (iface === "chime-site-search" && next.parent) {
          for (let i = queue.length - 1; i >= 0; i--) {
            if (queue[i].parent === next.parent && !/\/api-site\/search\//.test(new URL(queue[i].url).pathname)) queue.splice(i, 1);
          }
        }
        if (!obstacles.some(row => row.url === finalUrl.toString() && row.code === obstacle)) obstacles.push({ code: obstacle, url: finalUrl.toString(), detail: options?.renderPage ? undefined : "No browser renderer is configured" });
        if (obstacle === "captcha_required" || obstacle === "authentication_required") stages.push("user_action_required");
        continue;
      }
      pendingRenderNetwork = carriedNetwork;
    }
    const excluded = broad || next.depth===0 && ownInventoryLinks.length > 0;
    if (excluded) observation.resolution = broad ? "excluded-market" : "navigation-only";
    const listingTemplate = publishedListingUrlTemplate(html);
    if (listingTemplate) listingUrlTemplates.set(finalUrl.origin, listingTemplate);
    if (/\/graphql$/i.test(finalUrl.pathname)) html = applyPublishedListingUrls(html, listingUrlTemplates.get(finalUrl.origin) ?? null);
    if (next.depth === 0 && !identity) identity = siteIdentity(html, finalUrl);
    const claimedNow = !!next.claimed || agentScopedRequest(next.url) || agentScopedRequest(finalUrl.toString());
    let found = excluded ? [] : extractListingsFromPage(html, finalUrl, observation.attempts);
    // A collection on another company's website is the agent's inventory only when the path claimed it
    // ("Our properties", "My listings"), the request is agent/office-filtered, or it is a listing transport.
    // Public fragments and provider APIs are transport by construction; only navigated pages are judged.
    const offSite = !next.fragment && seedScopes.length > 0 && !seedScopes.some(scope => registrableDomain(finalUrl.hostname) === scope.domain) && !MLS_INVENTORY_HOST.test(finalUrl.hostname);
    let unscopedOffSite = false;
    if (found.length && offSite && !claimedNow) {
      unscopedOffSite = true;
      excludedOtherOffice += found.length;
      marketPages.push(finalUrl.toString());
      stages.push("unscoped_offsite_collection");
      found = [];
    }
    let marketPage = unscopedOffSite;
    if (found.length) {
      const published = Number(html.match(/data-(?:search-results-search-count|listings-count|results-count)\s*=\s*["']?(\d+)/i)?.[1] ?? 0);
      const extent = pagerExtent(visibleDocument(html), finalUrl, found.map(item => item.sourceUrl));
      const paginated = !!next.continuation || published > found.length || extent > 1 || paginationLinks(visibleDocument(html), finalUrl).length > 0;
      const large = extent >= 20 || published >= 300;
      // An agent/office-filtered request is the agent's inventory; it is never classified as a market.
      const agentScoped = agentScopedRequest(finalUrl.toString()) || agentScopedRequest(next.url);
      if ((paginated || large) && !agentScoped) for (const item of found) pagedCollectionListings.add(canonicalListingUrl(item.sourceUrl));
      if (large && !agentScoped) largeCollectionSeen = true;
      if (found.length >= 3 && !agentScoped) {
      const collection = classifyCollection(found, attributeListingOffices(html, found), identity, paginated, large);
      if (collection.kind === "market") {
        marketPage = true;
        marketPages.push(finalUrl.toString());
        excludedOtherOffice += collection.excluded;
        stages.push("market_feed_scoped");
      }
      found = collection.keep;
      }
    }
    if (found.length) observation.resolution = "known-pattern";
    const activeFound = found.filter(item => !historicalListing(item));
    if (found.length && !activeFound.length) stages.push("historical_inventory_ignored");
    const hint = !broad && !activeFound.length ? dynamicInterfaceHint(html) : undefined;
    if (hint) { interfaces.add(hint); inventoryUrls.add(finalUrl.toString()); }
    if (!found.length && !broad && options?.normalizePage && aiNormalizations < 2 &&
      (PATH_INVENTORY.test(finalUrl.pathname) || next.fragment) && Date.now() < deadline) {
      aiNormalizations++;
      try { found = await options.normalizePage(html, finalUrl); if (found.length) observation.resolution = "external-normalizer"; } catch { /* deterministic navigation continues */ }
    }
    const activeFragments = collectInventoryFragments(html, finalUrl).filter(url => !historicalInventoryUrl(url));
    if (hint && !activeFound.length && !activeFragments.length && !kestrelInventoryRequests(html).length && !renderedChallenges.has(finalUrl.origin)) {
      let renderedNetwork: { url: string; html: string }[] = pendingRenderNetwork ?? [];
      if ((!pendingRenderNetwork && options?.renderPage && Date.now() < deadline && rendersUsed < maxRenders) || pendingRenderNetwork) {
        if (!pendingRenderNetwork) {
          rendersUsed++;
          stages.push("browser_render_escalated");
          stages.push("browser:incomplete-shell");
        }
        try {
          if (!pendingRenderNetwork && options?.renderPage) {
            const gate = cookieFor(finalUrl.toString());
            const rendered=await options.renderPage(finalUrl.toString(), gate ? { cookie: gate } : undefined);
            if (isBlockedRender(rendered.html)) {
              // Keep the readable plain document; navigation from it continues.
              obstacles.push({ code: "render_failed", url: finalUrl.toString(), detail: "The renderer was refused by the site" });
              stages.push("browser_render_refused");
            } else if (sameSite(rendered.finalUrl,finalUrl) && !LOGIN_PATH.test(rendered.finalUrl.pathname)) {
              html=rendered.html; finalUrl=rendered.finalUrl;
              renderedNetwork = rendered.network ?? [];
              observation = describeListingArchitecture(html, finalUrl, "rendered-dom");
              compatibilityPages.push(observation);
              for (const id of observation.interfaces) interfaces.add(id);
              for (const candidate of architectureCandidates(html, finalUrl)) {
                const prior = candidateMap.get(candidate.id);
                if (!prior || candidate.confidence > prior.confidence) candidateMap.set(candidate.id, candidate);
              }
              found=extractListingsFromPage(html,finalUrl,observation.attempts);
              if (found.length) observation.resolution = "known-pattern";
            }
          }
          for (const entry of renderedNetwork) {
            let entryUrl: URL;
            try { entryUrl = new URL(entry.url); } catch { continue; }
            if (!entry.html || !(sameSite(entryUrl, finalUrl) || MLS_INVENTORY_HOST.test(entryUrl.hostname))) continue;
            const networkObservation = describeListingArchitecture(entry.html, entryUrl, "rendered-dom");
            const rows = extractListingsFromPage(entry.html, entryUrl, networkObservation.attempts);
            const activeRows = rows.filter(item => !historicalListing(item));
            if (rows.length && !activeRows.length) {
              stages.push("historical_inventory_ignored");
            } else if (activeRows.length) {
              networkObservation.resolution = "known-pattern";
              compatibilityPages.push(networkObservation);
              let scoped: DiscoveredListing[] = [];
              try { scoped = completeSearchGroups(JSON.parse(entry.html), entryUrl); } catch { scoped = []; }
              if (scoped.length && scoped.length === rows.length && activeRows.length === rows.length) {
                found = rows;
                expectedCount = Math.max(expectedCount, scoped.length);
                apiCount = true;
              } else found.push(...activeRows);
              visitedSet.add(entry.url);
              stages.push("api_discovered");
              observation.resolution = "known-pattern";
            } else if (!historicalInventoryUrl(entry.url) && /\/(?:api|graphql)|listing|search/i.test(entryUrl.pathname) && !visitedSet.has(entry.url) && !queue.some(q => q.url === entry.url)) {
              queue.push({ url: entry.url, depth: next.depth, priority: 210, fragment: true, parent: finalUrl.toString(), claimed: claimedNow });
              stages.push("api_discovered");
            }
          }
        } catch (error) {
          obstacles.push({ code: "render_failed", url: finalUrl.toString(), detail: error instanceof Error ? error.message.slice(0, 120) : "renderer unavailable" });
        }
      }
      const structuredNext = collectInventoryFragments(html, finalUrl).length || kestrelInventoryRequests(html).length;
      if (!found.length && !structuredNext) {
        issues.push({code:"requires-rendering",url:finalUrl.toString(),interface:hint});
        observation.resolution = "requires-rendering";
        const code = classifyObstacle(html) ?? "requires_rendering";
        if (!obstacles.some(row => row.url === finalUrl.toString() && row.code === code)) obstacles.push({ code, url: finalUrl.toString(), detail: options?.renderPage ? undefined : "No browser renderer is configured" });
      } else if (!found.length && structuredNext) {
        stages.push("api_discovered");
        if (observation.resolution !== "known-pattern") observation.resolution = "navigation-only";
      }
    }
    if (found.some(item => !historicalListing(item)) && next.fragment && next.parent) {
      // Once the shell's inventory loads, discard its toolbar/search alternatives.
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].parent === next.parent && !queue[i].fragment) queue.splice(i, 1);
      }
    }
    if (!broad && /\/graphql$/i.test(finalUrl.pathname)) {
      try {
        const payload = JSON.parse(html);
        const { rows } = publishedCollectionTotal(payload);
        if (rows > found.length) {
          const gap = rows - found.length;
          omissionTotal += gap;
          omissionReasons.set("excluded_missing_required_fields", (omissionReasons.get("excluded_missing_required_fields") ?? 0) + gap);
        }
      } catch { /* a rendered document is not a counted collection payload */ }
    }
    if (found.length || MLS_INVENTORY_HOST.test(finalUrl.hostname) || PATH_INVENTORY.test(finalUrl.pathname)) inventoryUrls.add(finalUrl.toString());
    const publishedQueries = broad ? [] : publishedCollectionRequests(html, finalUrl);
    // A page that publishes a scoped, counted query is not itself the inventory. Shell cards can be sold, nearby, or unscoped.
    // Active rows fill the cap first. Historical rows stay for accounting and are not the collection.
    if (!publishedQueries.length) {
      const ranked = [...found.filter(item => !historicalListing(item)), ...found.filter(item => historicalListing(item))];
      for (const item of ranked) {
        if (next.depth === 0 && found.length === 1 && !item.price && item.sourceUrl === finalUrl.toString()) continue;
        pushListing(item);
        if (listings.length >= maxListings) break;
      }
    }

    if (listings.length >= maxListings) {
      hitSafetyCap = true;
      if (!broad) {
        const boundary = inspectCollectionDocument(html, finalUrl, found);
        if (boundary.open || boundary.continuations.length) openContinuation = true;
        for (const url of boundary.continuations) pendingContinuations.add(url);
        if (boundary.publishedCount && boundary.publishedCount > listings.length) expectedCount = Math.max(expectedCount, boundary.publishedCount);
      }
      continue;
    }
    if (!broad) {
      for(const request of kestrelInventoryRequests(html)){ if(!visitedSet.has(request.url)&&!queue.some(q=>q.url===request.url)) queue.push({...request,depth:next.depth,priority:220,fragment:true,parent:finalUrl.toString(),claimed:claimedNow}); }
      for (const url of collectInventoryFragments(html, finalUrl)) {
        if (historicalInventoryUrl(url) || visitedSet.has(url) || queue.some(q => q.url === url)) continue;
        queue.push({ url, depth: next.depth, priority: 200, fragment: true, parent: finalUrl.toString(), claimed: claimedNow });
      }
      for (const url of publishedQueries) {
        if (!visitedSet.has(url) && !queue.some(q => q.url === url)) {
          sawContinuation = true;
          continuationMechanism = continuationMechanism || "offset-query";
          queue.push({ url, depth: next.depth, priority: 205, fragment: true, parent: finalUrl.toString(), continuation: true, claimed: claimedNow });
        }
      }
      if (found.length) {
        const boundary = inspectCollectionDocument(html, finalUrl, found);
        const collectionPage = found.length > 1 || found.some(item => item.sourceUrl !== finalUrl.toString());
        if (collectionPage) {
          collectionPages++;
          if (boundary.publishedCount) {
            expectedCount = Math.max(expectedCount, boundary.publishedCount);
            if (boundary.publishedKind === "api") apiCount = true;
          }
          if (boundary.continuations.length) { sawContinuation = true; continuationMechanism = continuationMechanism || boundary.mechanism; }
          if (boundary.open) openContinuation = true;
          if (boundary.repeatedCursor) openContinuation = true;
          if (!boundary.open && !boundary.continuations.length && boundary.structuredClosed) structuredPages++;
          if (!boundary.open && !boundary.continuations.length && boundary.singlePageConfirmed) singlePagePages++;
          if (!boundary.open && boundary.cursorTerminal) cursorTerminalPages++;
          if (!boundary.open && boundary.providerTerminal) providerTerminalPages++;
          for (const url of marketPage ? [] : boundary.continuations) {
            if (url === finalUrl.toString()) { openContinuation = true; continue; }
            if (!visitedSet.has(url) && !queue.some(q => q.url === url)) queue.push({ url, depth: next.depth, priority: 180, fragment: next.fragment, continuation: true, claimed: claimedNow });
          }
        }
        // Flexmls uses public paged fragments without a Next anchor.
        if (next.fragment && finalUrl.searchParams.get("list_view") === "photo" && found.length === 24) {
          const url = new URL(finalUrl);
          url.searchParams.set("page", String(Number(url.searchParams.get("page") ?? 1) + 1));
          const nextUrl = url.toString();
          if (!visitedSet.has(nextUrl) && !queue.some(q => q.url === nextUrl)) {
            sawContinuation = true;
            continuationMechanism = continuationMechanism || "numbered-pagination";
            queue.push({ url: nextUrl, depth: next.depth, priority: 180, fragment: true, continuation: true, claimed: claimedNow });
          }
        } else if (next.fragment && finalUrl.searchParams.get("list_view") === "photo" && found.length > 0 && found.length < 24) {
          providerTerminalPages++;
        }
      }
      if (/\/graphql$/i.test(finalUrl.pathname)) {
        try {
          const accounted = publishedCollectionTotal(JSON.parse(html));
          const nextUrl = accounted.total ? nextPublishedOffsetUrl(finalUrl, accounted.total, accounted.rows) : null;
          if (nextUrl && !visitedSet.has(nextUrl) && !queue.some(q => q.url === nextUrl)) {
            sawContinuation = true;
            continuationMechanism = continuationMechanism || "offset-query";
            queue.push({ url: nextUrl, depth: next.depth, priority: 190, fragment: true, continuation: true, claimed: claimedNow });
          }
        } catch { /* not a collection payload */ }
      }
    }
    if (next.depth >= maxDepth) continue;

    const ctas = found.length || chimeListingSearchRequests(html, finalUrl).length ? [] : ownInventoryLinks.length ? ownInventoryLinks : collectInventoryLinks(html, finalUrl, 6);
    for (const cta of ctas) {
      if (visitedSet.has(cta.url)) continue;
      if (isPagerOf(cta.url, finalUrl, cta.label)) continue;
      if (!inScope(cta.url, cta.label)) { outOfScopeLinks++; continue; }
      if (queue.some((q) => q.url === cta.url)) continue;
      const broad = /property\s+search|search\s+(?:all\s+)?(?:homes|properties)|all\s+(?:homes|properties|listings)/i.test(cta.label) &&
        !/\bmy\b|\bour\b|featured|exclusive|office_listing_categories|agent_listing_categories/i.test(cta.label + cta.url);
      queue.push({ url: cta.url, depth: next.depth + 1, priority: cta.score, broad, parent: finalUrl.toString(), claimed: claimedNow || OWN_INVENTORY_LABEL.test(cta.label) || cta.label === "embedded listings" || agentScopedRequest(cta.url) });
    }

    if (!listings.length && !queue.length && options?.selectLinks && aiRoutes < 2 && Date.now() < deadline) {
      const candidates = navigationCandidates(html, finalUrl).filter(c => !visitedSet.has(c.url));
      if (candidates.length) {
        aiRoutes++;
        try {
          const selected = await options.selectLinks(finalUrl.toString(), candidates);
          // Never fetch a URL invented by the model, or follow its page-supplied instructions.
          for (const url of [...new Set(selected)].slice(0, 4)) {
            if (candidates.some(c => c.url === url) && inScope(url, candidates.find(c => c.url === url)?.label)) queue.push({ url, depth: next.depth + 1, priority: 100, claimed: claimedNow || OWN_INVENTORY_LABEL.test(candidates.find(c => c.url === url)?.label ?? "") });
          }
        } catch { /* navigation remains useful when AI is unavailable */ }
      }
    }

    // From an inventory page with card links, follow a few detail URLs that still lack photos/price.
    if (next.depth >= 1 && found.length > 0 && found.length < 8) {
      for (const item of found.slice(0, 4)) {
        if (visitedSet.has(item.sourceUrl)) continue;
        if (item.images.length && item.price) continue;
        queue.push({ url: item.sourceUrl, depth: next.depth + 1, priority: 20, claimed: claimedNow });
      }
    }
  }

  report({ phase: "inventory", url: visited[visited.length - 1] ?? seedUris[0] ?? "", pages: visited.length, found: listings.length });
  // Detail enrichment keeps collection provenance. enrichAll does not spend the collection page budget.
  const enrichAll = options?.enrichAll === true;
  let detailIndex=0;
  const budgeted = enrichAll && typeof options?.detailBudget === "number" && options.detailBudget >= 0;
  const requestedDetails = enrichAll ? listings.length : Math.min(listings.length, options?.maxDetailPages ?? 0);
  const detailLimit = budgeted ? Math.min(requestedDetails, maxListings, options!.detailBudget!) : requestedDetails;
  // Progress counts against every listing that needs details, including those deferred to later jobs.
  const detailTotal = budgeted ? listings.slice(0, maxListings).length : detailLimit;
  let detailsHandled = 0;
  const detailSettled = (url: string) => { detailsHandled++; report({ phase: "details", url, done: detailsHandled, total: detailTotal, enriched: enrichmentEnriched }); };
  if (detailLimit > 0) report({ phase: "details", url: listings[0]?.sourceUrl ?? "", done: 0, total: detailTotal, enriched: 0 });
  let enrichmentAttempted = 0, enrichmentEnriched = 0, enrichmentFailed = 0;
  let detailThrottled = false;
  const detailFetch:FetchHtml=async (uri,opts)=>{
    if((!enrichAll && visited.length>=maxPages)||Date.now()>=deadline)throw Error("Property detail request budget reached");
    visited.push(uri);visitedSet.add(uri);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const csrf = csrfFor(uri);
        const page=await fetchHtml(uri,{...opts, cookie: opts?.cookie || cookieFor(uri), ...(csrf ? { csrfToken: csrf } : {})});
        hops++;
        return page;
      } catch (error) {
        lastError = error;
        const reason = error instanceof Error ? error.message : "";
        if (attempt === 2 || Date.now() >= deadline || !/\b429\b|too many requests|rate[- ]limited|\b(?:502|503|504)\b/i.test(reason)) break;
        visited.pop(); visitedSet.delete(uri);
        detailThrottled = true;
        obstacles.push({ code: /\b429\b|rate[- ]limited|too many requests/i.test(reason) ? "rate_limited" : "temporarily_unavailable", url: uri, detail: "retrying" });
        stages.push("rate_limit_retry");
        await new Promise(resolve => setTimeout(resolve, Math.min(40 * 2 ** attempt, 400)));
        visited.push(uri); visitedSet.add(uri);
      }
    }
    throw lastError;
  };
  // Small parallel batches give every property a turn without serial timeout starvation.
  if (detailLimit > 0) stages.push("detail_enrichment_scheduled");
  await Promise.all(Array.from({length:Math.min(DETAIL_CONCURRENCY,detailLimit)},async(_,worker)=>{
    while(detailIndex<detailLimit&&(enrichAll || visited.length<maxPages)&&Date.now()<deadline&&!(detailThrottled&&worker>=THROTTLED_DETAIL_CONCURRENCY)){
      const i=detailIndex++,item=listings[i];
      if(!item || item.detailsComplete){ if(item?.detailsComplete) enrichmentEnriched++; detailSettled(item?.sourceUrl ?? ""); continue; }
      if (enrichAll && item.listingNumber && listings.some((other, j) => j < i && other.listingNumber === item.listingNumber && other.detailsComplete)) {
        listings[i] = { ...item, detailsComplete: true, description: item.description || listings.find(other => other.listingNumber === item.listingNumber)?.description || item.description };
        enrichmentEnriched++;
        detailSettled(item.sourceUrl);
        continue;
      }
      enrichmentAttempted++;
      try{
        const request=publicDetails.get(item.sourceUrl);
        if(request){const page=await detailFetch(request.url,{fragment:true,activationToken:request.activationToken});const detail=listingsFromKestrel(page.html,page.finalUrl).find(row=>row.sourceUrl===item.sourceUrl);if(detail)listings[i]={...item,...detail,detailsComplete:true};}
        else listings[i]=await enrichPublicProperty(item,detailFetch);
        if (listings[i]?.detailsComplete) enrichmentEnriched++;
        else { enrichmentFailed++; if (enrichAll) failureDetails.push({ url: item.sourceUrl, reason: "Detail page did not publish a gallery and description" }); }
      }catch(error){
        enrichmentFailed++;
        const reason = error instanceof Error ? error.message.slice(0, 180) : "Property details unavailable";
        if (/human verification/i.test(reason) && !obstacles.some(row => row.code === "captcha_required" && row.url === item.sourceUrl)) obstacles.push({ code: "captcha_required", url: item.sourceUrl, detail: "detail enrichment" });
        else if (/script gate/i.test(reason)) obstacles.push({ code: "script_gate", url: item.sourceUrl, detail: "detail enrichment" });
        if (!enrichAll) failed.push(item.sourceUrl);
        failureDetails.push({url:item.sourceUrl,reason});
      }
      detailSettled(item.sourceUrl);
    }
  }));

  // Detail pages carry most IDX attribution. Listings from paginated collections whose detail pages
  // show a multi-office market keep only the site's own; everything attributed is labelled own/featured.
  {
    const paged = listings.filter(item => pagedCollectionListings.has(canonicalListingUrl(item.sourceUrl)) && !item.ownership);
    const offices = new Map(paged.filter(item => item.listingOffice).map(item => [item.sourceUrl, item.listingOffice!] as const));
    const collection = classifyCollection(paged, offices, identity, true, largeCollectionSeen);
    if (collection.kind === "market" && collection.excluded) {
      const kept = new Set(collection.keep.map(item => item.sourceUrl));
      const drop = new Set(paged.filter(item => !kept.has(item.sourceUrl)).map(item => item.sourceUrl));
      for (let i = listings.length - 1; i >= 0; i--) if (drop.has(listings[i].sourceUrl)) listings.splice(i, 1);
      excludedOtherOffice += drop.size;
      stages.push("market_feed_scoped_by_details");
    }
    // Same rule as for cards: one or two brokerages across the inventory is the brokerage the agent or
    // team lists under (own); with several, listings not attributed to the site's own office are featured.
    labelInventoryOwnership(listings, identity).forEach((item, i) => { listings[i] = item; });
  }
  const unfinishedDetails=detailLimit>0&&listings.some(l=>!l.detailsComplete);
  if (queue.some(item => item.continuation)) openContinuation = true;
  for (const item of queue) if (item.continuation) pendingContinuations.add(item.url);
  unresolvedPagination = unresolvedPagination || openContinuation;
  const proving = new Set<string>();
  const sourceSeen = listings.length + omissionTotal;
  const countMismatch = expectedCount > 0 && expectedCount !== sourceSeen;
  const boundaryBlocked = (!listings.length && !omissionTotal) || listings.length >= maxListings || queue.length > 0 || unresolvedPagination || limitedShowcase || countMismatch;
  if (!boundaryBlocked && expectedCount > 0 && expectedCount === listings.length) proving.add(apiCount ? "api_total_match" : "published_count_match");
  else if (!boundaryBlocked && expectedCount > 0 && expectedCount === sourceSeen) proving.add("published_collection_total_reconciled");
  if (!boundaryBlocked && sawContinuation && continuationRequests > 0 && continuationMechanism === "cursor") proving.add("cursor_exhausted");
  else if (!boundaryBlocked && sawContinuation && continuationRequests > 0) proving.add("pagination_exhausted");
  if (!boundaryBlocked && !sawContinuation && cursorTerminalPages > 0) proving.add("cursor_exhausted");
  if (!boundaryBlocked && providerTerminalPages > 0 && collectionPages > 0 && providerTerminalPages >= collectionPages) proving.add("provider_terminal_state");
  if (!boundaryBlocked && !sawContinuation && collectionPages > 0 && structuredPages === collectionPages) proving.add("structured_group_exhausted");
  if (!boundaryBlocked && !sawContinuation && collectionPages > 0 && singlePagePages === collectionPages) proving.add("single_page_collection_confirmed");
  if (offsetQueryTotal > 0 && collectionRowsFetched >= offsetQueryTotal && continuationRequests > 0 && !openContinuation && !queue.length && listings.length > 0 && listings.length < maxListings) proving.add("pagination_exhausted");
  if (hitSafetyCap && listings.length >= maxListings && (openContinuation || pendingContinuations.size > 0 || expectedCount > listings.length)) proving.add("collection_limit_reached");
  const completenessEvidence = proving.size ? [...proving] : (listings.length ? ["collection_boundary_unknown"] : []);
  const inventoryShort = !!(listings.length && (boundaryBlocked || !proving.size));
  const blocked = !listings.length && (failed.length > 0 || issues.some(issue => issue.code === "requires-rendering") || obstacles.length > 0);
  const inventoryStatus = !listings.length ? (blocked ? "inventory_blocked" as const : "inventory_empty" as const) : (inventoryShort ? "inventory_partial" as const : "inventory_complete" as const);
  const enrichmentStatus = detailLimit === 0 ? "enrichment_not_requested" as const
    : enrichmentFailed === 0 && enrichmentEnriched >= detailLimit ? "enrichment_complete" as const
    : enrichmentEnriched === 0 && enrichmentFailed > 0 ? "enrichment_unavailable" as const
    : "enrichment_partial" as const;
  if (listings.length) stages.push("inventory_discovered");
  if (detailLimit > 0) stages.push(enrichmentStatus === "enrichment_complete" ? "detail_enrichment_completed" : "detail_enrichment_partial");
  if (visited.some(url => /[?&]featureListingName=/.test(url))) stages.push("collection_scoped");
  const outcome = listings.length ?
        ((enrichAll ? false : unfinishedDetails) || queue.length || failed.length || unresolvedPagination || limitedShowcase || countMismatch ? "partial" : "found") : inventoryUrls.size || failed.length ? "unreadable" : "not-found";
  const verificationPending = obstacles.filter(row => (row.code === "captcha_required" || row.code === "authentication_required" || row.code === "user_action_required") && row.url).map(row => row.url!);
  const continuationAvailable = inventoryStatus !== "inventory_complete" && pendingContinuations.size > 0 && (hitSafetyCap || Date.now() >= deadline || (openContinuation && listings.length >= maxListings));
  const resumePending = [...new Set([...verificationPending, ...pendingContinuations])].slice(0, 40);
  const resumeObstacle = verificationPending.length
    ? (obstacles.find(row => row.code === "captcha_required" || row.code === "authentication_required")?.code ?? obstacles[0]?.code)
    : (hitSafetyCap ? "collection_limit_reached" : "import_deadline");
  if (verificationPending.length) stages.push("verification_required");
  if (continuationAvailable && !verificationPending.length) stages.push("collection_continuation");
  const exclusionCounts = new Map<string, number>(omissionReasons);
  let eligibleTotal = 0;
  for (const item of listings) {
    const reason = exclusionReason(item);
    if (reason) exclusionCounts.set(reason, (exclusionCounts.get(reason) ?? 0) + 1);
    else eligibleTotal++;
  }
  const exclusions = [...exclusionCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => a.reason.localeCompare(b.reason));
  const excludedTotal = exclusions.reduce((sum, row) => sum + row.count, 0);
  const sourceCollectionExhausted = inventoryStatus === "inventory_complete";
  const accounting = {
    sourceTotal: expectedCount || undefined,
    sourceSeen,
    sourceClassified: sourceSeen,
    sourceCollectionExhausted,
    excludedTotal,
    exclusions,
    eligibleTotal,
    importedEligible: eligibleTotal,
    eligibleImportComplete: sourceCollectionExhausted,
  };
  return {
    listings: listings.slice(0, maxListings),
    meta: { visited, hops, found: Math.min(listings.length, maxListings), maxDepth: maxDepthReached,
      compatibility: { version: 1, pages: compatibilityPages },
      interfaces: [...interfaces], coverage: limitedShowcase ? "showcase" : [...inventoryUrls].some(u=>/\/listings\/(?:my|our)-active-listings/.test(new URL(u).pathname)) || expectedCount || (interfaces.has("flexmls") && [...inventoryUrls].some(u => /\/(?:office|agent)_listing_categories\//.test(u))) ? "collection" : "unknown",
      issues: [...issues, ...listings.filter(l => !l.images.length).map(l => ({code: "missing-photos" as const, url:l.sourceUrl}))],
      failed, failureDetails, inventoryUrls: [...inventoryUrls], expectedCount: expectedCount || undefined, outcome,
      inventoryStatus, completenessEvidence, collectionBoundary: { mechanism: continuationMechanism || (openContinuation ? "hidden" : "none"), terminal: completenessEvidence[0], continuationRequests, continuationAvailable }, accounting, enrichment: { status: enrichmentStatus, scheduled: detailLimit, attempted: enrichmentAttempted, enriched: enrichmentEnriched, failed: enrichmentFailed,
        ...(budgeted ? { deferred: listings.slice(detailLimit, maxListings).map(item => item.sourceUrl) } : {}) },
      ...(identity ? { identity } : {}),
      ...(marketPages.length || excludedOtherOffice || outOfScopeLinks || seedScopes.some(scope => scope.person) ? { scope: {
        person: seedScopes.find(scope => scope.person)?.person?.prefix, marketPages, excludedOtherOffice, outOfScopeLinks } } : {}),
      obstacles, stages: [...new Set(stages)], candidates: [...candidateMap.values()].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id)).slice(0, 8),
      resume: (!listings.length || verificationPending.length || continuationAvailable) ? { seeds: [...new Set(seedUris.filter(Boolean))].slice(0, 8), pending: resumePending, obstacle: resumeObstacle, stage: verificationPending.length ? "verification_required" : continuationAvailable ? "collection_continuation" : "discovery_blocked" } : undefined },
  };
}

const scrubSecret = (text: string, secret: string) => secret.length >= 8 ? text.split(secret).join("[session]") : text;

/**
 * Resume a paused import after the user completes verification.
 * Retries only the pending URLs with the authorized session. Does not rediscover completed inventory.
 * The session cookie is never copied into the report, logs, or resume state.
 */
export async function continueAfterVerification(
  saved: { seeds?: string[]; pending?: string[]; listings?: DiscoveredListing[]; stage?: string; obstacle?: string },
  sessionCookie: string,
  fetchHtml: FetchHtml,
  options?: { maxDurationMs?: number; renderPage?: FetchHtml },
): Promise<{ listings: DiscoveredListing[]; meta: ListingDiscoveryMeta }> {
  const listings = (saved.listings ?? []).map(item => ({ ...item, images: [...item.images] }));
  const pending = [...new Set((saved.pending ?? []).filter(url => typeof url === "string" && url.startsWith("https://")))].slice(0, 40);
  const seeds = [...new Set((saved.seeds ?? []).filter(url => typeof url === "string" && url.startsWith("https://")))].slice(0, 8);
  const cookie = typeof sessionCookie === "string" ? sessionCookie.slice(0, 4000) : "";
  const paused = (remaining: string[], obstacles: ListingDiscoveryMeta["obstacles"], enrichment: ListingDiscoveryMeta["enrichment"], failureDetails: { url: string; reason: string }[] = []): { listings: DiscoveredListing[]; meta: ListingDiscoveryMeta } => ({
    listings,
    meta: {
      visited: remaining, hops: 0, found: listings.length, maxDepth: 0,
      outcome: listings.length ? "found" : "unreadable",
      inventoryStatus: listings.length ? (listings.length >= 100 ? "inventory_partial" : "inventory_complete") : "inventory_blocked",
      enrichment, obstacles, stages: ["verification_required"], failed: [], failureDetails,
      resume: { seeds, pending: remaining, obstacle: obstacles?.[0]?.code ?? saved.obstacle ?? "captcha_required", stage: "verification_required" },
    },
  });
  if (!cookie || !pending.length) return paused(pending, [{ code: saved.obstacle ?? "captcha_required", detail: "Authorized session was not provided" }], { status: "enrichment_not_requested", scheduled: pending.length, attempted: 0, enriched: 0, failed: 0 });
  const deadline = Date.now() + (options?.maxDurationMs ?? 45000);
  const withSession: FetchHtml = (uri, opts) => fetchHtml(uri, { ...opts, cookie: opts?.cookie || cookie });
  let enriched = 0, failed = 0, attempted = 0;
  const remaining: string[] = [];
  const obstacles: NonNullable<ListingDiscoveryMeta["obstacles"]> = [];
  const failureDetails: { url: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const url of pending) {
    if (seen.has(url)) continue;
    seen.add(url);
    if (Date.now() >= deadline) { remaining.push(url); continue; }
    const index = listings.findIndex(item => item.sourceUrl === url);
    if (index >= 0 && listings[index].detailsComplete) continue;
    attempted++;
    try {
      const page = await withSession(url);
      const obstacle = classifyObstacle(page.html) ?? (isRobotChallenge(page.html) ? "captcha_required" : null);
      if (obstacle === "captcha_required" || obstacle === "authentication_required" || obstacle === "script_gate") {
        failed++;
        remaining.push(url);
        obstacles.push({ code: obstacle === "script_gate" ? "script_gate" : obstacle, url, detail: "verification still required" });
        continue;
      }
      if (index >= 0) {
        listings[index] = await enrichPublicProperty(listings[index], withSession, { html: page.html, finalUrl: page.finalUrl });
        if (listings[index].detailsComplete) enriched++; else failed++;
      } else if (!listings.length) {
        const discovered = await discoverListings([url], withSession, { maxPages: 20, maxListings: 100, enrichAll: true, maxDurationMs: Math.max(1000, deadline - Date.now()), sessionCookie: cookie, renderPage: options?.renderPage });
        for (const item of discovered.listings) if (!listings.some(row => row.sourceUrl === item.sourceUrl)) listings.push(item);
        enriched += discovered.meta.enrichment?.enriched ?? discovered.listings.length;
        const stillBlocked = discovered.meta.obstacles?.filter(row => row.code === "captcha_required" || row.code === "authentication_required") ?? [];
        if (!discovered.listings.length && stillBlocked.length) { failed++; remaining.push(url); obstacles.push(...stillBlocked); }
      } else failed++;
    } catch (error) {
      failed++;
      remaining.push(url);
      const reason = scrubSecret(error instanceof Error ? error.message.slice(0, 180) : "Pending page unavailable", cookie);
      failureDetails.push({ url, reason });
    }
  }
  const enrichment = { status: failed === 0 && enriched >= attempted && attempted > 0 ? "enrichment_complete" as const : enriched === 0 && failed > 0 ? "enrichment_unavailable" as const : "enrichment_partial" as const, scheduled: pending.length, attempted, enriched, failed };
  if (remaining.length) return paused(remaining, obstacles.length ? obstacles : [{ code: "captcha_required", detail: "Some pending pages still require verification" }], enrichment, failureDetails);
  return {
    listings,
    meta: {
      visited: pending, hops: attempted, found: listings.length, maxDepth: 0, outcome: listings.length ? "found" : "not-found",
      inventoryStatus: listings.length ? (listings.length >= 100 ? "inventory_partial" : "inventory_complete") : "inventory_empty",
      enrichment, obstacles, stages: ["session_initialized", enrichment.status === "enrichment_complete" ? "detail_enrichment_completed" : "detail_enrichment_partial"],
      failed: [], failureDetails,
    },
  };
}

/** Hand the blocked URL to an interactive session, then resume only the pending work. */
export async function resumePausedImport(
  saved: { seeds?: string[]; pending?: string[]; listings?: DiscoveredListing[]; stage?: string; obstacle?: string },
  fetchHtml: FetchHtml,
  openVerificationSession: (target: { url: string; obstacle?: string }) => Promise<{ cookie?: string } | null>,
  options?: { maxDurationMs?: number; renderPage?: FetchHtml },
): Promise<{ listings: DiscoveredListing[]; meta: ListingDiscoveryMeta }> {
  const url = saved.pending?.find(item => item.startsWith("https://")) || saved.seeds?.find(item => item.startsWith("https://")) || "";
  let cookie = "";
  try {
    const opened = url ? await openVerificationSession({ url, obstacle: saved.obstacle }) : null;
    cookie = typeof opened?.cookie === "string" ? opened.cookie : "";
  } catch { cookie = ""; }
  return continueAfterVerification(saved, cookie, fetchHtml, options);
}

const RENDER_HTML_CAP = 1_500_000;
const RENDER_NETWORK_CAP = 30;

/** One renderer for onboarding, refresh, resume and tests. No backend means rendering is not configured. */
export function createListingRenderer(
  backend: ((request: { url: string; cookie?: string }) => Promise<{ html: string; finalUrl: string; network?: { url: string; html: string }[] }>) | null | undefined,
  limits?: { maxRenders?: number; timeoutMs?: number },
): FetchHtml | undefined {
  if (!backend) return undefined;
  let used = 0;
  const maxRenders = limits?.maxRenders ?? 4;
  const timeoutMs = limits?.timeoutMs ?? 30000;
  const lanes = new Map<string, Promise<unknown>>();
  const cache = new Map<string, { html: string; finalUrl: URL; network?: { url: string; html: string }[] }>();
  return async (uri, options) => {
    const key = uri + "\n" + (options?.cookie ?? "");
    const cached = cache.get(key);
    if (cached) return cached;
    if (used >= maxRenders) throw new Error("Per-import browser budget reached");
    used++;
    let host = "";
    try { host = new URL(uri).hostname; } catch { throw new Error("Renderer URL is not public HTTPS"); }
    const previous = lanes.get(host) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => gate, () => gate);
    lanes.set(host, tail);
    await previous.catch(() => {});
    const timer = new AbortController();
    const timeout = setTimeout(() => timer.abort(), timeoutMs);
    try {
      const rendered = await Promise.race([
        backend({ url: uri, cookie: options?.cookie }),
        new Promise<never>((_resolve, reject) => { timer.signal.addEventListener("abort", () => reject(new Error("Render timed out"))); }),
      ]);
      const finalUrl = new URL(rendered.finalUrl || uri);
      if (finalUrl.protocol !== "https:") throw new Error("Renderer returned a non-public URL");
      const html = String(rendered.html ?? "").slice(0, RENDER_HTML_CAP);
      if (!html.trim()) throw new Error("Renderer returned an empty document");
      const network = (rendered.network ?? []).slice(0, RENDER_NETWORK_CAP).flatMap(entry => {
        try {
          const url = new URL(entry.url);
          if (url.protocol !== "https:") return [];
          return [{ url: url.toString(), html: String(entry.html ?? "").slice(0, RENDER_HTML_CAP) }];
        } catch { return []; }
      });
      const result = { html, finalUrl, network };
      cache.set(key, result);
      return result;
    } finally {
      clearTimeout(timeout);
      release();
    }
  };
}

/** Production backend is an explicit HTTPS render service. Edge functions do not launch a browser themselves. */
export function listingRenderBackendFromEnv(readEnv: (name: string) => string | undefined): ((request: { url: string; cookie?: string }) => Promise<{ html: string; finalUrl: string; network?: { url: string; html: string }[] }>) | null {
  const configured = readEnv("LISTING_RENDER_URL");
  if (!configured) return null;
  let endpoint: URL;
  try { endpoint = new URL(configured); } catch { return null; }
  if (endpoint.protocol !== "https:") return null;
  return async request => {
    let target: URL;
    try { target = new URL(request.url); } catch { throw new Error("Renderer URL is not public HTTPS"); }
    if (target.protocol !== "https:") throw new Error("Renderer URL is not public HTTPS");
    const token = readEnv("LISTING_RENDER_TOKEN");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify({ url: target.toString(), cookie: request.cookie }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const text = await response.text();
      let detail = "";
      try {
        const failure = JSON.parse(text) as { error?: unknown };
        if (typeof failure.error === "string") detail = failure.error.replace(/[\r\n]/g, " ").slice(0, 120);
      } catch { /* non-JSON failure */ }
      throw new Error(detail ? "Renderer returned " + response.status + ": " + detail : "Renderer returned " + response.status);
    }
    const body = await response.json() as { html?: unknown; finalUrl?: unknown; network?: { url?: unknown; html?: unknown }[] };
    return {
      html: typeof body.html === "string" ? body.html : "",
      finalUrl: typeof body.finalUrl === "string" ? body.finalUrl : target.toString(),
      network: Array.isArray(body.network) ? body.network.flatMap(entry => typeof entry?.url === "string" ? [{ url: entry.url, html: typeof entry.html === "string" ? entry.html : "" }] : []) : [],
    };
  };
}

