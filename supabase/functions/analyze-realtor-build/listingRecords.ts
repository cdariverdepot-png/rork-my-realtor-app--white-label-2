/**
 * One normalizer for every extracted listing before it is saved (repair campaign stage 5).
 *
 * Readers extract what a page shows; a page's card often wraps badges, prices, specs and buttons
 * around the address. Here each record gets a readable title (the property's address), decoded
 * text, and one identity per property. Records that are not properties at all (a "12 Listings"
 * search link, a city statistics card, a vendor ad) are dropped with a reason. Nothing is invented:
 * a title is only ever taken from the record's own text or its own URL.
 */
import type { DiscoveredListing } from "./listingDiscovery.ts";

const NAMED_ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·", reg: "®", trade: "™" };

/** Decodes HTML entities (named and numeric), repeatedly for double-encoded text, and tidies spacing. */
export function decodeListingText(value: string, keepLines = false): string {
  let text = value ?? "";
  for (let pass = 0; pass < 3 && /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(text); pass++) {
    text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
      .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
  }
  text = text.replace(/\u00a0/g, " ");
  text = keepLines ? text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n") : text.replace(/\s+/g, " ");
  return text.replace(/[ \t]+([,;:])/g, "$1").replace(/,(?=[A-Za-z])/g, ", ").trim();
}

/** Interface words a card puts around the address; never part of a property's name. */
const UI_LABEL = /\b(?:add to favou?rites|remove from favou?rites|save (?:listing|home|property)|view (?:property|details|listing|home|more)\+?|more (?:info|details)|learn more|see details|details|click here|schedule (?:a )?(?:tour|showing)|request info|share|virtual tour|photos?)\b\s*\+?/gi;
const HAS_UI_LABEL = new RegExp(UI_LABEL.source, "i");
const STREET = "(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Boulevard|Blvd|Place|Pl|Circle|Cir|Trail|Trl|Highway|Hwy|Parkway|Pkwy|Terrace|Ter|Loop|Crossing|Xing|Path|Run|Pike|Square|Sq|Point|Pt|Ridge|Cove|Row|Alley|Bend|Hollow|Heights|Hts|Landing|Glen|Grove|Park|Pass|Plaza|Vista|View|Walk|Commons|Creek|Hill|Hills|Meadow|Meadows|Estates)";
const ADDRESS = new RegExp(String.raw`\b[NSEW]?\d{1,6}[A-Z]?\s+(?:[NSEW]\.?\s+)?(?:[A-Za-z0-9.'’#-]+\s+){0,6}?${STREET}\b\.?(?:\s+(?:[NSEW]{1,2}))?(?:\s*(?:#|Unit|Apt\.?|Suite|Ste\.?|Lot)\s*[\w-]+)?(?:,?\s+[A-Za-z][A-Za-z.'’ -]{1,40})?(?:,?\s+[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?(?=$|[\s,;|•·$]|\s+\d+\s*(?:beds?|bd|br)\b)`, "i");
const PRICE = /\$\s?\d[\d,.]*(?:\s?[KkMm])?\b/g;
const SPECS = /\b\d+(?:\.\d+)?\s*(?:beds?|bd|br|baths?|ba|total baths?|sq\.?\s*ft|sqft|acres?)\b|\$\d[\d,]*\s*\/\s*sqft/gi;
/** A search or category link ("Residential Properties for Sale in Addison, Between $300,000 and …"). */
const SEARCH_LINK_TITLE = /^(?:(?:residential|land|lots?|commercial|condos?|townhomes?|multi-?family|single[- ]family|luxury|new)\s+)*(?:properties|homes|houses|listings|condos|lots|land)\s+for\s+(?:sale|rent|lease)\s+in\b/i;
/** The URL is a results page itself (its last segment), not a property under a search route (Flexmls "/search/…/listings/<id>"). */
const SEARCH_RESULTS_URL = /\/(?:results|search|search-results)(?:\/listings)?\/?$/i;
const NOT_A_PROPERTY = /^(?:\d+\s+(?:listings?|properties|homes|results|matches))$|\b(?:houses|homes|properties|condos)\s+for\s+sale\b.*\bmedian\b|^(?:subscription|pricing|plans?)\b|\bsubscription cost\b/i;

