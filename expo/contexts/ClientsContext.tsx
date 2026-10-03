import { privateCacheScope } from '@/lib/privateCache';
import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isKvEnabled } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth, DEMO_REALTOR_ID } from "@/contexts/AuthContext";

export type ClientSource =
  | "manual" | "phone" | "google" | "outlook" | "linkedin" | "apple" | "vcard" | "csv";

export type Client = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  tag?: string;
  source?: ClientSource;
  createdAt: number;
};

export type ClientDraft = Omit<Client, "id" | "createdAt"> & {
  id?: string;
  createdAt?: number;
};

export type ImportSummary = { added: number; merged: number; skipped: number };

const normEmail = (s: string | undefined): string => (s ?? "").trim().toLowerCase();
const normPhone = (s: string | undefined): string => (s ?? "").replace(/[^+\d]/g, "");

const SEED: Client[] = [
  { id: "client-halberg", name: "M. & J. Halberg", email: "halberg.family@example.com", phone: "+1 (208) 555-0188", tag: "Buyer · Lakeshore", source: "manual", createdAt: Date.now() - 1000 * 60 * 60 * 24 * 40 },
  { id: "client-daniel", name: "Daniel R.", email: "daniel.r@example.com", phone: "+1 (208) 555-0102", tag: "Buyer · Black Rock", source: "manual", createdAt: Date.now() - 1000 * 60 * 60 * 24 * 18 },
];

/**
 * A realtor's own account, expressed as their first roster record. This is a
 * real contact — their name and email straight off the account — not a test
 * artifact, so a brand-new realtor opens the dashboard with one genuine entry
 * instead of an empty roster. Seeded once, on a scope that has never persisted
 * anything; deleting it sticks.
 */
const selfClient = (name: string, email: string, createdAt: number): Client => ({
  id: "client-self",
  name: name.trim(),
  email: email.trim().toLowerCase(),
  tag: "You",
  source: "manual",
  createdAt,
});

