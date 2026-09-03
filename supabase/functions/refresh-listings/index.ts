/**
 * refresh-listings — Supabase Edge Function
 *
 * Loops every listing in `app_kv.listings.v2` that has a `sourceUrl`,
 * fetches the source page server-side, re-parses price / description /
 * photos / status, and writes the result back to `app_kv`. Realtor and
 * client apps pick the update up automatically via their existing KV
 * realtime sync — no manual refresh required.
 *
 * Invocation:
 *   • Cron (every 24h) — see ../../sql/refresh_listings_cron.sql
 *   • App-side: `supabase.functions.invoke('refresh-listings', {
 *       body: { listingId?: string }  // omit to refresh all
 *     })`
 *
 * Parsing order, for EVERY field:
 *   1. <script type="application/ld+json"> structured data
 *   2. Open Graph / Twitter meta tags
 *   3. Raw HTML elements (h1, .price, <img>)
 *
 * On a status change to sold / pending / off_market the function appends
 * a notification to `app_kv.notifs.v1` so client phones get a push.
 *
 * Required env (already provided by Supabase to every Edge Function):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

// @ts-nocheck — Deno runtime; types differ from the Expo TS project.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Status = "active" | "pending" | "contingent" | "sold" | "off_market";

type Listing = {
  id: string;
  title: string;
  neighborhood: string;
  price: string;
  beds: number;
  baths: number;
  sqft: string;
  image: string;
  images: string[];
  tag: string;
  elizaTake: string;
  hidden: boolean;
  sourceUrl?: string;
  status?: Status;
  lastRefreshedAt?: number;
  updatedAt?: number;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// ───────────────────── Parsing helpers ─────────────────────

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));

const stripTags = (s: string): string =>
  s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

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

/** Pull every <script type="application/ld+json"> JSON blob. */
function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // ignore broken JSON-LD blocks
    }
  }
  return out;
}

/** Walk a JSON-LD tree and return the first matching numeric "price". */
function priceFromJsonLd(nodes: unknown[]): string | null {
  const stack: unknown[] = [...nodes];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    const p = obj.price ?? (obj.offers as Record<string, unknown> | undefined)?.price;
    if (typeof p === "string" || typeof p === "number") {
      const n = Number(p);
      if (!Number.isNaN(n) && n > 0) return `$${n.toLocaleString()}`;
    }
    Object.values(obj).forEach((v) => {
      if (v && typeof v === "object") stack.push(v);
    });
  }
  return null;
}

/** Detect status from any string by scanning keywords in priority order. */
function detectStatus(text: string): Status | null {
  if (!text) return null;
  const t = text.toLowerCase();
  // Highest specificity first — "sold" wins over "active" if both appear.
  if (/\bsold\b/.test(t)) return "sold";
  if (/\bpending\b/.test(t)) return "pending";
  if (/\bcontingent\b/.test(t)) return "contingent";
  if (/\boff[-\s]?market\b/.test(t)) return "off_market";
  if (/\b(active|for\s+sale)\b/.test(t)) return "active";
  return null;
}

type Parsed = {
  title: string | null;
  description: string | null;
  price: string | null;
  images: string[];
  status: Status | null;
};