/**
 * A social post, profile or video is never a property record, whatever page or widget linked to it (an
 * Instagram feed on a listings page reads like a card: an image, a caption and a link). (Autonomous repair:
 * not-a-property.)
 */
const SOCIAL_HOST = /(?:^|\.)(?:instagram\.com|facebook\.com|fb\.com|fb\.watch|youtube\.com|youtu\.be|tiktok\.com|pinterest\.com|twitter\.com|x\.com|linkedin\.com|threads\.net|vimeo\.com)$/i;

const US_STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/\b([A-Z][a-z])\b(?=\s+\d{5}|,|$)/g, s => US_STATES.has(s.toUpperCase()) ? s.toUpperCase() : s)
    .replace(/\b(Nw|Ne|Sw|Se)\b/g, s => s.toUpperCase());
}

/** The address a property URL spells out (".../2105-Wood-Duck-Lane", ".../550-Wanamaker-Coupeville-WA-98239"). */
export function addressFromUrl(sourceUrl: string): string | undefined {
  let url: URL;
  try { url = new URL(sourceUrl); } catch { return undefined; }
  const segments = url.pathname.split("/").filter(Boolean).map(segment => decodeURIComponent(segment));
  for (let i = segments.length - 1; i >= 0; i--) {
    // Provider suffixes are not part of the address ("…-mls_25-766", "…-mls_930957").
    const words = segments[i].replace(/[-_]mls[-_].*$/i, "").split(/[-_+]+/).filter(Boolean);
    if (words.length >= 3 && /^\d{1,6}[a-z]?$/i.test(words[0]) && words.slice(1).some(word => /^[a-z]{2,}$/i.test(word))) {
      // Trailing provider ids are not part of the address ("…-220229717", "…-6ff8974e").
      while (words.length > 3 && (/^\d{7,}$/.test(words[words.length - 1]) || /^(?=.*\d)(?=.*[a-f])[0-9a-f]{6,}$/i.test(words[words.length - 1]))) words.pop();
      const city = i > 0 && /^[a-z][a-z-]+$/i.test(segments[i - 1]) && segments[i - 1].length > 2 && !/^(?:listing|listings|property|properties|home|homes|details|idx|for-sale|homes-for-sale|search|mls)$/i.test(segments[i - 1]) && !words.some(word => word.toLowerCase() === segments[i - 1].toLowerCase()) ? segments[i - 1].replace(/-/g, " ") : "";
      const text = words.join(" ");
      const named = /[a-z]/.test(text) && /[A-Z]/.test(text) ? text : titleCase(text);
      return city ? `${named}, ${titleCase(city)}` : named;
    }
  }
  return undefined;
}

