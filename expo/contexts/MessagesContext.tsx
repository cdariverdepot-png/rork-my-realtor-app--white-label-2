import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isKvEnabled, kvGet } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/contexts/ClientsContext";

export type ChatRole = "client" | "realtor";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  listingId?: string;
  documentId?: string;
  read?: boolean;
};

/** Lightweight per-client thread preview used by the realtor's inbox. */
export type ThreadSummary = {
  clientId: string;
  lastText: string;
  lastAt: number;
  lastRole: ChatRole;
  /** Count of client messages the realtor hasn't read yet. */
  unreadForRealtor: number;
};

/** A fresh thread always opens with the realtor's standing welcome. */
const welcomeSeed = (): ChatMessage[] => [];

const threadKey = (realtorId: string, clientId: string): string =>
  `${realtorId}:${clientId}:chat.v1`;

/**
 * MessagesContext — private per-client threads.
 *
 * Every conversation is scoped to `realtorId + clientId`, so each client has
 * an isolated thread and no client can see another's messages.
 *   - Client sessions are locked to their own clientId.
 *   - Realtor/admin sessions choose which client thread to view via
 *     `openThread(clientId)`, and get an inbox of all clients via `summaries`.
 */
export const [MessagesProvider, useMessages] = createContextHook(() => {
  const { realtorId, isAdmin, isClient, currentClientId, viewAsClient } = useAuth();
  const { clients } = useClients();

  // Admin picks the active thread; a client is always pinned to their own.
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const threadClientId = isClient ? currentClientId ?? null : viewAsClient ? null : activeClientId;
  const scope = realtorId ?? "demo";
  const hasThread = !!realtorId && !!threadClientId;
  const THREAD_KEY = hasThread ? threadKey(scope, threadClientId as string) : "";
  const CHANNEL = hasThread ? `${scope}:${threadClientId}:chat` : "";
  const KV_KEY = THREAD_KEY;

  const [messages, setMessages] = useState<ChatMessage[]>(() => welcomeSeed());
  const [rev, setRev] = useState<number>(0);
  const revRef = useRef<number>(0);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [otherTyping, setOtherTyping] = useState<boolean>(false);
  // Realtor inbox: per-client thread previews keyed by clientId.
  const [summaries, setSummaries] = useState<Record<string, ThreadSummary>>({});
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpRev = useCallback(() => {
    const n = Math.max(revRef.current + 1, Date.now());
    revRef.current = n;
    setRev(n);
  }, []);

  // Hydrate (or clear) whenever the active thread changes.
  useEffect(() => {
    let mounted = true;
    setOtherTyping(false);
    if (!hasThread) {
      setMessages([]);
      revRef.current = 0;
      setRev(0);
      setHydrated(true);
      return () => {
        mounted = false;
      };
    }
    setHydrated(false);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(THREAD_KEY);
        if (mounted) {
          if (raw) {
            const parsed = JSON.parse(raw) as ChatMessage[];
            setMessages(Array.isArray(parsed) && parsed.length ? parsed : welcomeSeed());
          } else {
            setMessages(welcomeSeed());
          }
        }
      } catch (e) {
        console.log("[chat] hydrate", e);
        if (mounted) setMessages(welcomeSeed());
      } finally {
        if (mounted) {
          revRef.current = 0;
          setRev(0);
          setHydrated(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [THREAD_KEY, hasThread]);

  const persist = useCallback(
    async (next: ChatMessage[]) => {
      if (!THREAD_KEY) return;
      try {
        await AsyncStorage.setItem(THREAD_KEY, JSON.stringify(next.slice(-200)));
      } catch (e) {
        console.log("[chat] persist", e);
      }
    },
    [THREAD_KEY]
  );

  // Realtime broadcast for the active thread (instant typing / delivery).
  useEffect(() => {
    if (!supabase || !hydrated || !hasThread) return;
    const ch = supabase.channel(CHANNEL, { config: { private: true, broadcast: { self: false } } });
    ch.on("broadcast", { event: "msg" }, (payload) => {
      const m = payload.payload as ChatMessage;
      if (!m?.id) return;
      setMessages((prev) => {
        if (prev.some((p) => p.id === m.id)) return prev;
        const next = [...prev, m];
        void persist(next);
        return next;
      });
      bumpRev();
    });
    ch.on("broadcast", { event: "typing" }, (payload) => {
      const role = (payload.payload as { role: ChatRole })?.role;
      if (!role) return;
      setOtherTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setOtherTyping(false), 2500);
    });
    ch.on("broadcast", { event: "read" }, (payload) => {
      const ids = (payload.payload as { ids: string[] })?.ids ?? [];
      setMessages((prev) => {
        const next = prev.map((m) => (ids.includes(m.id) ? { ...m, read: true } : m));
        void persist(next);
        return next;
      });
      bumpRev();
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      ch.unsubscribe();
      channelRef.current = null;
    };
  }, [hydrated, persist, bumpRev, CHANNEL, hasThread]);

  const applyRemote = useCallback(
    (row: { value: ChatMessage[]; rev: number }, meta?: { initial?: boolean; forced?: boolean }) => {
      if (!Array.isArray(row?.value)) return;
      const force = meta?.initial || meta?.forced;
      if (!force && row.rev <= revRef.current) return;
      revRef.current = Math.max(revRef.current, row.rev);
      setRev(revRef.current);
      // Merge by id instead of replacing: if both sides sent at nearly the same
      // moment (or one sent while offline), neither message is lost. A message
      // read on either side stays read.
      setMessages((local) => {
        const byId = new Map<string, ChatMessage>();
        for (const m of local) byId.set(m.id, m);
        let localOnly = byId.size;
        for (const m of row.value) {
          const mine = byId.get(m.id);
          if (mine) localOnly -= 1;
          byId.set(m.id, mine ? { ...m, read: m.read || mine.read } : m);
        }
        const merged = [...byId.values()].sort((x, y) => x.createdAt - y.createdAt);
        void persist(merged);
        // Push back anything the server copy was missing.
        if (localOnly > 0) setTimeout(bumpRev, 0);
        return merged;
      });
    },
    [persist, bumpRev]
  );
  const { refresh } = useKvSync<ChatMessage[]>({
    key: KV_KEY,
    enabled: hasThread && hydrated && isKvEnabled(),
    value: messages,
    rev,
    onRemote: applyRemote,
  });

  const send = useCallback(
    (role: ChatRole, text: string, opts?: { listingId?: string; documentId?: string }) => {
      const trimmed = text.trim();
      if (!trimmed && !opts?.listingId && !opts?.documentId) return;
      if (!hasThread) return;
      const m: ChatMessage = {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        role,
        text: trimmed,
        createdAt: Date.now(),
        listingId: opts?.listingId,
        documentId: opts?.documentId,
        read: false,
      };
      setMessages((prev) => {
        const next = [...prev, m];
        void persist(next);
        return next;
      });
      channelRef.current
        ?.send({ type: "broadcast", event: "msg", payload: m })
        .catch((e) => console.log("[chat] send", e));
      bumpRev();
      // Keep the realtor's inbox preview fresh for the thread being typed in.
      const cid = threadClientId;
      if (cid) {
        setSummaries((prev) => ({
          ...prev,
          [cid]: {
            clientId: cid,
            lastText: trimmed || (opts?.listingId ? "Shared a listing." : "Shared a document."),
            lastAt: m.createdAt,
            lastRole: role,
            unreadForRealtor:
              role === "client" ? (prev[cid]?.unreadForRealtor ?? 0) + 1 : prev[cid]?.unreadForRealtor ?? 0,
          },
        }));
      }
    },
    [persist, bumpRev, hasThread, threadClientId]
  );

  const setTyping = useCallback((role: ChatRole) => {
    channelRef.current
      ?.send({ type: "broadcast", event: "typing", payload: { role } })
      ?.catch(() => {});
  }, []);

  const markRead = useCallback(
    (role: ChatRole) => {
      const ids: string[] = [];
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.role !== role && !m.read) {
            ids.push(m.id);
            return { ...m, read: true };
          }
          return m;
        });
        if (ids.length) void persist(next);
        return next;
      });
      if (ids.length) {
        channelRef.current
          ?.send({ type: "broadcast", event: "read", payload: { ids } })
          ?.catch(() => {});
        bumpRev();
      }
      // When the realtor reads a thread, clear its inbox unread badge.
      if (role === "realtor" && threadClientId) {
        setSummaries((prev) =>
          prev[threadClientId]
            ? { ...prev, [threadClientId]: { ...prev[threadClientId], unreadForRealtor: 0 } }
            : prev
        );
      }
    },
    [persist, bumpRev, threadClientId]
  );

  // ── Realtor inbox: per-client thread summaries ──────────────────────
  const clientsRef = useRef(clients);
  useEffect(() => {
    clientsRef.current = clients;
  }, [clients]);

  const refreshSummaries = useCallback(async (): Promise<void> => {
    if (!realtorId || !isAdmin) {
      setSummaries({});
      return;
    }
    const roster = clientsRef.current;
    const results = await Promise.all(
      roster.map(async (c): Promise<ThreadSummary | null> => {
        const key = threadKey(realtorId, c.id);
        let msgs: ChatMessage[] | null = null;
        try {
          if (isKvEnabled()) {
            const row = await kvGet<ChatMessage[]>(key);
            if (row?.value && Array.isArray(row.value)) msgs = row.value;
          }
        } catch (e) {
          console.log("[chat] summary kv", e);
        }
        if (!msgs) {
          try {
            const raw = await AsyncStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw) as ChatMessage[];
              if (Array.isArray(parsed)) msgs = parsed;
            }
          } catch {}
        }
        if (!msgs || msgs.length === 0) return null;
        const last = msgs[msgs.length - 1];
        const unreadForRealtor = msgs.filter((m) => m.role === "client" && !m.read).length;
        return {
          clientId: c.id,
          lastText: last.text,
          lastAt: last.createdAt,
          lastRole: last.role,
          unreadForRealtor,
        };
      })
    );
    const next: Record<string, ThreadSummary> = {};
    for (const r of results) {
      if (r) next[r.clientId] = r;
    }
    setSummaries(next);
  }, [realtorId, isAdmin]);

  // Load summaries for admins and keep them loosely fresh.
  useEffect(() => {
    if (!isAdmin) {
      setSummaries({});
      return;
    }
    void refreshSummaries();
    const id = setInterval(() => {
      void refreshSummaries();
    }, 15000);
    return () => clearInterval(id);
  }, [isAdmin, realtorId, clients.length, refreshSummaries]);

  const totalUnreadForRealtor = useMemo(
    () => Object.values(summaries).reduce((acc, s) => acc + s.unreadForRealtor, 0),
    [summaries]
  );

  const openThread = useCallback((clientId: string | null) => {
    setActiveClientId(clientId);
  }, []);

  return {
    messages,
    hydrated,
    otherTyping,
    hasThread,
    send,
    setTyping,
    markRead,
    refresh,
    activeClientId,
    openThread,
    summaries,
    refreshSummaries,
    totalUnreadForRealtor,
  };
});