function parseHtml(html: string, baseUrl: string): Parsed {
  const ld = jsonLdBlocks(html);
  const ldFlat = JSON.stringify(ld);

  // ─── Title ───
  let title: string | null = null;
  for (const node of ld) {
    const stack: unknown[] = [node];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== "object") continue;
      const obj = n as Record<string, unknown>;
      if (typeof obj.name === "string" && obj.name.length > 2 && !title) {
        title = decodeEntities(obj.name).trim();
        break;
      }
      Object.values(obj).forEach((v) => {
        if (v && typeof v === "object") stack.push(v);
      });
    }
    if (title) break;
  }
  if (!title) title = meta(html, "property", "og:title") ?? meta(html, "name", "twitter:title");
  if (!title) {
    const t = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    if (t) title = decodeEntities(t).trim();
  }
  if (!title) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    if (h1) title = stripTags(h1);
  }

  // ─── Description ───
  let description: string | null = null;
  for (const node of ld) {
    const stack: unknown[] = [node];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== "object") continue;
      const obj = n as Record<string, unknown>;
      if (typeof obj.description === "string" && obj.description.length > 20 && !description) {
        description = decodeEntities(obj.description).trim();
        break;
      }
      Object.values(obj).forEach((v) => {
        if (v && typeof v === "object") stack.push(v);
      });
    }
    if (description) break;
  }
  if (!description) {
    description =
      meta(html, "property", "og:description") ??
      meta(html, "name", "description") ??
      meta(html, "name", "twitter:description");
  }

  // ─── Price ───
  let price: string | null = priceFromJsonLd(ld);
  if (!price) {
    const og = meta(html, "property", "product:price:amount");
    if (og) {
      const n = Number(og);
      if (!Number.isNaN(n)) price = `$${n.toLocaleString()}`;
    }
  }
  if (!price) {
    // Look for any element with "price" in class/id, fall back to text scan
    const classMatch = html.match(
      /<[^>]+(?:class|id)=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\//i
    );
    if (classMatch) {
      const inner = stripTags(classMatch[1]);
      const m = inner.match(/\$[\s]?\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?|\$[\s]?\d+(?:\.\d+)?\s?[MK]/i);
      if (m) price = m[0].replace(/\s+/g, "");
    }
  }
  if (!price) {
    const text = stripTags(html);
    const m = text.match(
      /\$[\s]?\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?(?:\s?[MK])?|\$[\s]?\d+(?:\.\d+)?\s?[MK]/i
    );
    if (m) price = m[0].replace(/\s+/g, "");
  }

  // ─── Images ───
  const set = new Set<string>();
  // JSON-LD first
  for (const node of ld) {
    const stack: unknown[] = [node];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      if (typeof n === "string") {
        if (/^https?:\/\//.test(n) && /\.(jpe?g|png|webp)/i.test(n)) {
          const a = absolutize(n, baseUrl);
          if (a && !looksLikeChrome(a)) set.add(a);
        }
        continue;
      }
      if (typeof n !== "object") continue;
      const obj = n as Record<string, unknown>;
      if (obj.image) stack.push(obj.image);
      Object.values(obj).forEach((v) => {
        if (v && typeof v === "object") stack.push(v);
      });
    }
  }
  const ogImg = meta(html, "property", "og:image");
  if (ogImg) {
    const a = absolutize(ogImg, baseUrl);
    if (a) set.add(a);
  }
  const twImg = meta(html, "name", "twitter:image");
  if (twImg) {
    const a = absolutize(twImg, baseUrl);
    if (a) set.add(a);
  }
  const imgRe = /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const a = absolutize(m[1], baseUrl);
    if (a && !looksLikeChrome(a)) set.add(a);
  }
  const srcsetRe = /<(?:img|source)[^>]+srcset=["']([^"']+)["'][^>]*>/gi;
  while ((m = srcsetRe.exec(html)) !== null) {
    m[1]
      .split(",")
      .map((s) => s.trim().split(/\s+/)[0])
      .forEach((u) => {
        const a = absolutize(u, baseUrl);
        if (a && !looksLikeChrome(a)) set.add(a);
      });
  }

  // ─── Status ───
  let status: Status | null = detectStatus(ldFlat);
  if (!status) {
    const ogStatus =
      meta(html, "property", "og:availability") ??
      meta(html, "property", "product:availability") ??
      meta(html, "name", "availability") ??
      meta(html, "property", "og:title") ??
      meta(html, "property", "og:description") ??
      "";
    status = detectStatus(ogStatus);
  }
  if (!status) {
    // HTML-only scan — limit to the first 80KB of body text to keep regex sane.
    const body = stripTags(html).slice(0, 80_000);
    status = detectStatus(body);
  }

  return {
    title: title?.trim() || null,
    description: description?.trim() || null,
    price: price || null,
    images: Array.from(set).slice(0, 24),
    status,
  };
}

async function fetchListing(url: string): Promise<Parsed | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      console.error("[refresh] fetch failed", url, res.status);
      return null;
    }
    const html = await res.text();
    return parseHtml(html, url);
  } catch (e) {
    console.error("[refresh] fetch error", url, e);
    return null;
  }
}

// ───────────────────── Notification helpers ─────────────────────

const STATUS_LABEL: Record<Status, string> = {
  active: "Back on the market",
  pending: "Now pending",
  contingent: "Now contingent",
  sold: "Just sold",
  off_market: "Off the market",
};

