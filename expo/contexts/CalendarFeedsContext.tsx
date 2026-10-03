import { privateCacheScope } from '@/lib/privateCache';
import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { parseICS, normalizeFeedUrl, type ParsedEvent } from "@/lib/parseCalendar";
import { useAppointments, type Appointment } from "@/contexts/AppointmentsContext";

export type CalendarSource = "google" | "apple" | "outlook" | "ics";
export type CalendarFeed = { id: string; source: CalendarSource; name: string; url?: string; fromFile?: boolean; autoRefreshMin: number; excluded: Record<string, true>; lastSyncedAt?: number; lastError?: string; lastEventCount?: number; enabled: boolean; createdAt: number };
export type FeedSyncResult = { events: ParsedEvent[]; added: number; updated: number; removed: number };

const defaultName = (source: CalendarSource): string => {
  switch (source) { case "google": return "Google Calendar"; case "apple": return "Apple / iCloud Calendar"; case "outlook": return "Outlook Calendar"; default: return "Calendar"; }
};

function toAppointments(feed: CalendarFeed, events: ParsedEvent[]): Appointment[] {
  const excluded = feed.excluded ?? {};
  return events.filter((e) => !excluded[e.uid]).map((e) => ({ id: `imp_${feed.id}_${e.uid}`, listingTitle: e.recurring ? `${e.title} (repeats)` : e.title, startsAt: e.startsAt, durationMin: e.durationMin, status: "confirmed", createdBy: "realtor", note: e.notes, location: e.location, source: "imported", feedId: feed.id, externalId: e.uid, updatedAt: Date.now() }));
}