/** A readable property title from a card's text, or undefined when the text holds no address. */
export function propertyTitle(raw: string): string | undefined {
  let text = decodeListingText(raw).replace(UI_LABEL, " ").replace(/\s+/g, " ").trim();
  // Trailing listing numbers and card counters ("mls 930957", "1 / 40") are not the address.
  text = text.replace(/\bmls\s*#?\s*[\w-]+$/i, "").replace(/\b\d+\s*\/\s*\d+\b/g, " ").replace(/\s+/g, " ").trim();
  // Prices and specs are removed first: "2,532 SQFT 2105 Wood Duck Lane" must not start the address at 532.
  const plain = text.replace(PRICE, " ").replace(SPECS, " ").replace(/\s*[|•·]\s*/g, " ").replace(/\s+/g, " ").trim();
  const address = plain.match(ADDRESS)?.[0]?.replace(/[\s,;|•·]+$/, "").trim();
  if (address) return address;
  const stripped = plain;
  // Without a street suffix ("8112 M-77 Germfask, MI 49836", "W18572 H-42 Curtis"): a number-led remainder with a ZIP or comma.
  if (/^[NSEW]?\d{1,6}[A-Z]?\s+\S/.test(stripped) && stripped.length <= 90 && (/\b\d{5}\b/.test(stripped) || stripped.includes(","))) return stripped;
  return undefined;
}

/** A title that is a price, card text, a label or an entity soup rather than the property's name. */
export const titleNeedsRepair = (title: string) => needsTitle(title);
const needsTitle = (title: string) => !title || /^\$?\s?[\d,.]+\s?[KkMm]?$/.test(title.trim()) || /\$\s?\d/.test(title) || HAS_UI_LABEL.test(title) ||
  /\b\d+\s*(?:beds?|bd|baths?|ba)\b/i.test(title) || /\bmls\s*#?\s*\d/i.test(title) || /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(title) || title.length > 90;

// ── Images (repair campaign stage 7) ─────────────────────────────────────────────────────────────
// Only URL shapes a resizer already exposes are rewritten; signed URLs are never altered.

const SIGNED = /[?&](?:s|sig|signature|token|key|expires|policy|x-amz-[\w-]+|hmac)=/i;
/** Not a property photo: placeholders, "no photo" tiles, maps and street views. */
const NOT_A_PHOTO = /no[-_]?photo|photo[-_]?(?:coming|unavailable|not[-_]available)|coming[-_]?soon\.(?:jpe?g|png|gif|webp)|placeholder|default[-_](?:listing|property|home)|image[-_]?not[-_]?available|maps\.googleapis\.com\/maps\/api\/(?:staticmap|streetview)|\/streetview\b/i;

/** The full-size version of an image URL whose resizer exposes its size (never a signed URL). */
export function fullSizeImageUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return raw; }
  if (SIGNED.test(url.search)) return raw;
  // Wix image service: a blurred or small "fill" placeholder becomes a 1600 px fit of the same image.
  const wix = url.hostname === "static.wixstatic.com" && url.pathname.match(/^(\/media\/[^/]+)\/v1\/(?:fill|fit|crop)\/[^/]+\/(.+)$/);
  if (wix) {
    const size = Number(decodeURIComponent(url.pathname).match(/w_(\d+)/)?.[1] ?? 0);
    if (size < 1200 || /blur_\d/.test(decodeURIComponent(url.pathname))) return `https://static.wixstatic.com${wix[1]}/v1/fit/w_1600,h_1600,q_85,enc_auto/${wix[2]}`;
    return raw;
  }
  // Size path segments ("/640x480/true/", the Spark resizer that also serves 1600x1200).
  const sized = url.pathname.match(/^(.*?\/)(\d{2,4})x(\d{2,4})(\/true\/.+)$/);
  if (sized && url.hostname.endsWith("sparkplatform.com") && Number(sized[2]) < 1600) return `${url.origin}${sized[1]}1600x1200${sized[4]}${url.search}`;
  return raw;
}

/** A listing's photos: real photos only, full size, one URL per photo (size variants collapse). */
export function propertyImages(images: string[]): string[] {
  const byPhoto = new Map<string, { url: string; width: number }>();
  for (const raw of images) {
    if (!raw || NOT_A_PHOTO.test(raw)) continue;
    const url = fullSizeImageUrl(raw);
    let key = url, width = Number.MAX_SAFE_INTEGER;
    try {
      const parsed = new URL(url);
      const sizeParam = parsed.searchParams.get("width") ?? parsed.searchParams.get("w");
      if (!SIGNED.test(parsed.search)) { key = parsed.origin + parsed.pathname; width = sizeParam ? Number(sizeParam) || 0 : Number.MAX_SAFE_INTEGER; }
    } catch { /* keep as is */ }
    const prior = byPhoto.get(key);
    if (!prior || width > prior.width) byPhoto.set(key, { url, width });
  }
  return [...byPhoto.values()].map(entry => entry.url);
}

export type NormalizedRecords = { listings: DiscoveredListing[]; dropped: { sourceUrl: string; title: string; reason: string }[] };

/** Same property under URL variants: ".../listing/b027/4984092" and ".../listing/b027/4984092/20-Carinthia-Road-...". */
function propertyKey(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    const previous = segments[segments.length - 2] ?? "";
    const path = segments.length >= 2 && /^\d{5,}$/.test(previous) && /^\d{1,6}-[\w-]+$/.test(last) ? segments.slice(0, -1) : segments;
    return `${url.hostname.replace(/^www\./, "")}/${path.join("/")}`.toLowerCase();
  } catch { return sourceUrl; }
}

