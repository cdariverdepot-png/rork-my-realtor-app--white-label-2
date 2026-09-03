/**
 * Lightweight client-side listing scraper.
 * Fetches the URL, extracts og/meta tags, prices, and gallery images.
 * Best-effort — fields the realtor can edit before saving.
 */

export type ScrapedListing = {
  title: string;
  description: string;
  price: string;
  images: string[];
  sourceUrl: string;
  beds: number;
  baths: number;
  sqft: string;
  neighborhood: string;
};

const truthy = <T,>(v: T | null | undefined | ""): v is T => Boolean(v);

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));

const stripTags = (s: string): string => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const meta = (html: string, key: string, value: string): string | null => {
  const re = new RegExp(
    `<meta[^>]*${key}=["']${value}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m1 = html.match(re);
  if (m1) return decodeEntities(m1[1]);
  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*${key}=["']${value}["'][^>]*>`,
    "i"
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]) : null;
};

const absolutize = (url: string, base: string): string | null => {
  try {
    if (!url) return null;
    if (url.startsWith("data:")) return null;
    if (url.startsWith("//")) return new URL("https:" + url).toString();
    return new URL(url, base).toString();
  } catch {
    return null;
  }
};

const looksLikeChrome = (u: string): boolean => {
  const lc = u.toLowerCase();
  return (
    lc.endsWith(".svg") ||
    lc.includes("/icon") ||
    lc.includes("logo") ||
    lc.includes("sprite") ||
    lc.includes("favicon") ||
    lc.includes("avatar") ||
    lc.includes("placeholder")
  );
};

/**
 * Why a link can't be used, phrased for a realtor rather than a developer.
 * `null` means the link looks fine to try.
 */
export type LinkProblem = {
  kind: "format" | "private" | "credentials" | "local";
  message: string;
};

/** Path fragments that almost always sit behind a login. */
const GATED_PATHS = [
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/account",
  "/dashboard",
  "/portal",
  "/admin",
  "/agent-only",
  "/members",
  "/my-",
];

/** Hosts that are private MLS/agent systems rather than public listing pages. */
const GATED_HOSTS = ["matrix.", "mlsmatrix", "flexmls", "rmlsweb", "paragonrels", "connectmls", "navicamls"];

/**
 * Checks a pasted link *before* any network call so the realtor gets an instant,
 * plain-language answer instead of a failed import.
 */
export function inspectListingUrl(rawUrl: string): LinkProblem | null {
  const url = rawUrl.trim();
  if (!url) return null;

  if (!/^https?:\/\//i.test(url)) {
    return { kind: "format", message: "Start the link with https:// so we know where to look." };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "format", message: "That doesn't look like a complete web address yet." };
  }

  if (parsed.username || parsed.password) {
    return {
      kind: "credentials",
      message: "This link has a username and password built into it, so it isn't public.",
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return {
      kind: "local",
      message: "That address only works on your own computer — your clients' phones can't reach it.",
    };
  }

  if (GATED_HOSTS.some((h) => host.includes(h))) {
    return {
      kind: "private",
      message: "That looks like an agent-only MLS system. Use the public property page instead.",
    };
  }

  const path = parsed.pathname.toLowerCase();
  if (GATED_PATHS.some((p) => path.startsWith(p) || path.includes(p))) {
    return {
      kind: "private",
      message: "That page looks like it sits behind a login. Paste the public listing page instead.",
    };
  }

  return null;
}

/** Page markers that mean we were handed a sign-in wall instead of a listing. */
const looksLikeLoginWall = (html: string): boolean => {
  const head = html.slice(0, 60000).toLowerCase();
  const hasPasswordField = /<input[^>]+type=["']password["']/.test(head);
  const signalCount = [
    /sign in to (?:continue|view)/,
    /log ?in to (?:continue|view)/,
    /please (?:sign|log) ?in/,
    /members? only/,
    /password protected/,
    /enter (?:your )?password/,
    /authentication required/,
  ].filter((re) => re.test(head)).length;
  return hasPasswordField && signalCount > 0;
};

export async function scrapeListing(rawUrl: string): Promise<ScrapedListing> {
  const url = rawUrl.trim();
  const problem = inspectListingUrl(url);
  if (problem) throw new Error(problem.message);

  const { html, sawAuthWall } = await fetchHtml(url);
  if (sawAuthWall) {
    throw new Error(
      "That page asked us to sign in. The app pulls updates automatically, so the link has to be public — try the listing's public page."
    );
  }
  if (!html) {
    throw new Error(
      "Couldn't reach that page. It may block automated access — try a different public link, or add the listing manually."
    );
  }
  if (looksLikeLoginWall(html)) {
    throw new Error(
      "That link opens a password-protected page. Paste a public listing link so the app can keep it up to date."
    );
  }

  // Title
  const ogTitle = meta(html, "property", "og:title") ?? meta(html, "name", "twitter:title");
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const title = decodeEntities(ogTitle ?? titleTag ?? "").trim();

  // Description
  const ogDesc =
    meta(html, "property", "og:description") ??
    meta(html, "name", "description") ??
    meta(html, "name", "twitter:description");
  const description = decodeEntities(ogDesc ?? "").trim();

  // Price — look in JSON-LD first, then page text
  let price = "";
  const ldMatches = Array.from(html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const m of ldMatches) {
    try {
      const data = JSON.parse(m[1]);
      const stack: unknown[] = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const node = stack.pop();
        if (node && typeof node === "object") {
          const obj = node as Record<string, unknown>;
          if (typeof obj.price === "string" || typeof obj.price === "number") {
            price = `$${Number(obj.price).toLocaleString()}`;
            break;
          }
          if (obj.offers && typeof obj.offers === "object") stack.push(obj.offers);
          Object.values(obj).forEach((v) => {
            if (v && typeof v === "object") stack.push(v);
          });
        }
      }
      if (price) break;
    } catch {
      /* ignore */
    }
  }
  if (!price) {
    const text = stripTags(html);
    const priceMatch = text.match(/\$[\s]?\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?(?:\s?[MK])?|\$[\s]?\d+(?:\.\d+)?\s?[MK]/i);
    if (priceMatch) price = priceMatch[0].replace(/\s+/g, "");
  }

  // Images
  const set = new Set<string>();
  const ogImg = meta(html, "property", "og:image");
  if (ogImg) {
    const a = absolutize(ogImg, url);
    if (a) set.add(a);
  }
  const twImg = meta(html, "name", "twitter:image");
  if (twImg) {
    const a = absolutize(twImg, url);
    if (a) set.add(a);
  }
  const imgRe = /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const a = absolutize(m[1], url);
    if (a && !looksLikeChrome(a)) set.add(a);
  }
  // srcset
  const srcsetRe = /<(?:img|source)[^>]+srcset=["']([^"']+)["'][^>]*>/gi;
  while ((m = srcsetRe.exec(html)) !== null) {
    m[1]
      .split(",")
      .map((s) => s.trim().split(/\s+/)[0])
      .forEach((u) => {
        const a = absolutize(u, url);
        if (a && !looksLikeChrome(a)) set.add(a);
      });
  }

  const images = Array.from(set).slice(0, 24);

  const text = stripTags(html);
  const { beds, baths, sqft } = parseSpecs(html, text);
  const neighborhood = parseNeighborhood(html, title);

  return {
    title: title || "Untitled listing",
    description: description || "",
    price: price || "",
    images,
    sourceUrl: url,
    beds,
    baths,
    sqft,
    neighborhood,
  };
}

