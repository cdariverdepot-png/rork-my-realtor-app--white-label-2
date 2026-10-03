import type { ManagedListing } from "@/contexts/ListingsContext";
import type { DiscoveredListing } from "./buildService";

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32) || "listing";

/** Stable-ish id so re-imports of the same source URL update instead of duplicating. */
function listingId(item: DiscoveredListing, index: number): string {
  if (item.importKey || !item.sourceUrl) {
    const identity = item.importKey || `${item.title}|${item.neighborhood}`.toLowerCase();
    let hash = 2166136261;
    for (const ch of identity) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    return `${slug(item.title)}-${(hash >>> 0).toString(36)}`;
  }
  try {
    const host = new URL(item.sourceUrl).hostname.replace(/^www\./, "").slice(0, 18);
    const path = new URL(item.sourceUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    // Hash the full URL: MLS ids often share long prefixes, and some sites use ?id=.
    let hash = 2166136261;
    for (const ch of `${item.sourceUrl}|${item.title.toLowerCase()}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    return `${slug(`${host}-${path || item.title}`)}-${(hash >>> 0).toString(36)}`;
  } catch {
    return `${slug(item.title)}-${index}`;
  }
}

export function toManagedListing(item: DiscoveredListing, index: number): ManagedListing {
  const cover = item.image || item.images[0] || "";
  const images = item.images.length ? item.images : cover ? [cover] : [];
  return {
    id: listingId(item, index),
    title: item.title || "",
    neighborhood: item.neighborhood || "",
    price: item.price || "",
    beds: item.beds || 0,
    baths: item.baths || 0,
    sqft: item.sqft || "",
    image: cover,
    images,
    tag: "",
    elizaTake: (item.description || "").slice(0, 280),
    hidden: false,
    sourceUrl: item.sourceUrl,
    description: item.description || undefined,
    status: item.status,
    listingNumber: item.listingNumber,
    propertyType: item.propertyType,
    updatedAt: Date.now(),
  };
}

/**
 * Merge discovered listings into the current collection.
 * Match on sourceUrl first, then id — never wipe unrelated homes.
 */
export function mergeDiscoveredListings(
  current: ManagedListing[],
  discovered: DiscoveredListing[],
): ManagedListing[] {
  if (!discovered.length) return current;
  const bySource = new Map<string, ManagedListing[]>();
  for (const l of current) if (l.sourceUrl) {
    const key = l.sourceUrl.toLowerCase();
    bySource.set(key, [...(bySource.get(key) ?? []), l]);
  }
  const byId = new Map(current.map((l) => [l.id, l]));
  const next = [...current];
  discovered.forEach((item, index) => {
    const managed = toManagedListing(item, index);
    const existing =
      (item.sourceUrl && bySource.get(item.sourceUrl.toLowerCase())?.find(l => l.title.trim().toLowerCase() === item.title.trim().toLowerCase() || ((bySource.get(item.sourceUrl.toLowerCase())?.length ?? 0) === 1 && discovered.filter(d => d.sourceUrl === item.sourceUrl).length === 1))) || byId.get(managed.id);
    if (existing) {
      const merged: ManagedListing = {
        ...existing,
        ...managed,
        id: existing.id,
        hidden: existing.hidden,
        tag: existing.tag,
        status: managed.status ?? existing.status,
        elizaTake: existing.elizaTake?.trim() && existing.elizaTake !== "A note from me, coming soon."
          ? existing.elizaTake
          : managed.elizaTake,
        updatedAt: Date.now(),
      };
      const idx = next.findIndex((l) => l.id === existing.id);
      if (idx >= 0) next[idx] = merged;
    } else {
      next.unshift(managed);
      byId.set(managed.id, managed);
      if (managed.sourceUrl) bySource.set(managed.sourceUrl.toLowerCase(), [...(bySource.get(managed.sourceUrl.toLowerCase()) ?? []), managed]);
    }
  });
  return next;
}