const plainKey = (value: string | undefined) => (value ?? "").toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]/g, "");
const listingIdOf = (item: DiscoveredListing) => Number(item.listingNumber?.replace(/\D/g, "") || item.sourceUrl.match(/\/(\d{5,})(?:\/|$|[?#])/)?.[1] || 0);

/**
 * One property published under two listing ids (a relisting, or the same home entered in two MLS classes):
 * the same named property (title and area), the same price, and the same remarks or lead photo. Distinct
 * units carry their unit in the title; one parcel listed as a house and as land carries a different price
 * or remarks; titles that name nothing (a price, card text) are never merged. (Autonomous repair:
 * duplicate-property.)
 */
function sameProperty(a: DiscoveredListing, b: DiscoveredListing): boolean {
  if (needsTitle(a.title) || !/[a-z]{2,}/i.test(a.title)) return false;
  if (plainKey(a.title) !== plainKey(b.title) || plainKey(a.neighborhood) !== plainKey(b.neighborhood)) return false;
  if (!plainKey(a.price) || plainKey(a.price) !== plainKey(b.price)) return false;
  const remarks = (item: DiscoveredListing) => item.description.replace(/\s+/g, " ").trim();
  return (remarks(a).length >= 40 && remarks(a) === remarks(b)) || (!!a.images[0] && a.images[0] === b.images[0]);
}

/**
 * One listing published on two hosts of the same site (the agent's domain and the platform's subdomain
 * for it, e.g. "/property/21382178/" on both): the same path carrying a listing id and the same price.
 * (Autonomous repair: mirrored-listing.)
 */
function mirroredListing(a: DiscoveredListing, b: DiscoveredListing): boolean {
  try {
    const x = new URL(a.sourceUrl), y = new URL(b.sourceUrl);
    if (x.hostname === y.hostname) return false;
    const path = (u: URL) => u.pathname.replace(/\/+$/, "");
    if (path(x) !== path(y) || !path(x).split("/").some(part => /^\d{5,}$/.test(part))) return false;
    return !!plainKey(a.price) && plainKey(a.price) === plainKey(b.price);
  } catch { return false; }
}

/** The copies of one mirrored listing become one record: the copy that names its property and has remarks
 * keeps its URL, identity and attribution; the larger photo set and the longer remarks of either copy are kept. */
function mergeMirrors(a: DiscoveredListing, b: DiscoveredListing): { keep: DiscoveredListing; other: DiscoveredListing } {
  const score = (item: DiscoveredListing) => (needsTitle(item.title) ? 0 : 2) + (item.description ? 1 : 0);
  const [keep, other] = score(b) > score(a) || (score(b) === score(a) && b.images.length > a.images.length) ? [b, a] : [a, b];
  const images = other.images.length > keep.images.length ? other.images : keep.images;
  return { other, keep: { ...keep, title: needsTitle(keep.title) && !needsTitle(other.title) ? other.title : keep.title,
    description: other.description.length > keep.description.length ? other.description : keep.description, images, image: images[0] ?? keep.image } };
}

/** Of two records of one property: the attributed one, then the richer one, then the newer listing id. */
function preferredRecord(a: DiscoveredListing, b: DiscoveredListing): DiscoveredListing {
  if (!!a.ownership !== !!b.ownership) return a.ownership ? a : b;
  if (a.images.length !== b.images.length) return a.images.length > b.images.length ? a : b;
  if (a.description.length !== b.description.length) return a.description.length > b.description.length ? a : b;
  return listingIdOf(b) > listingIdOf(a) ? b : a;
}

export function normalizeListingRecords(items: DiscoveredListing[]): NormalizedRecords {
  const dropped: NormalizedRecords["dropped"] = [];
  const byKey = new Map<string, DiscoveredListing>();
  for (const item of items) {
    const rawTitle = decodeListingText(item.title ?? "");
    // A title that only needed decoding ("Road ,&nbsp; Dover") is decoded, not re-extracted.
    const repair = needsTitle(rawTitle);
    const fromText = repair ? propertyTitle(item.title ?? "") : undefined;
    const fromUrl = addressFromUrl(item.sourceUrl);
    const title = repair ? (fromText ?? fromUrl ?? rawTitle) : rawTitle;
    let searchUrl = false, social = false;
    try { const url = new URL(item.sourceUrl); searchUrl = SEARCH_RESULTS_URL.test(url.pathname); social = SOCIAL_HOST.test(url.hostname); } catch { /* not a URL */ }
    if (social) { dropped.push({ sourceUrl: item.sourceUrl, title: rawTitle, reason: "not_a_property" }); continue; }
    if ((NOT_A_PROPERTY.test(rawTitle) && !fromUrl) || SEARCH_LINK_TITLE.test(rawTitle) || (searchUrl && !fromUrl && !/^\s*[NSEW]?\d{1,6}\s+\S/.test(fromText ?? rawTitle))) {
      dropped.push({ sourceUrl: item.sourceUrl, title: rawTitle, reason: "not_a_property" });
      continue;
    }
    const images = propertyImages(item.images ?? []);
    const record: DiscoveredListing = { ...item, title, images, image: images[0] ?? "", description: decodeListingText(item.description ?? "", true),
      neighborhood: decodeListingText(item.neighborhood ?? ""), ...(item.listingOffice ? { listingOffice: decodeListingText(item.listingOffice) } : {}) };
    const key = propertyKey(item.sourceUrl);
    const prior = byKey.get(key);
    if (!prior) { byKey.set(key, record); continue; }
    // Keep the richer record and the URL that spells out the address.
    const keep = (record.images.length > prior.images.length || (record.detailsComplete && !prior.detailsComplete)) ? record : prior;
    const other = keep === record ? prior : record;
    byKey.set(key, { ...keep, sourceUrl: keep.sourceUrl.length >= other.sourceUrl.length ? keep.sourceUrl : other.sourceUrl,
      title: needsTitle(keep.title) && !needsTitle(other.title) ? other.title : keep.title,
      description: keep.description.length >= other.description.length ? keep.description : other.description });
    dropped.push({ sourceUrl: other.sourceUrl, title: other.title, reason: "duplicate_url_variant" });
  }
  const collapsed = collapseDuplicates([...byKey.values()]);
  for (const merge of collapsed.merged) dropped.push({ sourceUrl: merge.from.sourceUrl, title: merge.from.title, reason: merge.reason });
  return { listings: collapsed.kept, dropped };
}

/**
 * One record per property and per listing (mirrored-listing, duplicate-property). Used at the save boundary
 * and again by the refresh detail jobs, whose later details (remarks, photos) can reveal duplicates the first
 * job could not see. Records keep their own extra fields (saved ids, notes); `canDrop` lets a caller protect
 * records that must never be removed (for example ones a realtor edited or hid).
 */
export function collapseDuplicates<T extends DiscoveredListing>(items: T[], canDrop: (item: T) => boolean = () => true):
  { kept: T[]; merged: { from: T; into: T; reason: "mirrored_listing" | "duplicate_property" }[] } {
  const kept: T[] = [];
  const merged: { from: T; into: T; reason: "mirrored_listing" | "duplicate_property" }[] = [];
  for (const record of items) {
    const mirror = kept.findIndex(other => mirroredListing(other, record));
    if (mirror >= 0) {
      const { keep, other } = mergeMirrors(kept[mirror], record);
      if (canDrop(other as T)) {
        kept[mirror] = keep as T;
        merged.push({ from: other as T, into: kept[mirror], reason: "mirrored_listing" });
        continue;
      }
    }
    const index = mirror >= 0 ? -1 : kept.findIndex(other => sameProperty(other, record));
    if (index < 0) { kept.push(record); continue; }
    const keep = preferredRecord(kept[index], record) as T;
    const other = keep === record ? kept[index] : record;
    if (!canDrop(other)) { kept.push(record); continue; }
    kept[index] = keep;
    merged.push({ from: other, into: keep, reason: "duplicate_property" });
  }
  return { kept, merged };
}
