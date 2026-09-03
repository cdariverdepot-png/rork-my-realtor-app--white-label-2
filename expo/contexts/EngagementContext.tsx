import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppointments } from "@/contexts/AppointmentsContext";
import { useDocuments } from "@/contexts/DocumentsContext";
import { useClientFeed } from "@/contexts/ClientFeedContext";
import { useClients } from "@/contexts/ClientsContext";
import { useMessages } from "@/contexts/MessagesContext";

export type ListingView = { listingId: string; ts: number };
export type EngagementBucket = "hot" | "warm" | "cooling" | "cold";
export type ClientEngagement = { clientId: string; score: number; bucket: EngagementBucket; lastTouchedAt: number; recent: { showings: number; docs: number; pins: number; notes: number } };
export type ListingViewCount = { listingId: string; views: number };

const DAY = 1000 * 60 * 60 * 24;
const WEEK = 7 * DAY;
const MAX_EVENTS = 500;

export const [EngagementProvider, useEngagement] = createContextHook(() => {
  const { realtorId } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const STORAGE_KEY = `${scope}:engagement.views.v1`;

  const [views, setViews] = useState<ListingView[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { items: appts } = useAppointments();
  const { items: docs, transactions } = useDocuments();
  const { feeds } = useClientFeed();
  const { clients } = useClients();
  const { summaries } = useMessages();

  useEffect(() => { setViews([]); setHydrated(false); }, [realtorId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try { const raw = await AsyncStorage.getItem(STORAGE_KEY); if (mounted && raw) { const parsed = JSON.parse(raw) as ListingView[]; if (Array.isArray(parsed)) setViews(parsed); } }
      catch (e) { console.log("[engagement] hydrate", e); }
      finally { if (mounted) setHydrated(true); }
    })();
    return () => { mounted = false; };
  }, [STORAGE_KEY]);

  const persist = useCallback((next: ListingView[]) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => { AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((e) => console.log("[engagement] persist", e)); }, 250);
  }, [STORAGE_KEY]);

  const recordView = useCallback((listingId: string) => {
    if (!listingId) return;
    setViews((prev) => { const last = prev[prev.length - 1]; if (last && last.listingId === listingId && Date.now() - last.ts < 5000) return prev; const next = [...prev, { listingId, ts: Date.now() }].slice(-MAX_EVENTS); persist(next); return next; });
  }, [persist]);

  const viewsThisWeek = useMemo<ListingViewCount[]>(() => {
    const cutoff = Date.now() - WEEK; const tally = new Map<string, number>();
    for (const v of views) { if (v.ts < cutoff) continue; tally.set(v.listingId, (tally.get(v.listingId) ?? 0) + 1); }
    return Array.from(tally.entries()).map(([listingId, count]) => ({ listingId, views: count })).sort((a, b) => b.views - a.views);
  }, [views]);

  const newLeadsThisWeek = useMemo(() => { const cutoff = Date.now() - WEEK; return clients.filter((c) => c.createdAt >= cutoff); }, [clients]);
  const awaitingSignature = useMemo(() => docs.filter((d) => d.kind === "portal" && d.status === "awaiting-signature"), [docs]);
  const upcomingShowings = useMemo(() => { const now = Date.now(); const horizon = now + WEEK; return appts.filter((a) => a.startsAt >= now && a.startsAt <= horizon && (a.status === "confirmed" || a.status === "requested")).sort((a, b) => a.startsAt - b.startsAt); }, [appts]);

  const engagement = useMemo<ClientEngagement[]>(() => {
    const now = Date.now();
    const within = (ts: number, days: number): boolean => now - ts <= days * DAY;
    const txClientMap = new Map<string, string[]>();
    for (const t of transactions) { txClientMap.set(t.id, t.clientIds ?? []); }
    const docRecipientsFor = (cid: string) => docs.filter((d) => { const direct = (d.recipientIds ?? []).includes(cid); if (direct) return true; if (d.transactionId) return (txClientMap.get(d.transactionId) ?? []).includes(cid); return false; });
    return clients.map((c) => {
      const cid = c.id; const feed = feeds[cid]; let score = 0; let lastTouchedAt = 0;
      const lastChat = summaries[cid]?.lastAt ?? 0;
      const chatBoost = lastChat && within(lastChat, 7) ? 6 : lastChat && within(lastChat, 21) ? 2 : 0;
      const recent = { showings: 0, docs: 0, pins: 0, notes: 0 };
      for (const a of appts) { if (!(a.recipientIds ?? []).includes(cid)) continue; lastTouchedAt = Math.max(lastTouchedAt, a.startsAt, a.updatedAt); if (within(a.startsAt, 7) || within(a.updatedAt, 7)) { recent.showings += 1; score += a.status === "confirmed" ? 18 : 12; } else if (within(a.updatedAt, 21)) { score += 6; } }
      for (const d of docRecipientsFor(cid)) { const ts = d.signedAt ?? d.viewedAt ?? d.sentAt ?? d.uploadedAt; lastTouchedAt = Math.max(lastTouchedAt, ts); const weight = d.status === "signed" ? 16 : d.status === "viewed" ? 10 : 6; if (within(ts, 7)) { recent.docs += 1; score += weight; } else if (within(ts, 21)) { score += Math.round(weight * 0.4); } }
      if (feed) { recent.pins = (within(feed.updatedAt, 7) ? feed.pinnedListingIds.length + feed.pinnedDocumentIds.length : 0); if (within(feed.updatedAt, 7)) score += Math.min(12, recent.pins * 3); else if (within(feed.updatedAt, 21)) score += 3; for (const n of feed.notes) { lastTouchedAt = Math.max(lastTouchedAt, n.createdAt); if (within(n.createdAt, 7)) { recent.notes += 1; score += 4; } } if (feed.savedSearches.some((s) => s.alertNew || s.alertPriceDrop)) score += 4; lastTouchedAt = Math.max(lastTouchedAt, feed.updatedAt); }
      const ageDays = Math.max(0, (now - c.createdAt) / DAY); if (ageDays < 7 && score === 0) score += 8;
      score += chatBoost; score = Math.max(0, Math.min(100, Math.round(score)));
      const bucket: EngagementBucket = score >= 60 ? "hot" : score >= 30 ? "warm" : score >= 10 ? "cooling" : "cold";
      return { clientId: cid, score, bucket, lastTouchedAt: Math.max(lastTouchedAt, c.createdAt, lastChat), recent };
    });
  }, [clients, appts, docs, transactions, feeds, summaries]);

  const sortedEngagement = useMemo(() => [...engagement].sort((a, b) => b.score - a.score), [engagement]);
  const digestCounts = useMemo(() => ({ newLeads: newLeadsThisWeek.length, mostViewed: viewsThisWeek.length, awaitingSignature: awaitingSignature.length, upcomingShowings: upcomingShowings.length }), [newLeadsThisWeek, viewsThisWeek, awaitingSignature, upcomingShowings]);

  return { hydrated, recordView, viewsThisWeek, newLeadsThisWeek, awaitingSignature, upcomingShowings, engagement: sortedEngagement, digestCounts };
});