export const [CalendarFeedsProvider, useCalendarFeeds] = createContextHook(() => {
  const { realtorId, isAdmin, currentClientId } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const cacheScope = privateCacheScope(realtorId,currentClientId,isAdmin);
  const STORAGE_KEY = `${cacheScope}:calendar.feeds.v1`;

  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { replaceFromFeed, removeByFeed } = useAppointments();
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => { setFeeds([]); setHydrated(false); }, [cacheScope]);

  useEffect(() => {
    let mounted = true;
    (async () => { try { const raw = await AsyncStorage.getItem(STORAGE_KEY); if (mounted && raw) { const parsed = JSON.parse(raw) as CalendarFeed[]; if (Array.isArray(parsed)) setFeeds(parsed); } } catch (e) { console.log("[feeds] hydrate", e); } finally { if (mounted) setHydrated(true); } })();
    return () => { mounted = false; };
  }, [STORAGE_KEY]);

  const persist = useCallback(async (next: CalendarFeed[]) => { try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { console.log("[feeds] persist", e); } }, [STORAGE_KEY]);

  const fetchEvents = useCallback(async (url: string): Promise<ParsedEvent[]> => {
    const u = normalizeFeedUrl(url); if (!u) throw new Error("Empty URL");
    const res = await fetch(u, { headers: { Accept: "text/calendar, text/plain, */*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.toUpperCase().includes("BEGIN:VCALENDAR")) throw new Error("Not a calendar feed");
    return parseICS(text);
  }, []);

  const syncFeed = useCallback(async (feedId: string): Promise<FeedSyncResult | null> => {
    const feed = feeds.find((f) => f.id === feedId);
    if (!feed || !feed.url || inFlight.current.has(feedId)) return null;
    inFlight.current.add(feedId); setBusyId(feedId);
    try {
      const events = await fetchEvents(feed.url);
      const next: CalendarFeed = { ...feed, lastSyncedAt: Date.now(), lastError: undefined, lastEventCount: events.length };
      setFeeds((prev) => { const out = prev.map((f) => (f.id === feedId ? next : f)); void persist(out); return out; });
      if (next.enabled) replaceFromFeed(feedId, toAppointments(next, events));
      else removeByFeed(feedId);
      return { events, added: events.length, updated: 0, removed: 0 };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed";
      setFeeds((prev) => { const out = prev.map((f) => f.id === feedId ? { ...f, lastError: msg, lastSyncedAt: Date.now() } : f); void persist(out); return out; });
      return null;
    } finally { inFlight.current.delete(feedId); setBusyId((cur) => (cur === feedId ? null : cur)); }
  }, [feeds, fetchEvents, persist, replaceFromFeed, removeByFeed]);

  const addUrlFeed = useCallback(async (params: { source: CalendarSource; url: string; name?: string; autoRefreshMin?: number }): Promise<{ feed: CalendarFeed; events: ParsedEvent[] } | { error: string }> => {
    const url = normalizeFeedUrl(params.url); if (!url) return { error: "Paste a calendar link to continue." };
    try {
      const events = await fetchEvents(url);
      const feed: CalendarFeed = { id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, source: params.source, name: (params.name ?? defaultName(params.source)).trim(), url, autoRefreshMin: params.autoRefreshMin ?? 60, excluded: {}, enabled: true, lastSyncedAt: Date.now(), lastEventCount: events.length, createdAt: Date.now() };
      setFeeds((prev) => { const out = [feed, ...prev]; void persist(out); return out; });
      replaceFromFeed(feed.id, toAppointments(feed, events));
      return { feed, events };
    } catch (e) { const msg = e instanceof Error ? e.message : "Couldn't reach that link."; return { error: msg }; }
  }, [fetchEvents, persist, replaceFromFeed]);

  const addFileFeed = useCallback((params: { source: CalendarSource; name?: string; events: ParsedEvent[] }): CalendarFeed => {
    const feed: CalendarFeed = { id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, source: params.source, name: (params.name ?? `${defaultName(params.source)} (file)`).trim(), fromFile: true, autoRefreshMin: 0, excluded: {}, enabled: true, lastSyncedAt: Date.now(), lastEventCount: params.events.length, createdAt: Date.now() };
    setFeeds((prev) => { const out = [feed, ...prev]; void persist(out); return out; });
    replaceFromFeed(feed.id, toAppointments(feed, params.events));
    return feed;
  }, [persist, replaceFromFeed]);

  const setFeedExclusions = useCallback((feedId: string, excluded: Record<string, true>, events: ParsedEvent[]) => {
    setFeeds((prev) => { const out = prev.map((f) => f.id === feedId ? { ...f, excluded } : f); void persist(out); const updated = out.find((f) => f.id === feedId); if (updated) replaceFromFeed(feedId, toAppointments(updated, events)); return out; });
  }, [persist, replaceFromFeed]);

  const setFeedEnabled = useCallback((feedId: string, enabled: boolean) => {
    setFeeds((prev) => { const out = prev.map((f) => (f.id === feedId ? { ...f, enabled } : f)); void persist(out); return out; });
    if (!enabled) removeByFeed(feedId); else void syncFeed(feedId);
  }, [persist, removeByFeed, syncFeed]);

  const setAutoRefresh = useCallback((feedId: string, minutes: number) => { setFeeds((prev) => { const out = prev.map((f) => f.id === feedId ? { ...f, autoRefreshMin: minutes } : f); void persist(out); return out; }); }, [persist]);
  const renameFeed = useCallback((feedId: string, name: string) => { const trimmed = name.trim(); if (!trimmed) return; setFeeds((prev) => { const out = prev.map((f) => (f.id === feedId ? { ...f, name: trimmed } : f)); void persist(out); return out; }); }, [persist]);
  const removeFeed = useCallback((feedId: string) => { setFeeds((prev) => { const out = prev.filter((f) => f.id !== feedId); void persist(out); return out; }); removeByFeed(feedId); }, [persist, removeByFeed]);

  useEffect(() => {
    if (!hydrated) return;
    if (Platform.OS === "web") {}
    const interval = setInterval(() => {
      const now = Date.now();
      feeds.forEach((f) => { if (!f.enabled || !f.url || f.autoRefreshMin <= 0) return; const dueAt = (f.lastSyncedAt ?? 0) + f.autoRefreshMin * 60 * 1000; if (now >= dueAt) void syncFeed(f.id); });
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [hydrated, feeds, syncFeed]);

  return { feeds, hydrated, busyId, addUrlFeed, addFileFeed, setFeedExclusions, setFeedEnabled, setAutoRefresh, renameFeed, removeFeed, syncFeed };
});
