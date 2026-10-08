import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listings as seedListings, type Listing as SeedListing } from "@/constants/realtor";
import { supabase } from "@/lib/supabase";
import { isKvEnabled, kvSet } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth, DEMO_REALTOR_ID } from "@/contexts/AuthContext";
import { invokeListingSync, readRemainingDetails } from "@/lib/listingSourceService";
import { sameJson } from "@/lib/sameJson";

export type ListingStatus = "active" | "pending" | "contingent" | "sold" | "off_market";

export type ManagedListing = Omit<SeedListing, "tag"> & {
  tag: string;
  images: string[];
  hidden: boolean;
  sourceUrl?: string;
  updatedAt?: number;
  status?: ListingStatus;
  lastRefreshedAt?: number;
  lastStatusVerifiedAt?: number;
  lastSyncAttemptAt?: number;
  nextSyncAt?: number;
  syncState?: "verified" | "status-unconfirmed" | "unavailable";
  syncError?: string;
  syncFailures?: number;
  sourceId?: string;
  sourceArchived?: boolean;
  sourceMissingCount?: number;
  sourceMissingAt?: number;
  listingNumber?: string;
  propertyType?: string;
  detailsComplete?: boolean;
  facts?: Record<string, string>;
  /** Optional long-form copy pulled in when a listing is imported/refreshed from a source URL. */
  description?: string;
};

const seed = (): ManagedListing[] =>
  seedListings.map((l) => ({
    ...l,
    images: [l.image],
    hidden: false,
    updatedAt: Date.now(),
  }));

/**
 * The showcase homes, by id and by the copy that ships with them.
 *
 * The guided walkthrough used to write all of Eliza Vance's listings into a real
 * realtor's own collection as "editable placeholders". They persisted, synced,
 * and showed up on the client side as that realtor's portfolio — Lakeshore Drive
 * Estate, Coeur d'Alene, $11.9M, none of it theirs.
 */
const DEMO_LISTINGS = new Map(seedListings.map((l) => [l.id, l]));

/**
 * Remove untouched showcase homes from a real realtor's collection.
 *
 * A listing is only dropped when it still matches the showcase on title, price
 * and photo. The moment the realtor edits any of those it is their listing —
 * they repurposed the placeholder — and it stays.
 */
const stripDemoListings = (items: ManagedListing[]): ManagedListing[] =>
  items.filter((l) => {
    const d = DEMO_LISTINGS.get(l.id);
    if (!d) return true;
    const untouched = l.title === d.title && l.price === d.price && l.image === d.image;
    return !untouched;
  });

type SyncStatus = "idle" | "connecting" | "live" | "offline";

type ListingsBlob = { items: ManagedListing[] };

