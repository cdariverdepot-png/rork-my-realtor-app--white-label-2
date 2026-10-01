/**
 * Multi-hop listing inventory discovery for the realtor app builder.
 *
 * From a landing page, score CTA links (View properties, Listings, IDX, FlexMLS…),
 * follow 1–3 hops (same host or outbound MLS/IDX hosts), and extract listing cards.
 * Pure HTML heuristics — no headless browser. JS-only MLS shells yield few/no cards.
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
};

export type ListingDiscoveryMeta = {
  visited: string[];
  hops: number;
  found: number;
  /** Highest hop depth reached while looking for inventory. */
  maxDepth: number;
};

type FetchHtml = (uri: string) => Promise<{ html: string; finalUrl: URL }>;

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
  decodeEntities(tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? "").trim();

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Hosts that commonly host public IDX / FlexMLS inventory (not agent login walls). */
export const MLS_INVENTORY_HOST =
  /(?:^|\.)(?:flexmls\.com|idx\.|mls\.|listingbook\.com|homesnap\.com|showcaseidx\.com|ihomefinder\.com|realgeeks\.com|placester\.com|kvcore\.com|followupboss\.com|liondesk\.com|diverse-solutions\.com|search\.|listings\.)/i;

const LOGIN_PATH = /\/(login|signin|sign-in|auth|account|dashboard|portal|admin|members|agent-only)(\/|$)/i;

/** Phrases that mean "go look at my properties". */
const CTA_LABEL =
  /\b(view\s+(all\s+)?(our\s+)?(properties|listings|homes)|see\s+(all\s+)?(properties|listings|homes)|browse\s+(properties|listings|homes)|our\s+(listings|properties|homes)|current\s+listings|featured\s+(homes|listings|properties)|search\s+(homes|listings|properties)|find\s+(a\s+)?(home|property)|properties\s+for\s+sale|homes\s+for\s+sale|for\s+sale|buy\s+(a\s+)?(home|property)|listings?|properties|inventory|idx|mls|flexmls)\b/i;

const PATH_INVENTORY =
  /\/(listings?|properties|homes?(?:-for-sale)?|for-sale|search|idx|mls|gallery|inventory|featured|buy)(\/|$)/i;

