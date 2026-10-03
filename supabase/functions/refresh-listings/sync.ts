import { extractListingsFromPage, statusForProperty, type DiscoveredListing } from "../analyze-realtor-build/listingDiscovery.ts";

export type SyncListing = {
  id: string; title: string; sourceUrl?: string; status?: DiscoveredListing["status"];
  price?: string; description?: string; images?: string[]; image?: string;
  lastRefreshedAt?: number; lastStatusVerifiedAt?: number; lastSyncAttemptAt?: number;
  nextSyncAt?: number; syncFailures?: number; syncState?: "verified" | "status-unconfirmed" | "unavailable";
  syncError?: string; [key: string]: unknown;
};
export type Observation = { sourceUrl: string; checkedAt: number; property?: DiscoveredListing; status?: DiscoveredListing["status"]; error?: string };
const HOUR = 60 * 60 * 1000;
export const syncInterval = (status?: SyncListing["status"]) => status === "sold" || status === "off_market" ? 24 * HOUR : 2 * HOUR;
export const isDue = (item: SyncListing, now: number) => !!item.sourceUrl && (item.nextSyncAt ?? 0) <= now;

const identity = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const canonical = (value: string) => { try { const u = new URL(value); u.hash = ""; return u.toString(); } catch { return value; } };

/** Match the property's address as well as its URL; a redirected agency page is not the property. */
export function observeListing(item: SyncListing, html: string, finalUrl: URL, now: number): Observation {
  const properties = extractListingsFromPage(html, finalUrl);
  const property = properties.find(p => identity(p.title) === identity(item.title) &&
    (canonical(p.sourceUrl) === canonical(item.sourceUrl ?? "") || canonical(p.sourceUrl) === canonical(finalUrl.toString())));
  const status = property?.status ?? statusForProperty(html, { title: item.title, sourceUrl: item.sourceUrl ?? "" }, finalUrl);
  if (!property && !status) return { sourceUrl: item.sourceUrl!, checkedAt: now, error: "The source did not expose this property's details or status. We'll retry." };
  return { sourceUrl: item.sourceUrl!, checkedAt: now, property, status };
}

/** Preserve the last known status on missing/blocked pages. Never infer sold from disappearance. */
export function applyObservation(item: SyncListing, result: Observation): SyncListing {
  if (item.sourceUrl !== result.sourceUrl || (item.lastSyncAttemptAt ?? 0) > result.checkedAt) return item;
  if (result.error) {
    const failures = (item.syncFailures ?? 0) + 1;
    return { ...item, lastSyncAttemptAt: result.checkedAt, syncState: "unavailable", syncError: result.error,
      syncFailures: failures, nextSyncAt: result.checkedAt + Math.min(24, 0.5 * 2 ** Math.min(failures - 1, 6)) * HOUR };
  }
  const p = result.property;
  const updated: SyncListing = { ...item,
    ...(p?.price ? { price: p.price } : {}),
    ...(p?.description ? { description: p.description } : {}),
    ...(p?.images.length ? { images: p.images, image: p.images[0] } : {}),
    ...(p?.beds ? { beds: p.beds } : {}), ...(p?.baths ? { baths: p.baths } : {}),
    ...(p?.sqft ? { sqft: p.sqft } : {}), ...(p?.neighborhood ? { neighborhood: p.neighborhood } : {}),
    ...(result.status ? { status: result.status, lastStatusVerifiedAt: result.checkedAt } : {}),
    lastRefreshedAt: result.checkedAt, lastSyncAttemptAt: result.checkedAt, syncFailures: 0,
    syncState: result.status ? "verified" : "status-unconfirmed", syncError: undefined,
    nextSyncAt: result.checkedAt + syncInterval(result.status ?? item.status),
  };
  const fields = ["price", "description", "images", "image", "beds", "baths", "sqft", "neighborhood", "status"];
  if (fields.some(key => JSON.stringify(updated[key]) !== JSON.stringify(item[key]))) updated.updatedAt = result.checkedAt;
  return updated;
}

/** Merge onto the latest collection so concurrent edits, added homes and deletions survive. */
export function mergeObservations(items: SyncListing[], results: Map<string, Observation>): SyncListing[] {
  return items.map(item => { const result = results.get(item.id); return result ? applyObservation(item, result) : item; });
}
