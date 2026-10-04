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
  listingNumber?: string;
  propertyType?: string;
  importKey?: string;
  /** True only when a property detail/gallery, rather than a collection card, was read. */
  detailsComplete?: boolean;
  facts?: Record<string, string>;
};

export type ListingDiscoveryMeta = {
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
};

export type FetchHtml = (uri: string, options?: { fragment?: boolean; activationToken?: string }) => Promise<{ html: string; finalUrl: URL }>;
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
    typeof obj.description === "string" ? decodeEntities(stripTags(obj.description)).trim().slice(0, 16000) : "";
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
    const ownPrice = /\$\s?\d/.test(stripTags(match[4]));
    // A priced anchor is the complete card. Never borrow fields or a photo from its neighbors.
    const before = html.slice(Math.max(0, idx - 200), idx).split(/<\/a>/i).pop() ?? "";
    const after = html.slice(idx + match[0].length, idx + match[0].length + 400).split(/<a\b/i)[0];
    const window = ownPrice ? match[4] : before + match[0] + after;
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
    sourceUrl: base.toString(),
  };
}

function extractPropertyRecords(html: string, base: URL): DiscoveredListing[] {
  const flex=listingFromFlexmlsDetail(html,base);
  if(flex)return [flex];
  const adapted = extractAdapterListings(html, base);
  if (adapted.length) return adapted;
  const structuredCards = listingsFromStructuredCards(html, base);
  if (structuredCards.length) return structuredCards;
  const hydrated = listingsFromHydration(html, base);
  const fromLd = listingsFromJsonLd(html, base);
  const fromCards = listingsFromCards(html, base);
  const merged = [...fromLd, ...hydrated];
  const seen = new Set(fromLd.map((l) => l.sourceUrl));
  for (const card of fromCards) {
    if (seen.has(card.sourceUrl)) continue;
    seen.add(card.sourceUrl);
    merged.push(card);
  }
  if (merged.length) return merged.slice(0, 500);
  const single = listingFromMeta(html, base);
  return single ? [single] : [];
}

/** Normalize explicit MLS status values, never prose such as 'sold by our team'. */
export function normalizeListingStatus(value: unknown): DiscoveredListing["status"] {
  if (typeof value !== "string") return undefined;
  const label = value.trim().replace(/^https?:\/\/schema\.org\//i, "").toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
  if (/^(sold|closed|just sold)$/.test(label)) return "sold";
  if (/^(pending|pending continue to show|pending taking backups|under contract)$/.test(label)) return "pending";
  if (/^(contingent|active contingent|active under contract|active with contingency|active kick out)$/.test(label)) return "contingent";
  if (/^(off market|withdrawn|cancelled|canceled|expired|temporarily off market)$/.test(label)) return "off_market";
  if (/^(active|for sale|new|back on market)$/.test(label)) return "active";
  return undefined;
}

const propertyIdentity = (value: unknown) => typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

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
  const nodes = jsonLdBlocks(html);
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { nodes.push(JSON.parse(m[1])); } catch { /* malformed hydration */ }
  }
  walkLd(nodes, obj => { if (!matched && matches(obj)) matched = statusFrom(obj); });
  if (matched) return matched;
  for (const m of html.matchAll(/<[^>]+\bdata-listing=["'][^>]+>/gi)) {
    try { const obj = JSON.parse(attr(m[0], "data-listing")); if (matches(obj)) { const status = statusFrom(obj); if (status) return status; } } catch { /* malformed card */ }
  }
  // Visible labels are accepted only on an identified property detail page.
  const headings = [...html.matchAll(/<(?:h1|title)\b[^>]*>([\s\S]*?)<\/(?:h1|title)>/gi)].map(m => stripTags(m[1]));
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) if (attr(tag, "property") === "og:title") headings.push(attr(tag, "content"));
  const identified = headings.some(title => propertyIdentity(title) === expected ||
    title.split(/\s[|–—]\s/).some(part => propertyIdentity(part) === expected));
  if (identified) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      if (/^(?:listing:status|property:status|listingstatus|standardstatus)$/i.test(attr(tag, "property") || attr(tag, "name"))) {
        const status = normalizeListingStatus(attr(tag, "content")); if (status) return status;
      }
    }
    let main = html.replace(/<(?:script|style|nav|footer)\b[^>]*>[\s\S]*?<\/(?:script|style|nav|footer)>/gi, "");
    // Do not consume status badges belonging to recommended properties farther down the page.
    main = main.split(/<(?:h2|h3)\b|(?:related|similar|recommended|recently sold)\s+(?:homes|properties|listings)/i)[0];
    for (const m of main.matchAll(/<(?:span|div|p|strong)\b[^>]*(?:class|id)=["'][^"']*(?:listing-status|property-status|standard-status)[^"']*["'][^>]*>([^<]*)<\//gi)) {
      const status = normalizeListingStatus(stripTags(m[1]).replace(/^status\s*:\s*/i, "")); if (status) return status;
    }
    const label = stripTags(main).match(/\b(?:listing status|property status|standard status|MLS status)\s*:\s*(active under contract|active contingent|off[- ]market|for sale|active|pending|contingent|sold|closed|withdrawn|expired|cancelled)\b/i);
    const status = normalizeListingStatus(label?.[1]); if (status) return status;
  }
  return undefined;
}

