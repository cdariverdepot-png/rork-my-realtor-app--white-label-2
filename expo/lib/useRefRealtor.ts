import { useEffect, useState } from "react";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { isRealtorRef } from "@/lib/leadBooking";
import { kvGet } from "@/lib/kvStore";

/**
 * A visitor from a booking link isn't signed in, so the app's own brand and
 * listings are the demo ones. This loads the linked realtor's published brand
 * and visible listings (read-only) so the booking pages show the right person.
 */
export function useRefRealtor(ref: string | undefined, fallback: Brand): { brand: Brand; listings: ManagedListing[] | null } {
  const [remote, setRemote] = useState<{ brand: Brand | null; listings: ManagedListing[] | null }>({ brand: null, listings: null });
  useEffect(() => {
    if (!isRealtorRef(ref)) return;
    let alive = true;
    void Promise.all([
      kvGet<Brand>(`${ref}:brand.v2`).catch(() => null),
      kvGet<{ items: ManagedListing[] }>(`${ref}:listings.v2`).catch(() => null),
    ]).then(([brandRow, listingsRow]) => {
      if (!alive) return;
      const items = listingsRow?.value?.items;
      setRemote({
        brand: brandRow?.value ?? null,
        listings: Array.isArray(items) ? items.filter((l) => !l.hidden) : null,
      });
    });
    return () => { alive = false; };
  }, [ref]);
  const brand = remote.brand
    ? { ...fallback, ...remote.brand, realtor: { ...fallback.realtor, ...remote.brand.realtor } }
    : fallback;
  return { brand, listings: remote.listings };
}
