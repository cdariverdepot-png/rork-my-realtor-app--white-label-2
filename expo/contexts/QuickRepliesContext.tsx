import { privateCacheScope } from '@/lib/privateCache';
import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type QuickReply = { id: string; label: string; text: string; builtin?: boolean };

const BUILTINS: QuickReply[] = [
  { id: "b-tour-confirmed", label: "Tour confirmed", text: "Your showing is confirmed. I'll text the gate code an hour before. Looking forward to it.", builtin: true },
  { id: "b-sending-docs", label: "Sending docs", text: "Sending the documents over now — review at your pace and let me know if anything reads off.", builtin: true },
  { id: "b-new-match", label: "New match", text: "Found one I think fits you — quietly listed. Want me to set up a private viewing?", builtin: true },
  { id: "b-running-late", label: "Running late", text: "Running about 10 minutes behind — I'll be there shortly. Thank you for your patience.", builtin: true },
  { id: "b-following-up", label: "Following up", text: "Circling back on this — happy to walk you through anything that's still open.", builtin: true },
];

export const [QuickRepliesProvider, useQuickReplies] = createContextHook(() => {
  const { realtorId, isAdmin, currentClientId } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const cacheScope = privateCacheScope(realtorId,currentClientId,isAdmin);
  const STORAGE_KEY = `${cacheScope}:quickReplies.v1`;
  const HIDDEN_KEY = `${cacheScope}:quickReplies.hidden.v1`;

  const [custom, setCustom] = useState<QuickReply[]>([]);
  const [hiddenBuiltins, setHiddenBuiltins] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => { setCustom([]); setHiddenBuiltins([]); setHydrated(false); }, [cacheScope]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [rawCustom, rawHidden] = await Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(HIDDEN_KEY)]);
        if (!mounted) return;
        if (rawCustom) { const parsed = JSON.parse(rawCustom) as QuickReply[]; if (Array.isArray(parsed)) setCustom(parsed); }
        if (rawHidden) { const parsed = JSON.parse(rawHidden) as string[]; if (Array.isArray(parsed)) setHiddenBuiltins(parsed); }
      } catch (e) { console.log("[quickReplies] hydrate", e); }
      finally { if (mounted) setHydrated(true); }
    })();
    return () => { mounted = false; };
  }, [STORAGE_KEY, HIDDEN_KEY]);

  const persistCustom = useCallback(async (next: QuickReply[]) => { try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { console.log("[quickReplies] persist", e); } }, [STORAGE_KEY]);
  const persistHidden = useCallback(async (next: string[]) => { try { await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch (e) { console.log("[quickReplies] persistHidden", e); } }, [HIDDEN_KEY]);

  const add = useCallback((input: { label: string; text: string }) => {
    const label = input.label.trim(); const text = input.text.trim();
    if (!label || !text) return null;
    const reply: QuickReply = { id: `qr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label, text };
    setCustom((prev) => { const next = [reply, ...prev]; void persistCustom(next); return next; });
    return reply;
  }, [persistCustom]);

  const update = useCallback((id: string, patch: Partial<Pick<QuickReply, "label" | "text">>) => {
    setCustom((prev) => { const next = prev.map((q) => q.id === id ? { ...q, label: patch.label?.trim() || q.label, text: patch.text?.trim() || q.text } : q); void persistCustom(next); return next; });
  }, [persistCustom]);

  const remove = useCallback((id: string) => {
    const builtin = BUILTINS.find((b) => b.id === id);
    if (builtin) { setHiddenBuiltins((prev) => { if (prev.includes(id)) return prev; const next = [...prev, id]; void persistHidden(next); return next; }); return; }
    setCustom((prev) => { const next = prev.filter((q) => q.id !== id); void persistCustom(next); return next; });
  }, [persistCustom, persistHidden]);

  const restoreBuiltins = useCallback(() => { setHiddenBuiltins(() => { void persistHidden([]); return []; }); }, [persistHidden]);

  const visible = useMemo<QuickReply[]>(() => { const visibleBuiltins = BUILTINS.filter((b) => !hiddenBuiltins.includes(b.id)); return [...custom, ...visibleBuiltins]; }, [custom, hiddenBuiltins]);

  return { hydrated, replies: visible, custom, hiddenBuiltins, add, update, remove, restoreBuiltins };
});