export function extractListingsFromPage(html: string, base: URL): DiscoveredListing[] {
  return extractPropertyRecords(html, base).map(item => ({ ...item, status: item.status ?? statusForProperty(html, item, base) ??
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
      if (status !== "active") continue;
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
    if (status && status !== "active") return;
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
    listingNumber: base.pathname.match(/\/listing\/[^/]+\/([^/]+)/)?.[1] }, base);
  return item ? { ...item, status: normalizeListingStatus(field("IDX-summaryField-propStatus-data")) } : null;
}


/** Common public data transport, including RESO-style property fields.
 * URLs must be present in the record; never manufacture provider endpoints or detail URLs.
 */
export function listingsFromPublicJson(text: string, base: URL): DiscoveredListing[] {
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return []; }
  const out: DiscoveredListing[] = [];
  walkLd([payload], row => {
    const address = row.address && typeof row.address === "object" ? row.address as Record<string, unknown> : {};
    const street = row.UnparsedAddress ?? row.streetAddress ?? row.StreetAddress ?? row.addressLine1 ?? address.streetAddress;
    const rawUrl = row.detailUrl ?? row.listingUrl ?? row.url ?? row.URL;
    if (typeof street !== "string" || typeof rawUrl !== "string" || !street.trim()) return;
    const media = row.images ?? row.photos ?? row.image ?? row.Media;
    const images = Array.isArray(media) ? media.map(value => typeof value === "object" && value ?
      (value as Record<string, unknown>).MediaURL ?? (value as Record<string, unknown>).url : value) : media;
    const item = listingFromLd({ "@type": "RealEstateListing", name: street,
      price: row.ListPrice ?? row.listPrice ?? row.CurrentPrice ?? row.price, url: rawUrl,
      description: row.PublicRemarks ?? row.description ?? row.remarks ?? "",
      bedrooms: row.BedroomsTotal ?? row.BedsTotal ?? row.bedrooms,
      bathrooms: row.BathroomsTotalInteger ?? row.BathsTotal ?? row.totalBaths ?? row.bathrooms,
      floorSize: {value: row.LivingArea ?? row.sqFeet ?? row.sqft}, image: images,
      address: { addressLocality: row.City ?? address.city ?? address.addressLocality,
        addressRegion: row.StateOrProvince ?? address.state ?? address.addressRegion },
      listingNumber: row.ListingId ?? row.MLSNumber ?? row.mlsNumber ?? row.listingNumber,
      propertyType: row.PropertyType ?? row.propertyType }, base);
    if (item) out.push({ ...item, status: normalizeListingStatus(row.StandardStatus ?? row.statusText ?? row.listingStatus ?? row.status) });
  });
  // JSON-LD APIs may identify a property with name/type instead of streetAddress.
  if (!out.length) return listingsFromJsonLd('<script type="application/ld+json">'+text+'</script>', base);
  return out;
}


/** Public Kestrel widget requests: retain featured scope and never use a general MLS search. */
export function kestrelInventoryRequests(html: string): { url: string; activationToken: string }[] {
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
  {id:"agentfire-dsidx",matches:h=>/cbw-slider-listing|agentfire-listing-v3/.test(h),extract:(h,u)=>{const detail=listingFromDsidxDetail(h,u);return detail?[detail]:listingsFromCards(h,u);}},
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
  return LISTING_INTERFACE_ADAPTERS.filter(a => a.matches(html,base)).map(a => a.id);
}