function buildStatusNotif(listing: Listing, status: Status) {
  return {
    id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${listing.id}`,
    kind: "status" as const,
    title: `${listing.title} — ${STATUS_LABEL[status]}`,
    body:
      status === "sold"
        ? `${listing.title} just closed at ${listing.price}. A quiet ending — congratulations to the new owners.`
        : status === "pending"
        ? `${listing.title} just went pending. Tell me if you'd like to see anything similar.`
        : status === "off_market"
        ? `${listing.title} has been pulled off the market for now. I'll let you know if it comes back.`
        : `${listing.title} is now ${STATUS_LABEL[status].toLowerCase()}.`,
    listingId: listing.id,
    read: false,
    createdAt: Date.now(),
  };
}

// ───────────────────── Handler ─────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "Edge function missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let listingId: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.listingId === "string") listingId = body.listingId;
  } catch {
    // Empty body — refresh all.
  }

  const { data: row, error: getErr } = await sb
    .from("app_kv")
    .select("value, rev")
    .eq("key", "listings.v2")
    .maybeSingle();
  if (getErr) return json({ ok: false, error: getErr.message }, 500);
  if (!row?.value) return json({ ok: true, refreshed: 0, message: "no listings yet" });

  const blob = row.value as { items: Listing[] };
  const items: Listing[] = Array.isArray(blob.items) ? blob.items : [];
  const targets = items.filter(
    (it) => it.sourceUrl && (!listingId || it.id === listingId)
  );

  const statusChanges: Array<{ listing: Listing; from: Status; to: Status }> = [];
  let changed = 0;

  for (const item of targets) {
    if (!item.sourceUrl) continue;
    const parsed = await fetchListing(item.sourceUrl);
    if (!parsed) continue;

    const prevStatus: Status = item.status ?? "active";
    const nextStatus: Status = parsed.status ?? prevStatus;
    let dirty = false;

    if (parsed.price && parsed.price !== item.price) {
      item.price = parsed.price;
      dirty = true;
    }
    if (parsed.description && parsed.description !== item.elizaTake) {
      item.elizaTake = parsed.description;
      dirty = true;
    }
    if (parsed.images.length > 0) {
      const same =
        parsed.images.length === item.images?.length &&
        parsed.images.every((u, i) => u === item.images[i]);
      if (!same) {
        item.images = parsed.images;
        item.image = parsed.images[0];
        dirty = true;
      }
    }
    if (parsed.title && parsed.title !== item.title) {
      item.title = parsed.title;
      dirty = true;
    }
    if (nextStatus !== prevStatus) {
      item.status = nextStatus;
      dirty = true;
      if (nextStatus === "sold" || nextStatus === "pending" || nextStatus === "off_market") {
        statusChanges.push({ listing: item, from: prevStatus, to: nextStatus });
      }
    } else if (!item.status) {
      item.status = nextStatus;
    }

    item.lastRefreshedAt = Date.now();
    item.updatedAt = Date.now();
    if (dirty) changed++;
  }

  // Always write back — even if nothing changed, lastRefreshedAt updated.
  if (targets.length > 0) {
    const newRev = Math.max(Number(row.rev ?? 0) + 1, Date.now());
    const { error: upErr } = await sb.from("app_kv").upsert(
      {
        key: "listings.v2",
        value: { items },
        rev: newRev,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
  }

  // Push status-change notifications via notifs.v1 blob.
  if (statusChanges.length > 0) {
    const { data: nRow } = await sb
      .from("app_kv")
      .select("value, rev")
      .eq("key", "notifs.v1")
      .maybeSingle();
    const existing: unknown[] = Array.isArray(nRow?.value) ? (nRow!.value as unknown[]) : [];
    const newNotifs = statusChanges.map((c) => buildStatusNotif(c.listing, c.to));
    const next = [...newNotifs, ...existing].slice(0, 200);
    const newRev = Math.max(Number(nRow?.rev ?? 0) + 1, Date.now());
    await sb.from("app_kv").upsert(
      {
        key: "notifs.v1",
        value: next,
        rev: newRev,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  }

  return json({
    ok: true,
    refreshed: targets.length,
    changed,
    statusChanges: statusChanges.map((c) => ({
      id: c.listing.id,
      from: c.from,
      to: c.to,
    })),
  });
});
