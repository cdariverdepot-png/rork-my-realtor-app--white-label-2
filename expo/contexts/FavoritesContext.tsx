import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type Watchlist = {
  id: string;
  name: string;
  listingIds: string[];
  createdAt: number;
};

const DEFAULT_WATCHLISTS: Watchlist[] = [
  { id: "favorites", name: "Favorites", listingIds: [], createdAt: 0 },
  { id: "dream", name: "Dream Homes", listingIds: [], createdAt: 1 },
  { id: "investment", name: "Investment Properties", listingIds: [], createdAt: 2 },
  { id: "weekend", name: "Weekend Homes", listingIds: [], createdAt: 3 },
];

type SyncStatus = "idle" | "connecting" | "live" | "offline";

export const [FavoritesProvider, useFavorites] = createContextHook(() => {
  const { realtorId } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const STORAGE_KEY = `${scope}:favorites.v1`;
  const REVISION_KEY = `${scope}:favorites.rev.v1`;
  const CHANNEL = `${scope}:favorites`;

  const [lists, setLists] = useState<Watchlist[]>(DEFAULT_WATCHLISTS);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [retryTick, setRetryTick] = useState<number>(0);
  const revRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const listsRef = useRef<Watchlist[]>(DEFAULT_WATCHLISTS);
  const retryAttemptRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { listsRef.current = lists; }, [lists]);
  useEffect(() => { setLists(DEFAULT_WATCHLISTS); revRef.current = 0; setHydrated(false); }, [realtorId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [raw, revRaw] = await Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(REVISION_KEY)]);
        if (mounted && raw) { const parsed = JSON.parse(raw) as Watchlist[]; if (Array.isArray(parsed)) setLists(parsed); }
        if (mounted && revRaw) { const r = Number(revRaw); if (!Number.isNaN(r)) revRef.current = r; }
      } catch (e) { console.log("[favorites] hydrate", e); }
      finally { if (mounted) setHydrated(true); }
    })();
    return () => { mounted = false; };
  }, [STORAGE_KEY, REVISION_KEY]);

  const persist = useCallback(async (next: Watchlist[], rev: number) => {
    try { await AsyncStorage.multiSet([[STORAGE_KEY, JSON.stringify(next)], [REVISION_KEY, String(rev)]]); }
    catch (e) { console.log("[favorites] persist", e); }
  }, [STORAGE_KEY, REVISION_KEY]);

  useEffect(() => {
    if (!supabase || !hydrated) return;
    setSyncStatus("connecting");
    const sb = supabase;
    const ch = sb.channel(CHANNEL, { config: { broadcast: { self: false, ack: false } } });
    const scheduleReconnect = () => {
      if (retryTimerRef.current) return;
      const attempt = retryAttemptRef.current + 1; retryAttemptRef.current = attempt;
      const delay = Math.min(30000, 2000 * Math.pow(2, attempt - 1));
      retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; setRetryTick((t) => t + 1); }, delay);
    };
    ch.on("broadcast", { event: "set" }, (payload) => {
      const data = payload.payload as { lists: Watchlist[]; rev: number };
      if (!data?.lists || data.rev <= revRef.current) return;
      revRef.current = data.rev; setLists(data.lists); void persist(data.lists, data.rev);
    });
    ch.on("broadcast", { event: "request" }, () => {
      if (revRef.current > 0) { ch.send({ type: "broadcast", event: "set", payload: { lists: listsRef.current, rev: revRef.current } }).catch((e) => console.log("[favorites] request-reply send error", e)); }
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") { retryAttemptRef.current = 0; setSyncStatus("live"); ch.send({ type: "broadcast", event: "request", payload: {} }).catch((e) => console.log("[favorites] initial request send error", e)); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") { setSyncStatus("offline"); scheduleReconnect(); }
    });
    channelRef.current = ch;
    return () => { try { sb.removeChannel(ch); } catch (e) { console.log("[favorites] removeChannel", e); } channelRef.current = null; };
  }, [hydrated, persist, retryTick, CHANNEL]);

  useEffect(() => { return () => { if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; } }; }, []);

  const update = useCallback((next: Watchlist[]) => {
    const rev = Math.max(revRef.current, Date.now()); revRef.current = rev; setLists(next); void persist(next, rev);
    if (channelRef.current) { channelRef.current.send({ type: "broadcast", event: "set", payload: { lists: next, rev } }).catch((e) => console.log("[favorites] broadcast", e)); }
  }, [persist]);

  const createList = useCallback((name: string): Watchlist => { const list: Watchlist = { id: `wl_${Date.now()}`, name: name.trim() || "Untitled", listingIds: [], createdAt: Date.now() }; update([...lists, list]); return list; }, [lists, update]);
  const renameList = useCallback((id: string, name: string) => { update(lists.map((l) => (l.id === id ? { ...l, name } : l))); }, [lists, update]);
  const deleteList = useCallback((id: string) => { if (id === "favorites") return; update(lists.filter((l) => l.id !== id)); }, [lists, update]);
  const toggleListing = useCallback((listId: string, listingId: string) => {
    update(lists.map((l) => { if (l.id !== listId) return l; const has = l.listingIds.includes(listingId); return { ...l, listingIds: has ? l.listingIds.filter((id) => id !== listingId) : [listingId, ...l.listingIds] }; }));
  }, [lists, update]);
  const isFavorited = useCallback((listingId: string): boolean => lists.some((l) => l.listingIds.includes(listingId)), [lists]);
  const listsContaining = useCallback((listingId: string): string[] => lists.filter((l) => l.listingIds.includes(listingId)).map((l) => l.id), [lists]);
  const totalFavorites = useMemo(() => { const ids = new Set<string>(); lists.forEach((l) => l.listingIds.forEach((id) => ids.add(id))); return ids.size; }, [lists]);

  return { lists, hydrated, syncStatus, totalFavorites, createList, renameList, deleteList, toggleListing, isFavorited, listsContaining };
});