const DETAIL_PATH =
  /\/(listing|property|home|homes|listings|properties|detail|p)\/[^/?#]+/i;

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
  if (link.protocol !== "https:" || LOGIN_PATH.test(link.pathname)) return 0;
  const text = `${label} ${link.pathname} ${link.hostname}`.toLowerCase();
  let score = 0;
  if (CTA_LABEL.test(text)) score += 40;
  if (PATH_INVENTORY.test(link.pathname)) score += 35;
  if (MLS_INVENTORY_HOST.test(link.hostname)) score += 50;
  if (/(flexmls|idx|mls)/i.test(text)) score += 25;
  if (sameSite(link, seed)) score += 10;
  else if (!MLS_INVENTORY_HOST.test(link.hostname) && !/(listings?|properties|homes|realestate|realty)/i.test(link.hostname)) {
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
  const seen = new Set<string>();
  const out: { url: string; score: number; label: string }[] = [];
  const hrefs = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const [, rawHref, rawLabel] of hrefs) {
    const href = absolutize(decodeEntities(rawHref).trim(), base);
    if (!href || seen.has(href)) continue;
    const label = stripTags(rawLabel).slice(0, 120);
    const score = scoreInventoryLink(href, label, base);
    if (score < 30) continue;
    seen.add(href);
    out.push({ url: href, score, label });
  }
  // iframe / embed IDX frames
  for (const tag of html.match(/<(?:iframe|embed)\b[^>]*>/gi) ?? []) {
    const src = attr(tag, "src");
    const href = src ? absolutize(src, base) : null;
    if (!href || seen.has(href)) continue;
    const score = scoreInventoryLink(href, "iframe idx", base) + 15;
    if (score < 30) continue;
    seen.add(href);
    out.push({ url: href, score, label: "embedded listings" });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

function jsonLdBlocks(html: string): unknown[] {
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
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    const obj = node as Record<string, unknown>;
    visit(obj);
    if (obj["@graph"]) stack.push(obj["@graph"]);
    if (obj.itemListElement) stack.push(obj.itemListElement);
    if (obj.offers) stack.push(obj.offers);
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
  const raw = obj.image ?? obj.photo ?? obj.thumbnailUrl;
  const list: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") {
      const a = absolutize(v, base);
      if (a && !looksLikeChrome(a)) list.push(a);
    } else if (v && typeof v === "object" && typeof (v as { url?: string }).url === "string") {
      const a = absolutize((v as { url: string }).url, base);
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
    const n = parseFloat(String(b));
    if (Number.isFinite(n)) beds = Math.round(n);
  }
  const ba = obj.numberOfBathroomsTotal ?? obj.numberOfBathrooms ?? obj.bathrooms;
  if (typeof ba === "number" || typeof ba === "string") {
    const n = parseFloat(String(ba));
    if (Number.isFinite(n)) baths = n;
  }
  const fs = obj.floorSize;
  if (fs && typeof fs === "object") {
    const v = (fs as Record<string, unknown>).value;
    if (typeof v === "number" || typeof v === "string") {
      const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(n) && n > 0) sqft = n.toLocaleString();
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
    typeof obj.description === "string" ? decodeEntities(obj.description).replace(/\s+/g, " ").trim().slice(0, 1200) : "";
  const price = priceFrom(obj);
  const images = imagesFrom(obj, base);
  const urlRaw =
    typeof obj.url === "string"
      ? obj.url
      : typeof obj["@id"] === "string" && /^https?:/i.test(obj["@id"])
        ? obj["@id"]
        : base.toString();
  const sourceUrl = absolutize(urlRaw, base) ?? base.toString();
  const { beds, baths, sqft } = specsFrom(obj, `${title} ${description}`);
  // Require a price or beds so we don't treat the whole agency as a "listing".
  if (!price && !beds && images.length < 1) return null;
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
    images: images.slice(0, 12),
    sourceUrl,
  };
}

/** Extract listings from JSON-LD on a page. */
export function listingsFromJsonLd(html: string, base: URL): DiscoveredListing[] {
  const found: DiscoveredListing[] = [];
  const seen = new Set<string>();
  walkLd(jsonLdBlocks(html), (obj) => {
    const item = listingFromLd(obj, base);
    if (!item) return;
    const key = item.sourceUrl || item.title + item.price;
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
export function listingsFromCards(html: string, base: URL, limit = 24): DiscoveredListing[] {
  const found: DiscoveredListing[] = [];
  const seen = new Set<string>();
  const hrefs = [...html.matchAll(/<a\b([^>]*)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const match of hrefs) {
    const href = absolutize(decodeEntities(match[2]).trim(), base);
    if (!href || seen.has(href)) continue;
    let link: URL;
    try {
      link = new URL(href);
    } catch {
      continue;
    }
    const label = stripTags(match[4]).slice(0, 200);
    const pathOk = DETAIL_PATH.test(link.pathname) || /listing|property|home|mls|pin|id=/i.test(link.pathname + link.search);
    if (!pathOk && !sameSite(link, base)) continue;
    if (!pathOk && label.length < 8) continue;
    // Peek at a window of HTML around the match for price / beds.
    const idx = match.index ?? 0;
    const window = html.slice(Math.max(0, idx - 200), Math.min(html.length, idx + match[0].length + 400));
    const text = stripTags(window);
    const priceMatch = text.match(/\$\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\s?\d+(?:\.\d+)?\s?[MK]/i);
    if (!priceMatch && !DETAIL_PATH.test(link.pathname)) continue;
    const price = priceMatch ? priceMatch[0].replace(/\s+/g, "") : "";
    const { beds, baths, sqft } = specsFrom({}, text);
    let image = "";
    const img = window.match(/<img\b[^>]*(?:src|data-src|data-lazy-src)\s*=\s*["']([^"']+)["'][^>]*>/i);
    if (img) {
      const a = absolutize(img[1], base);
      if (a && !looksLikeChrome(a)) image = a;
    }
    const title =
      label.replace(/\s+/g, " ").trim() ||
      decodeEntities(attr(match[0], "title") || attr(`<a ${match[1]}>`, "aria-label") || "").trim() ||
      link.pathname.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") ||
      "Listing";
    if (title.length < 3) continue;
    // Skip pure nav ("Listings", "Home", "Contact").
    if (/^(home|listings?|properties|contact|about|login|sign\s*in|menu)$/i.test(title)) continue;
    seen.add(href);
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
    });
    if (found.length >= limit) break;
  }
  return found;
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
  const looksProperty =
    !!price ||
    beds > 0 ||
    /real.?estate|listing|property|home\s+for\s+sale|mls/i.test(`${title} ${description}`) ||
    DETAIL_PATH.test(base.pathname);
  if (!looksProperty || !title || title.length < 3) return null;
  if (/^(home|welcome|about)/i.test(title) && !price && !beds) return null;
  return {
    title: title.slice(0, 160),
    description: description.slice(0, 1200),
    price,
    beds,
    baths,
    sqft,
    neighborhood: "",
    image,
    images: image ? [image] : [],
    sourceUrl: base.toString(),
  };
}

export function extractListingsFromPage(html: string, base: URL): DiscoveredListing[] {
  const fromLd = listingsFromJsonLd(html, base);
  if (fromLd.length >= 2) return fromLd.slice(0, 24);
  const fromCards = listingsFromCards(html, base);
  const merged = [...fromLd];
  const seen = new Set(fromLd.map((l) => l.sourceUrl));
  for (const card of fromCards) {
    if (seen.has(card.sourceUrl)) continue;
    seen.add(card.sourceUrl);
    merged.push(card);
  }
  if (merged.length) return merged.slice(0, 24);
  const single = listingFromMeta(html, base);
  return single ? [single] : [];
}

/**
 * Walk seed URLs → inventory CTAs → optional detail pages.
 * Caps pages and depth so the builder stays snappy.
 */
export async function discoverListings(
  seedUris: string[],
  fetchHtml: FetchHtml,
  options?: { maxDepth?: number; maxPages?: number; maxListings?: number },
): Promise<{ listings: DiscoveredListing[]; meta: ListingDiscoveryMeta }> {
  const maxDepth = options?.maxDepth ?? 3;
  const maxPages = options?.maxPages ?? 10;
  const maxListings = options?.maxListings ?? 24;

  const visited: string[] = [];
  const visitedSet = new Set<string>();
  const listings: DiscoveredListing[] = [];
  const listingKeys = new Set<string>();
  let hops = 0;
  let maxDepthReached = 0;

  type QueueItem = { url: string; depth: number; preferInventory: boolean };
  const queue: QueueItem[] = seedUris.filter(Boolean).map((url) => ({ url, depth: 0, preferInventory: true }));

  const pushListing = (item: DiscoveredListing) => {
    const key = (item.sourceUrl || item.title).toLowerCase();
    if (listingKeys.has(key)) return;
    listingKeys.add(key);
    listings.push(item);
  };

  while (queue.length && visited.length < maxPages && listings.length < maxListings) {
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

    let html: string;
    let finalUrl: URL;
    try {
      const page = await fetchHtml(normalized);
      html = page.html;
      finalUrl = page.finalUrl;
      hops += 1;
    } catch {
      continue;
    }

    const found = extractListingsFromPage(html, finalUrl);
    // On a seed/landing page a single meta "listing" is often the agency itself — ignore unless it has a price.
    for (const item of found) {
      if (next.depth === 0 && found.length === 1 && !item.price && item.sourceUrl === finalUrl.toString()) continue;
      pushListing(item);
      if (listings.length >= maxListings) break;
    }

    if (listings.length >= maxListings || next.depth >= maxDepth) continue;

    const ctas = collectInventoryLinks(html, finalUrl, 6);
    for (const cta of ctas) {
      if (visitedSet.has(cta.url)) continue;
      if (queue.some((q) => q.url === cta.url)) continue;
      queue.push({ url: cta.url, depth: next.depth + 1, preferInventory: true });
    }

    // From an inventory page with card links, follow a few detail URLs that still lack photos/price.
    if (next.depth >= 1 && found.length > 0 && found.length < 8) {
      for (const item of found.slice(0, 4)) {
        if (visitedSet.has(item.sourceUrl)) continue;
        if (item.images.length && item.price) continue;
        queue.push({ url: item.sourceUrl, depth: next.depth + 1, preferInventory: false });
      }
    }
  }

  return {
    listings: listings.slice(0, maxListings),
    meta: { visited, hops, found: Math.min(listings.length, maxListings), maxDepth: maxDepthReached },
  };
}