/**
 * Fetch page HTML, trying a direct request first then CORS-friendly read proxies.
 * Direct fetch works on native; the proxies cover web (CORS) and bot-blocked hosts.
 */
async function fetchHtml(url: string): Promise<{ html: string; sawAuthWall: boolean }> {
  let sawAuthWall = false;
  const attempts: (() => Promise<string>)[] = [
    async () => {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (res.status === 401 || res.status === 403) sawAuthWall = true;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    async () => {
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    async () => {
      const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  ];

  for (const attempt of attempts) {
    try {
      const html = await attempt();
      if (html && html.length > 500) return { html, sawAuthWall: false };
    } catch (e) {
      console.log("[scrapeListing] fetch attempt failed", e instanceof Error ? e.message : e);
    }
  }
  return { html: "", sawAuthWall };
}

const parseSpecs = (
  html: string,
  text: string
): { beds: number; baths: number; sqft: string } => {
  let beds = 0;
  let baths = 0;
  let sqft = "";

  // Structured data first
  const ldMatches = Array.from(
    html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );
  for (const m of ldMatches) {
    try {
      const data = JSON.parse(m[1]);
      const stack: unknown[] = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const node = stack.pop();
        if (node && typeof node === "object") {
          const obj = node as Record<string, unknown>;
          const b = obj.numberOfBedrooms ?? obj.numberOfRooms;
          if (!beds && (typeof b === "number" || typeof b === "string")) {
            const n = parseInt(String(b), 10);
            if (Number.isFinite(n)) beds = n;
          }
          const ba = obj.numberOfBathroomsTotal ?? obj.numberOfBathrooms;
          if (!baths && (typeof ba === "number" || typeof ba === "string")) {
            const n = parseFloat(String(ba));
            if (Number.isFinite(n)) baths = n;
          }
          const fs = obj.floorSize;
          if (!sqft && fs && typeof fs === "object") {
            const v = (fs as Record<string, unknown>).value;
            if (typeof v === "number" || typeof v === "string") {
              const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
              if (Number.isFinite(n) && n > 0) sqft = n.toLocaleString();
            }
          }
          Object.values(obj).forEach((v) => {
            if (v && typeof v === "object") stack.push(v);
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Fall back to page text
  if (!beds) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:bd|bds|bed|beds|bedrooms?)\b/i);
    if (m) beds = Math.round(parseFloat(m[1]));
  }
  if (!baths) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath|baths|bathrooms?)\b/i);
    if (m) baths = parseFloat(m[1]);
  }
  if (!sqft) {
    const m = text.match(/([\d,]{3,})\s*(?:sq\.?\s*ft|sqft|square\s*feet)\b/i);
    if (m) {
      const n = parseInt(m[1].replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(n) && n > 0) sqft = n.toLocaleString();
    }
  }

  return { beds, baths, sqft };
};

const parseNeighborhood = (html: string, title: string): string => {
  // Try JSON-LD address locality
  const ldMatches = Array.from(
    html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );
  for (const m of ldMatches) {
    try {
      const data = JSON.parse(m[1]);
      const stack: unknown[] = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const node = stack.pop();
        if (node && typeof node === "object") {
          const obj = node as Record<string, unknown>;
          const addr = obj.address;
          if (addr && typeof addr === "object") {
            const a = addr as Record<string, unknown>;
            const locality = a.addressLocality;
            const region = a.addressRegion;
            if (typeof locality === "string" && locality.trim()) {
              return typeof region === "string" && region.trim()
                ? `${locality.trim()}, ${region.trim()}`
                : locality.trim();
            }
          }
          Object.values(obj).forEach((v) => {
            if (v && typeof v === "object") stack.push(v);
          });
        }
      }
    } catch {
      /* ignore */
    }
  }
  // "123 Main St, Brooklyn, NY" -> "Brooklyn, NY"
  const parts = title.split(/[,|–—\-]/).map((p) => p.trim()).filter(truthy);
  if (parts.length >= 2) return parts.slice(1, 3).join(", ");
  return "";
};