export const [ClientsProvider, useClients] = createContextHook(() => {
  const { realtorId, realtorRecord, isAdmin, currentClientId } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const cacheScope = privateCacheScope(realtorId,currentClientId,isAdmin);
  const STORAGE_KEY = `${cacheScope}:clients.v1`;
  const CHANNEL = `${scope}:clients`;
  const KV_KEY = `${scope}:clients.v1`;

  // Demo roster only seeds the showcase realtor. Real realtors start empty so
  // their roster shows only clients who actually signed up or were imported.
  const isDemoScope = !realtorId || realtorId === DEMO_REALTOR_ID;
  const initialClients = useCallback((): Client[] => (isDemoScope ? SEED : []), [isDemoScope]);

  const [clients, setClients] = useState<Client[]>(initialClients);
  const [rev, setRev] = useState<number>(0);
  const revRef = useRef<number>(0);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  useEffect(() => {
    setClients(initialClients());
    setRev(0);
    revRef.current = 0;
    setHydrated(false);
  }, [realtorId, initialClients]);

  const bumpRev = useCallback(() => {
    const next = Math.max(revRef.current + 1, Date.now());
    revRef.current = next;
    setRev(next);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (mounted && raw) {
          const parsed = JSON.parse(raw) as Client[];
          if (Array.isArray(parsed)) setClients(parsed);
        } else if (mounted && !isDemoScope && realtorRecord) {
          // Nothing has ever been stored for this realtor: seed their own
          // account so the roster (and the go-live checklist) starts with one
          // real entry. Once anything is stored — including an empty list after
          // a delete — this branch never runs again.
          const name = realtorRecord.name.trim();
          const email = realtorRecord.email.trim();
          if (name.length > 0 && email.length > 0) {
            const seeded = [selfClient(name, email, Date.now())];
            setClients(seeded);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
          }
        }
      } catch (e) { console.log("[clients] hydrate", e); }
      finally { if (mounted) setHydrated(true); }
    })();
    return () => { mounted = false; };
  }, [STORAGE_KEY, isDemoScope, realtorRecord]);

  const persist = useCallback(async (next: Client[]) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch (e) { console.log("[clients] persist", e); }
  }, [STORAGE_KEY]);

  useEffect(() => {
    if (!supabase || !hydrated) return;
    const ch = supabase.channel(CHANNEL, { config: { private: true, broadcast: { self: false } } });
    ch.on("broadcast", { event: "upsert" }, (payload) => {
      const c = payload.payload as Client;
      if (!c?.id) return;
      setClients((prev) => {
        const exists = prev.some((p) => p.id === c.id);
        const next = exists ? prev.map((p) => (p.id === c.id ? c : p)) : [c, ...prev];
        void persist(next);
        return next;
      });
    });
    ch.on("broadcast", { event: "delete" }, (payload) => {
      const id = (payload.payload as { id: string }).id;
      setClients((prev) => {
        const next = prev.filter((p) => p.id !== id);
        void persist(next);
        return next;
      });
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [hydrated, persist, CHANNEL]);

  const upsert = useCallback((c: Client) => {
    setClients((prev) => {
      const exists = prev.some((p) => p.id === c.id);
      const next = exists ? prev.map((p) => (p.id === c.id ? c : p)) : [c, ...prev];
      void persist(next);
      return next;
    });
    channelRef.current?.send({ type: "broadcast", event: "upsert", payload: c });
    bumpRev();
  }, [persist, bumpRev]);

  const remove = useCallback((id: string) => {
    setClients((prev) => {
      const next = prev.filter((p) => p.id !== id);
      void persist(next);
      return next;
    });
    channelRef.current?.send({ type: "broadcast", event: "delete", payload: { id } });
    bumpRev();
  }, [persist, bumpRev]);

  const importMany = useCallback((drafts: ClientDraft[], source: ClientSource): ImportSummary => {
    let added = 0; let merged = 0; let skipped = 0;
    setClients((prev) => {
      const next = [...prev];
      const byEmail = new Map<string, number>();
      const byPhone = new Map<string, number>();
      next.forEach((c, i) => {
        const e = normEmail(c.email); const p = normPhone(c.phone);
        if (e) byEmail.set(e, i);
        if (p) byPhone.set(p, i);
      });
      for (const d of drafts) {
        const name = (d.name ?? "").trim();
        const email = normEmail(d.email);
        const phone = normPhone(d.phone);
        if (!name || (!email && !phone)) { skipped += 1; continue; }
        const idx = (email && byEmail.get(email)) ?? (phone && byPhone.get(phone)) ?? -1;
        if (typeof idx === "number" && idx >= 0) {
          const cur = next[idx];
          const updated: Client = { ...cur, name: cur.name || name, email: cur.email || email, phone: cur.phone || (d.phone ? d.phone.trim() : cur.phone), tag: cur.tag || d.tag, source: cur.source ?? source };
          const changed = updated.name !== cur.name || updated.email !== cur.email || updated.phone !== cur.phone || updated.tag !== cur.tag || updated.source !== cur.source;
          next[idx] = updated;
          if (changed) merged += 1; else skipped += 1;
          channelRef.current?.send({ type: "broadcast", event: "upsert", payload: updated });
          continue;
        }
        const id = d.id ?? `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const fresh: Client = { id, name, email, phone: d.phone ? d.phone.trim() : undefined, tag: d.tag, source, createdAt: d.createdAt ?? Date.now() };
        next.unshift(fresh);
        if (email) byEmail.set(email, 0);
        if (phone) byPhone.set(phone, 0);
        for (let i = 1; i < next.length; i += 1) {
          const c = next[i]; const e = normEmail(c.email); const p = normPhone(c.phone);
          if (e) byEmail.set(e, i);
          if (p) byPhone.set(p, i);
        }
        added += 1;
        channelRef.current?.send({ type: "broadcast", event: "upsert", payload: fresh });
      }
      void persist(next);
      return next;
    });
    bumpRev();
    return { added, merged, skipped };
  }, [persist, bumpRev]);

  const applyRemote = useCallback(
    (row: { value: Client[]; rev: number }, meta?: { initial?: boolean; forced?: boolean }) => {
      if (!Array.isArray(row?.value)) return;
      const force = meta?.initial || meta?.forced;
      if (!force && row.rev <= revRef.current) return;
      revRef.current = Math.max(revRef.current, row.rev);
      setRev(revRef.current);
      setClients(row.value);
      void persist(row.value);
    }, [persist]);
  const { refresh } = useKvSync<Client[]>({
    key: KV_KEY, enabled: hydrated && isKvEnabled(), value: clients, rev, onRemote: applyRemote,
  });

  return { clients, hydrated, upsert, remove, importMany, refresh };
});