export const [ListingsProvider, useListings] = createContextHook(() => {
  const { realtorId, demoViewMode } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const STORAGE_KEY = `${scope}:listings.v2`;
  const REVISION_KEY = `${scope}:listings.rev.v2`;
  const CHANNEL = `${scope}:listings`;
  const KV_KEY = `${scope}:listings.v2`;

  // Demo listings only seed the showcase/preview realtor. Real realtors start
  // empty and add their own homes (no Eliza Vance listings leak through).
  const isDemoScope = !realtorId || realtorId === DEMO_REALTOR_ID;
  const initialItems = useCallback((): ManagedListing[] => (isDemoScope ? seed() : []), [isDemoScope]);

  const [items, setItems] = useState<ManagedListing[]>(initialItems);
  const itemsRef = useRef<ManagedListing[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [revision, setRevision] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [retryTick, setRetryTick] = useState<number>(0);
  const revRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const retryAttemptRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when realtor changes
  useEffect(() => {
    setItems(initialItems());
    setHydrated(false);
    setRevision(0);
    revRef.current = 0;
  }, [realtorId, initialItems]);

  // Hydrate
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [raw, revRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(REVISION_KEY),
        ]);
        if (mounted && raw) {
          const parsed = JSON.parse(raw) as ManagedListing[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            const clean = isDemoScope ? parsed : stripDemoListings(parsed);
            setItems(clean);
            // Borrowed homes are already on disk and already syncing, so a
            // memory-only fix gets overwritten on the next broadcast. Write the
            // cleaned collection back and bump the revision so it wins.
            if (clean.length !== parsed.length) {
              const rev = Math.max(revRef.current, Date.now());
              revRef.current = rev;
              setRevision(rev);
              void AsyncStorage.multiSet([
                [STORAGE_KEY, JSON.stringify(clean)],
                [REVISION_KEY, String(rev)],
              ]);
            }
          }
        }
        if (mounted && revRaw) {
          const r = Number(revRaw);
          if (!Number.isNaN(r)) {
            revRef.current = r;
            setRevision(r);
          }
        }
      } catch (e) {
        console.log("[listings] hydrate error", e);
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => { mounted = false; };
  }, [STORAGE_KEY, REVISION_KEY, isDemoScope]);

  const persist = useCallback(async (next: ManagedListing[], rev: number) => {
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEY, JSON.stringify(next)],
        [REVISION_KEY, String(rev)],
      ]);
    } catch (e) {
      console.log("[listings] persist error", e);
    }
  }, [STORAGE_KEY, REVISION_KEY]);

  useEffect(() => {
    if (!supabase || !hydrated) return;
    setSyncStatus("connecting");
    const sb = supabase;
    const ch = sb.channel(CHANNEL, {
      config: { private: true, broadcast: { self: false, ack: false } },
    });

    const scheduleReconnect = () => {
      if (retryTimerRef.current) return;
      const attempt = retryAttemptRef.current + 1;
      retryAttemptRef.current = attempt;
      const delay = Math.min(30000, 2000 * Math.pow(2, attempt - 1));
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setRetryTick((t) => t + 1);
      }, delay);
    };

    ch.on("broadcast", { event: "set" }, (payload) => {
      const data = payload.payload as { items: ManagedListing[]; rev: number };
      if (!data?.items) return;
      if (data.rev <= revRef.current) return;
      const incoming = isDemoScope ? data.items : stripDemoListings(data.items);
      if (sameJson(incoming, itemsRef.current)) return;
      revRef.current = data.rev;
      setRevision(data.rev);
      setItems(incoming);
      void persist(incoming, data.rev);
    });

    ch.on("broadcast", { event: "request" }, () => {
      if (revRef.current > 0) {
        ch.send({
          type: "broadcast",
          event: "set",
          payload: { items: getItemsRef(), rev: revRef.current },
        }).catch((e) => console.log("[listings] request-reply send error", e));
      }
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        retryAttemptRef.current = 0;
        setSyncStatus("live");
        ch.send({ type: "broadcast", event: "request", payload: {} }).catch((e) =>
          console.log("[listings] initial request send error", e)
        );
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setSyncStatus("offline");
        scheduleReconnect();
      }
    });

    channelRef.current = ch;
    return () => {
      try { sb.removeChannel(ch); } catch (e) { console.log("[listings] removeChannel", e); }
      channelRef.current = null;
    };
  }, [hydrated, persist, retryTick, CHANNEL, isDemoScope]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };
  }, []);

  const applyRemote = useCallback(
    (row: { value: ListingsBlob; rev: number }, meta?: { initial?: boolean; forced?: boolean }) => {
      if (!row?.value?.items) return;
      const force = meta?.initial || meta?.forced;
      if (!force && row.rev <= revRef.current) return;
      const incoming = isDemoScope ? row.value.items : stripDemoListings(row.value.items);
      if (sameJson(incoming, itemsRef.current)) {
        const rev = Math.max(revRef.current, row.rev);
        if (rev !== revRef.current) {
          revRef.current = rev;
          setRevision(rev);
        }
        return;
      }
      revRef.current = Math.max(revRef.current, row.rev);
      setRevision(revRef.current);
      setItems(incoming);
      void persist(incoming, row.rev);
    },
    [persist, isDemoScope]
  );

  const kvValue = useMemo<ListingsBlob>(() => ({ items }), [items]);
  const { refresh: refreshKv } = useKvSync<ListingsBlob>({
    key: KV_KEY,
    enabled: hydrated && isKvEnabled(),
    value: kvValue,
    rev: revision,
    onRemote: applyRemote,
  });

  const refresh = useCallback(async (): Promise<void> => {
    await refreshKv();
    const ch = channelRef.current;
    if (ch) {
      try { await ch.send({ type: "broadcast", event: "request", payload: {} }); } catch (e) {
        console.log("[listings] refresh request error", e);
      }
    }
  }, [refreshKv]);

  const getItemsRef = useCallback(() => itemsRef.current, []);

  const broadcast = useCallback((next: ManagedListing[], rev: number) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "set", payload: { items: next, rev } }).catch((e) =>
      console.log("[listings] broadcast error", e)
    );
  }, []);

  const update = useCallback(
    (next: ManagedListing[]) => {
      // The Eliza Vance demo is a frozen, read-only showcase — never accept writes.
      if (demoViewMode) return;
      const rev = Math.max(revRef.current, Date.now());
      revRef.current = rev;
      setRevision(rev);
      setItems(next);
      void persist(next, rev);
      broadcast(next, rev);
    },
    [persist, broadcast, demoViewMode]
  );

  const saveListings = useCallback(async (next: ManagedListing[]) => {
    if (demoViewMode) throw new Error("The demo is read-only.");
    const rev = Math.max(revRef.current + 1, Date.now());
    if (supabase) await kvSet(KV_KEY, { items: next }, rev, true);
    await AsyncStorage.multiSet([[STORAGE_KEY, JSON.stringify(next)], [REVISION_KEY, String(rev)]]);
    revRef.current = rev;
    itemsRef.current = next;
    setItems(next);
    setRevision(rev);
    broadcast(next, rev);
  }, [demoViewMode, KV_KEY, STORAGE_KEY, REVISION_KEY, broadcast]);

  const stamp = (l: ManagedListing): ManagedListing => ({ ...l, updatedAt: Date.now() });

  const add = useCallback((l: ManagedListing) => { update([stamp(l), ...items]); }, [items, update]);
  const upsert = useCallback((l: ManagedListing) => {
    const stamped = stamp(l);
    const exists = items.some((x) => x.id === stamped.id);
    const next = exists ? items.map((x) => (x.id === stamped.id ? stamped : x)) : [stamped, ...items];
    update(next);
  }, [items, update]);
  const remove = useCallback((id: string) => { update(items.filter((x) => x.id !== id)); }, [items, update]);
  const toggleHidden = useCallback((id: string) => {
    update(items.map((x) => (x.id === id ? stamp({ ...x, hidden: !x.hidden }) : x)));
  }, [items, update]);
  const move = useCallback((id: string, direction: "up" | "down") => {
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [it] = next.splice(idx, 1);
    next.splice(target, 0, it);
    update(next);
  }, [items, update]);
  const reorder = useCallback((ids: string[]) => {
    const map = new Map(items.map((i) => [i.id, i]));
    const next: ManagedListing[] = [];
    ids.forEach((id) => { const it = map.get(id); if (it) next.push(it); });
    items.forEach((i) => { if (!ids.includes(i.id)) next.push(i); });
    update(next);
  }, [items, update]);
  // Frozen demo data source — a dedicated, immutable copy of the Eliza Vance
  // listings that never reads realtor storage and is never mutated.
  const demoItems = useMemo(() => seed(), []);
  const effectiveItems = demoViewMode ? demoItems : items;
  const getById = useCallback((id: string): ManagedListing | undefined => effectiveItems.find((x) => x.id === id), [effectiveItems]);
  const visible = useMemo(() => effectiveItems.filter((x) => !x.hidden && !x.sourceArchived), [effectiveItems]);
  const reset = useCallback(() => { update(isDemoScope ? seed() : []); }, [update, isDemoScope]);
  /**
   * Guided walkthrough hook. A real realtor's collection starts and stays empty
   * until they add their own homes — handing them another agent's portfolio as
   * "placeholders" is how it ended up published to their clients.
   */
  const seedDemo = useCallback(() => {
    if (!isDemoScope) return;
    update(seed());
  }, [update, isDemoScope]);

  const refreshFromSource = useCallback(
    async (id?: string): Promise<{ ok: boolean; error?: string }> => {
      if (demoViewMode || isDemoScope) return { ok: false, error: "The demo is read-only." };
      try {
        const synced = await invokeListingSync(id ? { listingId: id } : {});
        // A source sync reads details in follow-up jobs; finish them before reporting the result.
        const result = id ? synced : await readRemainingDetails(synced);
        await refreshKv();
        return result.warning ? { ok: false, error: result.warning } : { ok: true };
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "We couldn't check that source. Please retry." }; }
    }, [demoViewMode, isDemoScope, refreshKv]
  );

  return useMemo(() => ({
    all: effectiveItems, visible, hydrated: demoViewMode ? true : hydrated, revision, syncStatus,
    add, upsert, remove, toggleHidden, move, reorder, getById, reset, seedDemo, update, saveListings, refresh, refreshFromSource,
  }), [effectiveItems, visible, demoViewMode, hydrated, revision, syncStatus, add, upsert, remove, toggleHidden, move, reorder, getById, reset, seedDemo, update, saveListings, refresh, refreshFromSource]);
});
