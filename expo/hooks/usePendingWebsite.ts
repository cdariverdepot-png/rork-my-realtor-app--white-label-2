import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { DRAFT_HOME_PREFIX } from "@/lib/draftHomes";
import { loadBuild } from "@/lib/appBuilder/buildService";
import { toManagedListing } from "@/lib/appBuilder/importDiscoveredListings";
import { onPendingWebsiteChange, readPendingWebsite } from "@/lib/appBuilder/pendingWebsite";
import { sameWebsite, type PendingWebsite } from "@/lib/appBuilder/websiteSwitch";

/**
 * A website change made in Studio that has not been published yet, and the homes the draft's website shows
 * (read when the draft was rebuilt from it). Only the realtor sees these, and only in previews of the draft:
 * clients keep seeing the published app and its listings until the realtor publishes.
 */
export function usePendingWebsite(): { pending: PendingWebsite | null; listings: ManagedListing[] | null; reload: () => Promise<void> } {
  const { realtorId, isAdmin, demoViewMode } = useAuth();
  const [state, setState] = useState<{ pending: PendingWebsite | null; listings: ManagedListing[] | null }>({ pending: null, listings: null });
  const reload = useCallback(async () => {
    if (!realtorId || !isAdmin || demoViewMode) { setState({ pending: null, listings: null }); return; }
    try {
      const pending = await readPendingWebsite(realtorId);
      if (!pending) { setState({ pending: null, listings: null }); return; }
      const build = await loadBuild().catch(() => null);
      const primary = build?.sources.find(source => source.kind === "url");
      // The draft's homes belong to the draft's website only.
      const found = primary && sameWebsite(primary.uri, pending.to) ? build?.draft.discoveredListings ?? [] : [];
      setState({ pending, listings: found.map((item, index) => { const home = toManagedListing(item, index); return { ...home, id: `${DRAFT_HOME_PREFIX}${home.id}` }; }) });
    } catch { setState({ pending: null, listings: null }); }
  }, [realtorId, isAdmin, demoViewMode]);
  useEffect(() => { void reload(); return onPendingWebsiteChange(() => { void reload(); }); }, [reload]);
  return useMemo(() => ({ ...state, reload }), [state, reload]);
}
