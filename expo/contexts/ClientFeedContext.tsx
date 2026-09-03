import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isKvEnabled } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth } from "@/contexts/AuthContext";
import { useListings, type ManagedListing } from "@/contexts/ListingsContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useClients } from "@/contexts/ClientsContext";

export type PinnedNote = { id: string; text: string; createdAt: number };

export type SavedSearch = {
  id: string; label: string;
  neighborhood?: string; tag?: ManagedListing["tag"];
  maxPrice?: number; minBeds?: number;
  alertNew: boolean; alertPriceDrop: boolean; createdAt: number;
};

export type ClientFeed = {
  clientId: string; pinnedListingIds: string[]; pinnedDocumentIds: string[];
  notes: PinnedNote[]; savedSearches: SavedSearch[]; updatedAt: number;
};

export function parsePrice(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[\s,$]/g, "").toUpperCase();
  const m = cleaned.match(/^([\d.]+)(M|K)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  if (m[2] === "M") return n * 1_000_000;
  if (m[2] === "K") return n * 1_000;
  return n;
}

function emptyFeed(clientId: string): ClientFeed {
  return { clientId, pinnedListingIds: [], pinnedDocumentIds: [], notes: [], savedSearches: [], updatedAt: Date.now() };
}

function matches(l: ManagedListing, s: SavedSearch): boolean {
  if (l.hidden) return false;
  if (s.neighborhood && !l.neighborhood.toLowerCase().includes(s.neighborhood.toLowerCase())) return false;
  if (s.tag && l.tag !== s.tag) return false;
  if (s.minBeds && l.beds < s.minBeds) return false;
  if (s.maxPrice) { const p = parsePrice(l.price); if (p == null || p > s.maxPrice) return false; }
  return true;
}

