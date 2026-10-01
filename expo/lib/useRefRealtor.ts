import { useCallback, useEffect, useState } from "react";
import type { Brand } from "@/contexts/BrandContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { isRealtorRef } from "@/lib/leadBooking";
import { kvGet } from "@/lib/kvStore";

/** Public links never substitute another realtor's content while loading. */
export function useRefRealtor(ref: string | undefined, fallback: Brand) {
  const [attempt, setAttempt] = useState(0);
  const [remote, setRemote] = useState<{
    ref?: string; brand?: Brand; listings?: ManagedListing[]; error?: string;
  }>({});
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    if (!isRealtorRef(ref)) return;
    let alive = true;
    setRemote({});
    void Promise.all([
      kvGet<Brand>(ref + ":brand.v2", true),
      kvGet<{ items: ManagedListing[] }>(ref + ":listings.v2", true),
    ]).then(([brandRow, listingsRow]) => {
      if (!alive) return;
      if (!brandRow?.value?.realtor?.name) {
        setRemote({ ref, error: "This realtor's booking page is unavailable. Ask them for a new link." });
        return;
      }
      const items = listingsRow?.value?.items ?? [];
      setRemote({ ref, brand: brandRow.value, listings: items.filter(l => !l.hidden) });
    }).catch(() => {
      if (alive) setRemote({ ref, error: "We couldn't load this booking page. Check your connection and retry." });
    });
    return () => { alive = false; };
  }, [ref, attempt]);
  const current = remote.ref === ref ? remote : {};
  return {
    brand: current.brand ?? fallback,
    listings: current.listings ?? null,
    loading: !!ref && isRealtorRef(ref) && !current.brand && !current.error,
    error: ref && !isRealtorRef(ref) ? "This booking link is invalid. Ask your realtor for a new link." : current.error,
    retry,
  };
}
