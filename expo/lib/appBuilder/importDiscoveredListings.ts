import type { ManagedListing } from "@/contexts/ListingsContext";
import type { DiscoveredListing } from "./buildService";

const FALLBACK_COVER =
  "https://r2-pub.rork.com/generated-images/5fb2bc37-b818-417d-b0d2-13522cb9cd43.png";

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32) || "listing";

/** Stable-ish id so re-imports of the same source URL update instead of duplicating. */
function listingId(item: DiscoveredListing, index: number): string {
  try {
    const host = new URL(item.sourceUrl).hostname.replace(/^www\./, "").slice(0, 18);
    const path = new URL(item.sourceUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    const base = slug(`${host}-${path || item.title}`) || `listing-${index}`;
    return base.slice(0, 48);
  } catch {
    return `${slug(item.title)}-${index}`;
  }
}

export function toManagedListing(item: DiscoveredListing, index: number): ManagedListing {
  const cover = item.image || item.images[0] || FALLBACK_COVER;
  const images = item.images.length ? item.images : [cover];
  return {
    id: listingId(item, index),
    title: item.title || "Untitled listing",
    neighborhood: item.neighborhood || "—",
    price: item.price || "Price on request",
    beds: item.beds || 0,
    baths: item.baths || 0,
    sqft: item.sqft || "—",
    image: cover,
    images,
    tag: "New",
    elizaTake: (item.description || "").slice(0, 280) || "A note from me, coming soon.",
    hidden: false,
    sourceUrl: item.sourceUrl,
    description: item.description || undefined,
    status: "active",
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
  const bySource = new Map(
    current.filter((l) => l.sourceUrl).map((l) => [l.sourceUrl!.toLowerCase(), l]),
  );
  const byId = new Map(current.map((l) => [l.id, l]));
  const next = [...current];
  discovered.forEach((item, index) => {
    const managed = toManagedListing(item, index);
    const existing =
      (item.sourceUrl && bySource.get(item.sourceUrl.toLowerCase())) || byId.get(managed.id);
    if (existing) {
      const merged: ManagedListing = {
        ...existing,
        ...managed,
        id: existing.id,
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
      if (managed.sourceUrl) bySource.set(managed.sourceUrl.toLowerCase(), managed);
    }
  });
  return next;
}