function extractAdapterListings(html: string, base: URL): DiscoveredListing[] {
  for (const adapter of LISTING_INTERFACE_ADAPTERS) {
    // Merge structured data and ordinary cards together in the generic reader below.
    if (adapter.id === "structured-property-data" || !adapter.matches(html,base)) continue;
    const rows = adapter.extract(html,base);
    if (rows.length) return rows;
  }
  return [];
}

/** Recognize unsupported dynamic providers without pretending their data was read. */
function dynamicInterfaceHint(html: string): string | undefined {
  for (const [id, pattern] of [
    ["ihomefinder", /ihomefinder|idxhome\.com|ihf-container|ihf-main-container/i],
    ["showcase-idx", /showcaseidx|showcase-idx/i],
    ["kvcore", /kvcore|kv-core/i],
    ["realgeeks", /realgeeks|real-geeks/i],
  ] as const) if (pattern.test(html)) return id;
  return undefined;
}

/** Public fragments keep the exact agent/category/filter instead of broadening the search. */
export function collectInventoryFragments(html: string, base: URL): string[] {
  const out = LISTING_INTERFACE_ADAPTERS.filter(adapter => adapter.matches(html,base)).flatMap(adapter => adapter.fragments?.(html,base) ?? []);
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

function paginationLinks(html: string, base: URL): string[] {
  const out: string[] = [];
  try {
    const payload=JSON.parse(html), raw=payload.nextUrl ?? payload["@odata.nextLink"] ?? payload.links?.next ?? payload.pagination?.nextUrl;
    const next=typeof raw === "string" ? new URL(raw,base) : null;
    const scope=(url: URL) => [...url.searchParams].filter(([key]) => !/^(?:page|pageNumber|offset|limit|per_page|q_offset|cursor)$/i.test(key)).sort(([a],[b])=>a.localeCompare(b));
    if (next && next.protocol === "https:" && sameSite(next,base) && next.pathname === base.pathname && JSON.stringify(scope(next)) === JSON.stringify(scope(base))) out.push(next.toString());
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

/** Enrich an already evidenced property without replacing its address with an agency title. */
export function enrichListingFromPage(item: DiscoveredListing, html: string, base: URL): DiscoveredListing {
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
  const detail = listingFromDsidxDetail(html,base) ?? listingsFromMoxi(html,base).find(l=>l.sourceUrl===item.sourceUrl) ?? listingFromIdxDetail(html, base) ?? listingsFromJsonLd(html, base).find(l => l.sourceUrl === item.sourceUrl || l.title === item.title);
  if(!detail&&!decodeEntities(stripTags(html)).toLowerCase().includes(item.title.toLowerCase()))return item;
  const meta = (name: string) => {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      if ((attr(tag, "property") || attr(tag, "name")) === name) return attr(tag, "content");
    }
    return "";
  };
  const remarks=html.match(/<(?:div|section|p)\b[^>]*(?:id|class)=["'][^"']*(?:property-description|listing-description|ihf-description|dsidx-remarks)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|p)>/i)?.[1];
  const description = detail?.description || (remarks?decodeEntities(stripTags(remarks)):"") || meta("og:description") || meta("description");
  const cover = absolutize(meta("og:image"), base);
  // Explicit gallery images only; exclude related-home cards and site chrome.
  const gallery:string[]=[];
  for(const tag of html.match(/<img\b[^>]*>/gi)??[]){
    if(!/rsImg|gallery|property-photo|listing-photo/i.test(attr(tag,"class"))&&!attr(tag,"data-full"))continue;
    const url=absolutize(attr(tag,"data-full")||attr(tag,"data-src")||attr(tag,"src"),base);
    if(url&&!looksLikeChrome(url))gallery.push(url);
  }
  const fullGallery=(detail?.images.length??0)>0||gallery.length>0;
  const images = distinctPropertyImages([...(detail?.images ?? []),...gallery, ...(!fullGallery&&cover&&!looksLikeChrome(cover)?[cover]:[]), ...(!fullGallery?item.images:[])]);
  return { ...item, detailsComplete: fullGallery && !!description, status: detail?.status ?? statusForProperty(html, item, base) ?? item.status, description: description.slice(0, 16000) || item.description,
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

/**
 * Walk seed URLs → inventory CTAs → optional detail pages.
 * Caps pages and depth so the builder stays snappy.
 */
export async function discoverListings(
  seedUris: string[],
  fetchHtml: FetchHtml,
  options?: { maxDepth?: number; maxPages?: number; maxListings?: number; maxDurationMs?: number; maxDetailPages?: number; selectLinks?: SelectInventoryLinks;
    normalizePage?: (html: string, base: URL) => Promise<DiscoveredListing[]>;
    /** Optional public browser renderer; absent renderers must report unsupported dynamic pages. */
    renderPage?: FetchHtml },
): Promise<{ listings: DiscoveredListing[]; meta: ListingDiscoveryMeta }> {
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
  const publicDetails = new Map<string,{url:string;activationToken:string}>();
  const issues: NonNullable<ListingDiscoveryMeta["issues"]> = [];
  let limitedShowcase = false;
  const deadline = Date.now() + (options?.maxDurationMs ?? 45000);
  let aiRoutes = 0;
  let aiNormalizations = 0;
  let expectedCount = 0;
  let unresolvedPagination = false;
  let hops = 0;
  let maxDepthReached = 0;

  type QueueItem = { url: string; depth: number; priority: number; fragment?: boolean; broad?: boolean; parent?: string; activationToken?: string };
  const queue: QueueItem[] = [...new Set(seedUris.filter(Boolean))].map((url, i) => ({ url, depth: 0, priority: 150 - i }));

  const pushListing = (item: DiscoveredListing) => {
    const key = item.sourceUrl;
    if (listingKeys.has(key)) {
      const index=listings.findIndex(row=>row.sourceUrl===item.sourceUrl);
      if(index>=0){const old=listings[index],images=[...new Set([...item.images,...old.images])].slice(0,500);
        listings[index]={...old,description:item.description||old.description,price:item.price||old.price,beds:item.beds||old.beds,baths:item.baths||old.baths,sqft:item.sqft||old.sqft,status:item.status??old.status,image:images[0]||old.image,images,listingNumber:item.listingNumber||old.listingNumber};}
      return;
    }
    listingKeys.add(key);
    listings.push(item);
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

    let html: string;
    let finalUrl: URL;
    try {
      const page = await fetchHtml(normalized, { fragment: next.fragment, activationToken:next.activationToken });
      html = page.html;
      finalUrl = page.finalUrl;
      hops += 1;
      visitedSet.add(finalUrl.toString());
    } catch (error) {
      failureDetails.push({url:normalized,reason:error instanceof Error ? error.message.slice(0,180) : "Unreadable public response"});
      failed.push(normalized);
      continue;
    }

    for (const id of detectListingInterfaces(html, finalUrl)) interfaces.add(id);
    // A general market search is a navigation step, not evidence of the agent's inventory.
    const broad = next.broad && !/office_listing_categories|agent_listing_categories/.test(finalUrl.pathname);
    if (!broad) {
      const count = html.match(/data-(?:search-results-search-count|listings-count|results-count)\s*=\s*["']?(\d+)/i)?.[1];
      if (count) expectedCount = Math.max(expectedCount, Number(count));
      if (/data-has-next-page=["']true["']|\b(?:load more properties|load more listings|infinite-scroll)\b/i.test(html)) unresolvedPagination = true;
    }
    const publicResponse = broad ? null : listingsFromBrivityResponse(html, finalUrl);
    if (publicResponse) expectedCount = Math.max(expectedCount, publicResponse.count);
    try { const payload=JSON.parse(html), total=Number(payload.total ?? payload.totalCount ?? payload["@odata.count"]);
      if (!broad && Number.isFinite(total) && total > 0) expectedCount=Math.max(expectedCount,total); } catch { /* HTML */ }
    if(next.activationToken && finalUrl.hostname === "www.idxhome.com"){try{const rows=JSON.parse(html);if(Array.isArray(rows))for(const row of rows){if(row.featured===true && row.statusId==="active" && /^[a-z0-9_-]+$/i.test(row.id) && typeof row.listingPageUrl==="string") publicDetails.set(row.listingPageUrl,{url:"https://www.idxhome.com/api/kestrel/listing/"+row.id+".json?context=DETAIL",activationToken:next.activationToken});}}catch{/* other formats */}}
    const showcase = broad ? [] : listingsFromIdxShowcase(html, finalUrl);
    if (/cbw-slider-listing/.test(html) && next.depth===0) {limitedShowcase=true;issues.push({code:"limited-showcase",url:finalUrl.toString(),interface:"agentfire-dsidx"});}
    if (showcase.length) { limitedShowcase = true; issues.push({code:"limited-showcase",url:finalUrl.toString(),interface:"idx-broker"}); }
    const ownInventoryLinks = collectInventoryLinks(html,finalUrl,6).filter(c=>/\bmy\b/i.test(c.label)&&/\bactive\b/i.test(c.label)&&!DETAIL_PATH.test(new URL(c.url).pathname.replace("/listings/", "/inventory/")));
    let found = broad || next.depth===0 && ownInventoryLinks.length ? [] : extractListingsFromPage(html, finalUrl);
    const hint = !broad && !found.length ? dynamicInterfaceHint(html) : undefined;
    if (hint) { interfaces.add(hint); inventoryUrls.add(finalUrl.toString()); }
    if (!found.length && !broad && options?.normalizePage && aiNormalizations < 2 &&
      (PATH_INVENTORY.test(finalUrl.pathname) || next.fragment) && Date.now() < deadline) {
      aiNormalizations++;
      try { found = await options.normalizePage(html, finalUrl); } catch { /* deterministic navigation continues */ }
    }
    if (hint && !found.length && !collectInventoryFragments(html,finalUrl).length && !kestrelInventoryRequests(html).length) {
      if (options?.renderPage && Date.now() < deadline) {
        try {
          const rendered=await options.renderPage(finalUrl.toString());
          if (sameSite(rendered.finalUrl,finalUrl) && !LOGIN_PATH.test(rendered.finalUrl.pathname)) {
            html=rendered.html; finalUrl=rendered.finalUrl;
            found=extractListingsFromPage(html,finalUrl);
          }
        } catch { /* preserve the source and explain the missing renderer/data */ }
      }
      if (!found.length) issues.push({code:"requires-rendering",url:finalUrl.toString(),interface:hint});
    }
    if (found.length && next.fragment && next.parent) {
      // Once the shell's inventory loads, discard its toolbar/search alternatives.
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].parent === next.parent && !queue[i].fragment) queue.splice(i, 1);
      }
    }
    if (found.length || MLS_INVENTORY_HOST.test(finalUrl.hostname) || PATH_INVENTORY.test(finalUrl.pathname)) inventoryUrls.add(finalUrl.toString());
    // On a seed/landing page a single meta "listing" is often the agency itself — ignore unless it has a price.
    for (const item of found) {
      if (next.depth === 0 && found.length === 1 && !item.price && item.sourceUrl === finalUrl.toString()) continue;
      pushListing(item);
      if (listings.length >= maxListings) break;
    }

    if (listings.length >= maxListings) continue;
    if (!broad) {
      for(const request of kestrelInventoryRequests(html)){ if(!visitedSet.has(request.url)&&!queue.some(q=>q.url===request.url)) queue.push({...request,depth:next.depth,priority:220,fragment:true,parent:finalUrl.toString()}); }
      for (const url of collectInventoryFragments(html, finalUrl)) {
        if (!visitedSet.has(url) && !queue.some(q => q.url === url)) queue.push({ url, depth: next.depth, priority: 200, fragment: true, parent: finalUrl.toString() });
      }
      if (found.length) {
        for (const url of paginationLinks(html, finalUrl)) {
          if (!visitedSet.has(url) && !queue.some(q => q.url === url)) queue.push({ url, depth: next.depth, priority: 180, fragment: next.fragment });
        }
        // Flexmls uses public paged fragments without a Next anchor.
        if (next.fragment && finalUrl.searchParams.get("list_view") === "photo" && found.length === 24) {
          const url = new URL(finalUrl);
          url.searchParams.set("page", String(Number(url.searchParams.get("page") ?? 1) + 1));
          if (!visitedSet.has(url.toString())) queue.push({ url: url.toString(), depth: next.depth, priority: 180, fragment: true });
        }
      }
    }
    if (next.depth >= maxDepth) continue;

    const ctas = found.length ? [] : ownInventoryLinks.length ? ownInventoryLinks : collectInventoryLinks(html, finalUrl, 6);
    for (const cta of ctas) {
      if (visitedSet.has(cta.url)) continue;
      if (queue.some((q) => q.url === cta.url)) continue;
      const broad = /property\s+search|search\s+(?:all\s+)?(?:homes|properties)|all\s+(?:homes|properties|listings)/i.test(cta.label) &&
        !/\bmy\b|\bour\b|featured|exclusive|office_listing_categories|agent_listing_categories/i.test(cta.label + cta.url);
      queue.push({ url: cta.url, depth: next.depth + 1, priority: cta.score, broad, parent: finalUrl.toString() });
    }

    if (!listings.length && !queue.length && options?.selectLinks && aiRoutes < 2 && Date.now() < deadline) {
      const candidates = navigationCandidates(html, finalUrl).filter(c => !visitedSet.has(c.url));
      if (candidates.length) {
        aiRoutes++;
        try {
          const selected = await options.selectLinks(finalUrl.toString(), candidates);
          // Never fetch a URL invented by the model, or follow its page-supplied instructions.
          for (const url of [...new Set(selected)].slice(0, 4)) {
            if (candidates.some(c => c.url === url)) queue.push({ url, depth: next.depth + 1, priority: 100 });
          }
        } catch { /* navigation remains useful when AI is unavailable */ }
      }
    }

    // From an inventory page with card links, follow a few detail URLs that still lack photos/price.
    if (next.depth >= 1 && found.length > 0 && found.length < 8) {
      for (const item of found.slice(0, 4)) {
        if (visitedSet.has(item.sourceUrl)) continue;
        if (item.images.length && item.price) continue;
        queue.push({ url: item.sourceUrl, depth: next.depth + 1, priority: 20 });
      }
    }
  }

  // Detail enrichment shares the request/time budget and keeps collection provenance.
  let detailIndex=0;
  const detailLimit=Math.min(listings.length,options?.maxDetailPages??0);
  const detailFetch:FetchHtml=async (uri,opts)=>{
    if(visited.length>=maxPages||Date.now()>=deadline)throw Error("Property detail request budget reached");
    visited.push(uri);visitedSet.add(uri);
    const page=await fetchHtml(uri,opts);hops++;return page;
  };
  // Small parallel batches give every property a turn without serial timeout starvation.
  await Promise.all(Array.from({length:Math.min(3,detailLimit)},async()=>{
    while(detailIndex<detailLimit&&visited.length<maxPages&&Date.now()<deadline){
      const i=detailIndex++,item=listings[i];
      if(item.detailsComplete)continue;
      try{
        const request=publicDetails.get(item.sourceUrl);
        if(request){const page=await detailFetch(request.url,{fragment:true,activationToken:request.activationToken});const detail=listingsFromKestrel(page.html,page.finalUrl).find(row=>row.sourceUrl===item.sourceUrl);if(detail)listings[i]={...item,...detail,detailsComplete:true};}
        else listings[i]=await enrichPublicProperty(item,detailFetch);
      }catch(error){failed.push(item.sourceUrl);failureDetails.push({url:item.sourceUrl,reason:error instanceof Error?error.message.slice(0,180):"Property details unavailable"});}
    }
  }));

  const unfinishedDetails=detailLimit>0&&listings.some(l=>!l.detailsComplete);
  return {
    listings: listings.slice(0, maxListings),
    meta: { visited, hops, found: Math.min(listings.length, maxListings), maxDepth: maxDepthReached,
      interfaces: [...interfaces], coverage: limitedShowcase ? "showcase" : [...inventoryUrls].some(u=>/\/listings\/(?:my|our)-active-listings/.test(new URL(u).pathname)) || expectedCount || (interfaces.has("flexmls") && [...inventoryUrls].some(u => /\/(?:office|agent)_listing_categories\//.test(u))) ? "collection" : "unknown",
      issues: [...issues, ...listings.filter(l => !l.images.length).map(l => ({code: "missing-photos" as const, url:l.sourceUrl}))],
      failed, failureDetails, inventoryUrls: [...inventoryUrls], expectedCount: expectedCount || undefined, outcome: listings.length ?
        (unfinishedDetails || queue.length || failed.length || unresolvedPagination || limitedShowcase || expectedCount > listings.length ? "partial" : "found") : inventoryUrls.size || failed.length ? "unreadable" : "not-found" },
  };
}

