import { privateCacheScope } from '@/lib/privateCache';
import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isKvEnabled } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth } from "@/contexts/AuthContext";
import { scheduleRemindersFor, cancelRemindersFor } from "@/lib/reminders";

export type ApptStatus = "requested" | "confirmed" | "declined" | "rescheduled";
export type ApptSource = "manual" | "imported";

export type Appointment = {
  id: string; listingId?: string; listingTitle?: string;
  startsAt: number; durationMin: number; status: ApptStatus;
  createdBy: "client" | "realtor"; recipientIds?: string[]; note?: string;
  source?: ApptSource; feedId?: string; externalId?: string; location?: string;
  updatedAt: number;
};

export const [AppointmentsProvider, useAppointments] = createContextHook(() => {
  const { realtorId, isAdmin, currentClientId } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const cacheScope = privateCacheScope(realtorId,currentClientId,isAdmin);
  const STORAGE_KEY = `${cacheScope}:appointments.v1`;
  const CHANNEL = `${scope}:appointments`;
  const KV_KEY = `${scope}:appointments.v1`;

  const [items, setItems] = useState<Appointment[]>([]);
  const [rev, setRev] = useState<number>(0);
  const revRef = useRef<number>(0);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  useEffect(() => { setItems([]); setRev(0); revRef.current = 0; setHydrated(false); }, [cacheScope]);

  const bumpRev = useCallback(() => { const n = Math.max(revRef.current + 1, Date.now()); revRef.current = n; setRev(n); }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (mounted && raw) { const parsed = JSON.parse(raw) as Appointment[]; if (Array.isArray(parsed)) setItems(parsed); }
      } catch (e) { console.log("[appts] hydrate", e); }
      finally { if (mounted) setHydrated(true); }
    })();
    return () => { mounted = false; };
  }, [STORAGE_KEY]);

  const persist = useCallback(async (next: Appointment[]) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { console.log("[appts] persist", e); }
  }, [STORAGE_KEY]);

  useEffect(() => {
    if (!supabase || !hydrated) return;
    const ch = supabase.channel(CHANNEL, { config: { private: true, broadcast: { self: false } } });
    ch.on("broadcast", { event: "upsert" }, (payload) => {
      const a = payload.payload as Appointment; if (!a?.id) return;
      setItems((prev) => {
        const exists = prev.some((p) => p.id === a.id);
        if (exists && prev.find((p) => p.id === a.id)!.updatedAt >= a.updatedAt) return prev;
        const next = exists ? prev.map((p) => (p.id === a.id ? a : p)) : [a, ...prev];
        void persist(next); return next;
      });
    });
    ch.on("broadcast", { event: "delete" }, (payload) => {
      const id = (payload.payload as { id: string }).id;
      setItems((prev) => { const next = prev.filter((p) => p.id !== id); void persist(next); return next; });
    });
    ch.subscribe(); channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [hydrated, persist, CHANNEL]);

  const upsert = useCallback((a: Appointment) => {
    const stamped: Appointment = { ...a, updatedAt: Date.now() };
    setItems((prev) => {
      const exists = prev.some((p) => p.id === stamped.id);
      const next = exists ? prev.map((p) => (p.id === stamped.id ? stamped : p)) : [stamped, ...prev];
      void persist(next); return next;
    });
    channelRef.current?.send({ type: "broadcast", event: "upsert", payload: stamped }); bumpRev();
    if (stamped.status === "confirmed" && stamped.startsAt > Date.now()) {
      void scheduleRemindersFor({ apptId: stamped.id, title: stamped.listingTitle ?? "Private viewing", startsAt: stamped.startsAt, body: stamped.note });
    } else { void cancelRemindersFor(stamped.id); }
  }, [persist, bumpRev]);

  const remove = useCallback((id: string) => {
    setItems((prev) => { const next = prev.filter((p) => p.id !== id); void persist(next); return next; });
    channelRef.current?.send({ type: "broadcast", event: "delete", payload: { id } });
    void cancelRemindersFor(id); bumpRev();
  }, [persist, bumpRev]);

  const replaceFromFeed = useCallback((feedId: string, next: Appointment[]) => {
    setItems((prev) => {
      const kept = prev.filter((p) => p.feedId !== feedId);
      const byUid = new Map<string, Appointment>();
      prev.forEach((p) => { if (p.feedId === feedId && p.externalId) byUid.set(p.externalId, p); });
      const merged: Appointment[] = next.map((n) => {
        const old = n.externalId ? byUid.get(n.externalId) : undefined;
        if (!old) return { ...n, updatedAt: Date.now() };
        return { ...n, id: old.id, note: old.note ?? n.note, recipientIds: old.recipientIds ?? n.recipientIds, status: old.status, updatedAt: Date.now() };
      });
      const combined = [...merged, ...kept]; void persist(combined);
      merged.forEach((m) => { channelRef.current?.send({ type: "broadcast", event: "upsert", payload: m }); });
      return combined;
    }); bumpRev();
  }, [persist, bumpRev]);

  const removeByFeed = useCallback((feedId: string) => {
    setItems((prev) => {
      const removed = prev.filter((p) => p.feedId === feedId);
      const next = prev.filter((p) => p.feedId !== feedId); void persist(next);
      removed.forEach((r) => { channelRef.current?.send({ type: "broadcast", event: "delete", payload: { id: r.id } }); });
      return next;
    }); bumpRev();
  }, [persist, bumpRev]);

  const applyRemote = useCallback((row: { value: Appointment[]; rev: number }, meta?: { initial?: boolean; forced?: boolean }) => {
    if (!Array.isArray(row?.value)) return;
    const force = meta?.initial || meta?.forced;
    if (!force && row.rev <= revRef.current) return;
    revRef.current = Math.max(revRef.current, row.rev); setRev(revRef.current); setItems(row.value); void persist(row.value);
  }, [persist]);
  const { refresh } = useKvSync<Appointment[]>({ key: KV_KEY, enabled: hydrated && isKvEnabled(), value: items, rev, onRemote: applyRemote });

  return { items, hydrated, upsert, remove, replaceFromFeed, removeByFeed, refresh };
});
