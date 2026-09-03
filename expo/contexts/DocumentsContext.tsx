import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isKvEnabled } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth } from "@/contexts/AuthContext";

export type DocCategory = "Contract" | "Disclosure" | "Inspection" | "Other";
export type DocPortal = "docusign" | "dotloop" | "skyslope" | "authentisign" | "adobesign" | "hellosign" | "other";
export type DocKind = "portal" | "file";
export type DocStage = "Pre-Listing" | "Offer" | "Disclosures" | "Closing";
export const STAGES: DocStage[] = ["Pre-Listing", "Offer", "Disclosures", "Closing"];
export type DocStatus = "awaiting-signature" | "viewed" | "signed" | "shared";

export type DocItem = {
  id: string; name: string; category: DocCategory; kind: DocKind;
  uri: string; portal?: DocPortal; status?: DocStatus;
  size?: number; mimeType?: string; uploadedAt: number; note?: string;
  recipientIds?: string[]; transactionId?: string; stage?: DocStage;
  sentAt?: number; viewedAt?: number; signedAt?: number;
};

export type Transaction = {
  id: string; address: string; reference?: string; stage: DocStage;
  status: "active" | "closed"; createdAt: number; closedAt?: number; clientIds?: string[];
};

const SEED_TX: Transaction[] = [{
  id: "tx-seed-72", address: "245 W 72nd St · #14A", reference: "PHX-2451",
  stage: "Disclosures", status: "active",
  createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5, clientIds: [],
}];

const SEED: DocItem[] = [{
  id: "seed-welcome", name: "Welcome Packet · Vance Private", category: "Other", kind: "file",
  uri: "https://www.africau.edu/images/default/sample.pdf", mimeType: "application/pdf",
  uploadedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
  note: "A short read on how I work with clients.", recipientIds: [], status: "shared",
}];