export const [ClientFeedProvider, useClientFeed] = createContextHook(() => {
  const { realtorId } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const STORAGE_KEY = `${scope}:clientFeed.v1`;
  const PRICE_KEY = `${scope}:clientFeed.priceSnap.v1`;
  const SEEN_KEY = `${scope}:clientFeed.seenListings.v1`;
  const CHANNEL = `${scope}:clientFeed`;
  const KV_KEY = `${scope}:clientFeed.v1`;

  const { all } = useListings();
  const { broadcastFromRealtor } = useNotifications();
  const { clients } = useClients();

  const [feeds, setFeeds] = useState<Record<string, ClientFeed>>({});
  const [rev, setRev] = useState<number>(0);
  const revRef = useRef<number>(0);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const priceSnapRef = useRef<Record<string, number>>({});
  const seenIdsRef = useRef<Set<string>>(new Set());
  const snapshotsLoaded = useRef<boolean>(false);

  useEffect(() => { setFeeds({}); setRev(0); revRef.current = 0; setHydrated(false); snapshotsLoaded.current = false; }, [realtorId]);

  const bumpRev = useCallback(() => { const next = Math.max(revRef.current + 1, Date.now()); revRef.current = next; setRev(next); return next; }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [raw, priceRaw, seenRaw] = await Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(PRICE_KEY), AsyncStorage.getItem(SEEN_KEY)]);
        if (mounted && raw) { const parsed = JSON.parse(raw) as Record<string, ClientFeed>; if (parsed && typeof parsed === "object") setFeeds(parsed); }
        if (priceRaw) { priceSnapRef.current = JSON.parse(priceRaw) as Record<string, number>; }
        if (seenRaw) { seenIdsRef.current = new Set(JSON.parse(seenRaw) as string[]); }
      } catch (e) { console.log("[clientFeed] hydrate", e); }
      finally { snapshotsLoaded.current = true; if (mounted) setHydrated(true); }
    })();
    return () => { mounted = false; };
  }, [STORAGE_KEY, PRICE_KEY, SEEN_KEY]);

  const persist = useCallback(async (next: Record<string, ClientFeed>) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { console.log("[clientFeed] persist", e); }
  }, [STORAGE_KEY]);

  useEffect(() => {
    if (!supabase || !hydrated) return;
    const ch = supabase.channel(CHANNEL, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "set" }, (payload) => {
      const f = payload.payload as ClientFeed; if (!f?.clientId) return;
      setFeeds((prev) => { const cur = prev[f.clientId]; if (cur && cur.updatedAt >= f.updatedAt) return prev; const next = { ...prev, [f.clientId]: f }; void persist(next); return next; });
    });
    ch.subscribe(); channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [hydrated, persist, CHANNEL]);

  const writeFeed = useCallback((clientId: string, mut: (cur: ClientFeed) => ClientFeed) => {
    setFeeds((prev) => { const cur = prev[clientId] ?? emptyFeed(clientId); const next = { ...mut(cur), updatedAt: Date.now() }; const out = { ...prev, [clientId]: next }; void persist(out); channelRef.current?.send({ type: "broadcast", event: "set", payload: next }); return out; });
    bumpRev();
  }, [persist, bumpRev]);

  const togglePinListing = useCallback((clientId: string, listingId: string) => {
    writeFeed(clientId, (f) => ({ ...f, pinnedListingIds: f.pinnedListingIds.includes(listingId) ? f.pinnedListingIds.filter((id) => id !== listingId) : [listingId, ...f.pinnedListingIds] }));
  }, [writeFeed]);
  const togglePinDoc = useCallback((clientId: string, docId: string) => {
    writeFeed(clientId, (f) => ({ ...f, pinnedDocumentIds: f.pinnedDocumentIds.includes(docId) ? f.pinnedDocumentIds.filter((id) => id !== docId) : [docId, ...f.pinnedDocumentIds] }));
  }, [writeFeed]);
  const addNote = useCallback((clientId: string, text: string) => {
    const trimmed = text.trim(); if (!trimmed) return;
    const note: PinnedNote = { id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text: trimmed, createdAt: Date.now() };
    writeFeed(clientId, (f) => ({ ...f, notes: [note, ...f.notes] }));
  }, [writeFeed]);
  const removeNote = useCallback((clientId: string, noteId: string) => { writeFeed(clientId, (f) => ({ ...f, notes: f.notes.filter((n) => n.id !== noteId) })); }, [writeFeed]);
  const upsertSearch = useCallback((clientId: string, search: SavedSearch) => {
    writeFeed(clientId, (f) => { const exists = f.savedSearches.some((s) => s.id === search.id); return { ...f, savedSearches: exists ? f.savedSearches.map((s) => (s.id === search.id ? search : s)) : [search, ...f.savedSearches] }; });
  }, [writeFeed]);
  const removeSearch = useCallback((clientId: string, searchId: string) => { writeFeed(clientId, (f) => ({ ...f, savedSearches: f.savedSearches.filter((s) => s.id !== searchId) })); }, [writeFeed]);

  useEffect(() => {
    if (!hydrated || !snapshotsLoaded.current) return;
    if (all.length === 0) return;
    const prevPrice = priceSnapRef.current;
    const seen = seenIdsRef.current;
    const nextPrice: Record<string, number> = {};
    const newIds: string[] = [];
    const drops: { id: string; oldPrice: number; newPrice: number }[] = [];
    for (const l of all) { const p = parsePrice(l.price); if (p != null) nextPrice[l.id] = p; const wasSeen = seen.has(l.id); if (!wasSeen && !l.hidden) newIds.push(l.id); if (p != null && prevPrice[l.id] != null && p < prevPrice[l.id]) { drops.push({ id: l.id, oldPrice: prevPrice[l.id], newPrice: p }); } }
    if (seen.size === 0 && Object.keys(prevPrice).length === 0) { seenIdsRef.current = new Set(all.map((l) => l.id)); priceSnapRef.current = nextPrice; void AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seenIdsRef.current])); void AsyncStorage.setItem(PRICE_KEY, JSON.stringify(nextPrice)); return; }
    if (newIds.length === 0 && drops.length === 0) { priceSnapRef.current = nextPrice; void AsyncStorage.setItem(PRICE_KEY, JSON.stringify(nextPrice)); return; }
    const fired = new Set<string>();
    Object.values(feeds).forEach((feed) => { feed.savedSearches.forEach((s) => { if (s.alertNew) { newIds.forEach((nid) => { const l = all.find((x) => x.id === nid); if (!l || !matches(l, s)) return; const key = `${feed.clientId}:new:${nid}`; if (fired.has(key)) return; fired.add(key); broadcastFromRealtor({ kind: "new", title: `New match · ${s.label}`, body: `${l.title} · ${l.neighborhood} · ${l.price}`, listingId: l.id, recipientIds: [feed.clientId] }); }); } if (s.alertPriceDrop) { drops.forEach((d) => { const l = all.find((x) => x.id === d.id); if (!l || !matches(l, s)) return; const key = `${feed.clientId}:drop:${d.id}:${d.newPrice}`; if (fired.has(key)) return; fired.add(key); broadcastFromRealtor({ kind: "price", title: `Price drop · ${l.title}`, body: `Now ${l.price} in ${l.neighborhood}.`, listingId: l.id, recipientIds: [feed.clientId] }); }); } }); });
    seenIdsRef.current = new Set(all.map((l) => l.id)); priceSnapRef.current = nextPrice;
    void AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seenIdsRef.current])); void AsyncStorage.setItem(PRICE_KEY, JSON.stringify(nextPrice));
  }, [all, feeds, hydrated, broadcastFromRealtor, SEEN_KEY, PRICE_KEY]);

  const applyRemote = useCallback((row: { value: Record<string, ClientFeed>; rev: number }, meta?: { initial?: boolean; forced?: boolean }) => {
    if (!row?.value) return; const force = meta?.initial || meta?.forced;
    if (!force && row.rev <= revRef.current) return;
    revRef.current = Math.max(revRef.current, row.rev); setRev(revRef.current); setFeeds(row.value); void persist(row.value);
  }, [persist]);
  const { refresh } = useKvSync<Record<string, ClientFeed>>({ key: KV_KEY, enabled: hydrated && isKvEnabled(), value: feeds, rev, onRemote: applyRemote });

  const getFeed = useCallback((clientId: string): ClientFeed => feeds[clientId] ?? emptyFeed(clientId), [feeds]);
  const curatedClientCount = useMemo(() => Object.values(feeds).filter((f) => f.pinnedListingIds.length > 0 || f.pinnedDocumentIds.length > 0 || f.notes.length > 0 || f.savedSearches.length > 0).length, [feeds]);
  const uncuratedClients = useMemo(() => clients.filter((c) => !feeds[c.id]), [clients, feeds]);

  return { feeds, hydrated, curatedClientCount, uncuratedClients, getFeed, refresh, togglePinListing, togglePinDoc, addNote, removeNote, upsertSearch, removeSearch };
});