export const [DocumentsProvider, useDocuments] = createContextHook(() => {
  const { realtorId } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const STORAGE_KEY = `${scope}:docs.v2`;
  const TX_STORAGE_KEY = `${scope}:tx.v1`;
  const CHANNEL = `${scope}:docs`;
  const KV_DOCS_KEY = `${scope}:docs.v2`;
  const KV_TX_KEY = `${scope}:tx.v1`;

  const [items, setItems] = useState<DocItem[]>(SEED);
  const [transactions, setTransactions] = useState<Transaction[]>(SEED_TX);
  const [docsRev, setDocsRev] = useState<number>(0);
  const [txRev, setTxRev] = useState<number>(0);
  const docsRevRef = useRef<number>(0);
  const txRevRef = useRef<number>(0);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  useEffect(() => {
    setItems(SEED); setTransactions(SEED_TX);
    setDocsRev(0); setTxRev(0); docsRevRef.current = 0; txRevRef.current = 0;
    setHydrated(false);
  }, [realtorId]);

  const bumpDocs = useCallback(() => { const n = Math.max(docsRevRef.current + 1, Date.now()); docsRevRef.current = n; setDocsRev(n); }, []);
  const bumpTx = useCallback(() => { const n = Math.max(txRevRef.current + 1, Date.now()); txRevRef.current = n; setTxRev(n); }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [rawDocs, rawTx] = await Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(TX_STORAGE_KEY)]);
        if (!mounted) return;
        if (rawDocs) { const parsed = JSON.parse(rawDocs) as DocItem[]; if (Array.isArray(parsed)) setItems(parsed); }
        if (rawTx) { const parsed = JSON.parse(rawTx) as Transaction[]; if (Array.isArray(parsed)) setTransactions(parsed); }
      } catch (e) { console.log("[docs] hydrate", e); }
      finally { if (mounted) setHydrated(true); }
    })();
    return () => { mounted = false; };
  }, [STORAGE_KEY, TX_STORAGE_KEY]);

  const persistDocs = useCallback(async (next: DocItem[]) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { console.log("[docs] persist", e); }
  }, [STORAGE_KEY]);
  const persistTx = useCallback(async (next: Transaction[]) => {
    try { await AsyncStorage.setItem(TX_STORAGE_KEY, JSON.stringify(next)); } catch (e) { console.log("[tx] persist", e); }
  }, [TX_STORAGE_KEY]);

  useEffect(() => {
    if (!supabase || !hydrated) return;
    const ch = supabase.channel(CHANNEL, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "upsert" }, (payload) => {
      const d = payload.payload as DocItem; if (!d?.id) return;
      setItems((prev) => { const exists = prev.some((p) => p.id === d.id); const next = exists ? prev.map((p) => (p.id === d.id ? d : p)) : [d, ...prev]; void persistDocs(next); return next; });
    });
    ch.on("broadcast", { event: "delete" }, (payload) => {
      const id = (payload.payload as { id: string }).id;
      setItems((prev) => { const next = prev.filter((p) => p.id !== id); void persistDocs(next); return next; });
    });
    ch.on("broadcast", { event: "tx-upsert" }, (payload) => {
      const t = payload.payload as Transaction; if (!t?.id) return;
      setTransactions((prev) => { const exists = prev.some((p) => p.id === t.id); const next = exists ? prev.map((p) => (p.id === t.id ? t : p)) : [t, ...prev]; void persistTx(next); return next; });
    });
    ch.subscribe(); channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [hydrated, persistDocs, persistTx, CHANNEL]);

  const upsertDoc = useCallback((d: DocItem) => {
    setItems((prev) => { const exists = prev.some((p) => p.id === d.id); const next = exists ? prev.map((p) => (p.id === d.id ? d : p)) : [d, ...prev]; void persistDocs(next); return next; });
    channelRef.current?.send({ type: "broadcast", event: "upsert", payload: d }); bumpDocs();
  }, [persistDocs, bumpDocs]);
  const add = useCallback((d: DocItem) => { upsertDoc({ ...d, sentAt: d.sentAt ?? Date.now() }); }, [upsertDoc]);
  const remove = useCallback((id: string) => {
    setItems((prev) => { const next = prev.filter((p) => p.id !== id); void persistDocs(next); return next; });
    channelRef.current?.send({ type: "broadcast", event: "delete", payload: { id } }); bumpDocs();
  }, [persistDocs, bumpDocs]);
  const markViewed = useCallback((id: string) => {
    setItems((prev) => {
      let changed: DocItem | null = null;
      const next = prev.map((p) => { if (p.id !== id) return p; if (p.kind !== "portal") return p; if (p.status === "signed" || p.status === "viewed") return p; changed = { ...p, status: "viewed", viewedAt: Date.now() }; return changed; });
      if (changed) { void persistDocs(next); channelRef.current?.send({ type: "broadcast", event: "upsert", payload: changed }); bumpDocs(); }
      return next;
    });
  }, [persistDocs, bumpDocs]);
  const markSigned = useCallback((id: string) => {
    setItems((prev) => {
      let changed: DocItem | null = null;
      const next = prev.map((p) => { if (p.id !== id) return p; changed = { ...p, status: "signed", viewedAt: p.viewedAt ?? Date.now(), signedAt: Date.now() }; return changed; });
      if (changed) { void persistDocs(next); channelRef.current?.send({ type: "broadcast", event: "upsert", payload: changed }); bumpDocs(); }
      return next;
    });
  }, [persistDocs, bumpDocs]);
  const setStatus = useCallback((id: string, status: DocStatus) => {
    setItems((prev) => {
      let changed: DocItem | null = null;
      const next = prev.map((p) => {
        if (p.id !== id) return p; const now = Date.now(); const updated: DocItem = { ...p, status };
        if (status === "viewed" && !p.viewedAt) updated.viewedAt = now;
        if (status === "signed") { updated.viewedAt = p.viewedAt ?? now; updated.signedAt = now; }
        if (status === "awaiting-signature") { updated.viewedAt = undefined; updated.signedAt = undefined; }
        changed = updated; return updated;
      });
      if (changed) { void persistDocs(next); channelRef.current?.send({ type: "broadcast", event: "upsert", payload: changed }); bumpDocs(); }
      return next;
    });
  }, [persistDocs, bumpDocs]);
  const upsertTransaction = useCallback((t: Transaction) => {
    setTransactions((prev) => { const exists = prev.some((p) => p.id === t.id); const next = exists ? prev.map((p) => (p.id === t.id ? t : p)) : [t, ...prev]; void persistTx(next); return next; });
    channelRef.current?.send({ type: "broadcast", event: "tx-upsert", payload: t }); bumpTx();
  }, [persistTx, bumpTx]);
  const createTransaction = useCallback((input: { address: string; reference?: string; stage?: DocStage; clientIds?: string[] }) => {
    const t: Transaction = { id: `tx_${Date.now()}`, address: input.address.trim(), reference: input.reference?.trim() || undefined, stage: input.stage ?? "Offer", status: "active", createdAt: Date.now(), clientIds: input.clientIds ?? [] };
    upsertTransaction(t); return t;
  }, [upsertTransaction]);
  const closeTransaction = useCallback((id: string) => {
    setTransactions((prev) => {
      let changed: Transaction | null = null;
      const next = prev.map((p) => { if (p.id !== id) return p; changed = { ...p, status: "closed", closedAt: Date.now() }; return changed; });
      if (changed) { void persistTx(next); channelRef.current?.send({ type: "broadcast", event: "tx-upsert", payload: changed }); bumpTx(); }
      return next;
    });
  }, [persistTx, bumpTx]);

  const applyDocsRemote = useCallback((row: { value: DocItem[]; rev: number }, meta?: { initial?: boolean; forced?: boolean }) => {
    if (!Array.isArray(row?.value)) return;
    const force = meta?.initial || meta?.forced;
    if (!force && row.rev <= docsRevRef.current) return;
    docsRevRef.current = Math.max(docsRevRef.current, row.rev); setDocsRev(docsRevRef.current); setItems(row.value); void persistDocs(row.value);
  }, [persistDocs]);
  const applyTxRemote = useCallback((row: { value: Transaction[]; rev: number }, meta?: { initial?: boolean; forced?: boolean }) => {
    if (!Array.isArray(row?.value)) return;
    const force = meta?.initial || meta?.forced;
    if (!force && row.rev <= txRevRef.current) return;
    txRevRef.current = Math.max(txRevRef.current, row.rev); setTxRev(txRevRef.current); setTransactions(row.value); void persistTx(row.value);
  }, [persistTx]);
  const { refresh: refreshDocs } = useKvSync<DocItem[]>({ key: KV_DOCS_KEY, enabled: hydrated && isKvEnabled(), value: items, rev: docsRev, onRemote: applyDocsRemote });
  const { refresh: refreshTx } = useKvSync<Transaction[]>({ key: KV_TX_KEY, enabled: hydrated && isKvEnabled(), value: transactions, rev: txRev, onRemote: applyTxRemote });
  const refresh = useCallback(async (): Promise<void> => { await Promise.all([refreshDocs(), refreshTx()]); }, [refreshDocs, refreshTx]);

  const grouped = useMemo(() => {
    const byTx = new Map<string, DocItem[]>(); const loose: DocItem[] = [];
    for (const d of items) { if (d.transactionId) { const arr = byTx.get(d.transactionId) ?? []; arr.push(d); byTx.set(d.transactionId, arr); } else { loose.push(d); } }
    return { byTx, loose };
  }, [items]);

  return { items, transactions, grouped, hydrated, add, remove, markViewed, markSigned, setStatus, createTransaction, closeTransaction, upsertTransaction, refresh };
});
