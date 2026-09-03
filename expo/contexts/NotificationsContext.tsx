import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { supabase } from "@/lib/supabase";
import { isKvEnabled } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth } from "@/contexts/AuthContext";
import { registerDevice, sendPush } from "@/lib/push";

export type NotifKind = "new" | "price" | "status" | "personal" | "appointment";

export type NotifItem = {
  id: string; kind: NotifKind; title: string; body: string;
  listingId?: string; recipientIds?: string[]; read: boolean; createdAt: number;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

const SEED: NotifItem[] = [
  { id: "seed-1", kind: "personal", title: "Welcome to your private line", body: "Curated updates only — no noise. Your realtor will send personalized alerts here.", read: false, createdAt: Date.now() - 1000 * 60 * 30 },
];

export const [NotificationsProvider, useNotifications] = createContextHook(() => {
  const { realtorId, session, isAdmin, demoViewMode } = useAuth();
  const scope = realtorId ? realtorId : "demo";
  const STORAGE_KEY = `${scope}:notifs.v1`;
  const CHANNEL = `${scope}:notifs`;
  const KV_KEY = `${scope}:notifs.v1`;

  const [items, setItems] = useState<NotifItem[]>(SEED);
  const [rev, setRev] = useState<number>(0);
  const revRef = useRef<number>(0);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [permission, setPermission] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [foreground, setForeground] = useState<NotifItem | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setItems(SEED); setRev(0); revRef.current = 0; setHydrated(false); }, [realtorId]);

  const surface = useCallback((n: NotifItem) => { setForeground(n); if (dismissTimer.current) clearTimeout(dismissTimer.current); dismissTimer.current = setTimeout(() => setForeground(null), 6500); }, []);
  const dismissForeground = useCallback(() => { if (dismissTimer.current) clearTimeout(dismissTimer.current); setForeground(null); }, []);

  const bumpRev = useCallback(() => { const n = Math.max(revRef.current + 1, Date.now()); revRef.current = n; setRev(n); }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (mounted && raw) { const parsed = JSON.parse(raw) as NotifItem[]; if (Array.isArray(parsed)) setItems(parsed); }
      } catch (e) { console.log("[notifs] hydrate", e); }
      finally { if (mounted) setHydrated(true); }
      try { const status = await Notifications.getPermissionsAsync(); setPermission(status.granted ? "granted" : status.canAskAgain ? "undetermined" : "denied"); } catch {}
    })();
    return () => { mounted = false; };
  }, [STORAGE_KEY]);

  const persist = useCallback(async (next: NotifItem[]) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 200))); } catch (e) { console.log("[notifs] persist", e); }
  }, [STORAGE_KEY]);

  const presentLocal = useCallback(async (n: NotifItem) => {
    if (Platform.OS === "web") return;
    try { await Notifications.scheduleNotificationAsync({ content: { title: n.title, body: n.body, data: { id: n.id, listingId: n.listingId } }, trigger: null }); } catch (e) { console.log("[notifs] schedule", e); }
  }, []);

  useEffect(() => {
    if (!supabase || !hydrated) return;
    const ch = supabase.channel(CHANNEL, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "push" }, (payload) => {
      const n = payload.payload as NotifItem; if (!n?.id) return;
      setItems((prev) => { if (prev.some((p) => p.id === n.id)) return prev; const next = [n, ...prev]; void persist(next); return next; });
      void presentLocal(n); surface(n); bumpRev();
    });
    ch.subscribe(); channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [hydrated, persist, presentLocal, surface, bumpRev, CHANNEL]);

  const applyRemote = useCallback((row: { value: NotifItem[]; rev: number }, meta?: { initial?: boolean; forced?: boolean }) => {
    if (!Array.isArray(row?.value)) return;
    const force = meta?.initial || meta?.forced;
    if (!force && row.rev <= revRef.current) return;
    revRef.current = Math.max(revRef.current, row.rev); setRev(revRef.current); setItems(row.value); void persist(row.value);
  }, [persist]);
  const { refresh } = useKvSync<NotifItem[]>({ key: KV_KEY, enabled: hydrated && isKvEnabled(), value: items, rev, onRemote: applyRemote });

  const requestPermission = useCallback(async () => {
    if (Platform.OS === "web") { setPermission("denied"); return false; }
    if (!Device.isDevice) { setPermission("denied"); return false; }
    const res = await Notifications.requestPermissionsAsync(); const granted = !!res.granted; setPermission(granted ? "granted" : "denied"); return granted;
  }, []);

  /**
   * Register this device for real push delivery.
   *
   * Without a stored token the app can only post local notifications to a
   * phone that is already awake with the app open — which is to say, to
   * someone who would have seen the update anyway. Registering is what lets
   * an alert reach a locked phone in a pocket.
   *
   * Re-runs whenever the signed-in identity changes, because a device can
   * change hands (a realtor signs out, their client signs in on the same
   * phone) and the token must follow whoever is actually using it.
   */
  useEffect(() => {
    if (demoViewMode) return;
    if (!realtorId || !session?.email || session.preview) return;
    let cancelled = false;
    (async () => {
      const token = await registerDevice({
        realtorId,
        role: isAdmin ? "admin" : "client",
        email: session.email,
        clientId: session.clientId,
      });
      if (!cancelled && token) {
        pushTokenRef.current = token;
        setPermission("granted");
      }
    })();
    return () => { cancelled = true; };
  }, [realtorId, session?.email, session?.clientId, session?.preview, isAdmin, demoViewMode]);

  const broadcastFromRealtor = useCallback((input: Omit<NotifItem, "id" | "createdAt" | "read">) => {
    const n: NotifItem = { ...input, recipientIds: input.recipientIds && input.recipientIds.length > 0 ? input.recipientIds : undefined, id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now(), read: false };
    setItems((prev) => { const next = [n, ...prev]; void persist(next); return next; });
    surface(n); channelRef.current?.send({ type: "broadcast", event: "push", payload: n }); bumpRev();

    // Realtime reaches clients with the app open; this reaches everyone else.
    // Fire-and-forget: the notification is already saved and broadcast, so a
    // failed push degrades to "they see it next time they open the app"
    // rather than losing the message.
    if (realtorId && !demoViewMode) {
      void sendPush({
        realtorId,
        audience: n.recipientIds && n.recipientIds.length > 0
          ? { kind: "clients", clientIds: n.recipientIds }
          : { kind: "all-clients" },
        title: n.title,
        body: n.body,
        data: { id: n.id, listingId: n.listingId ?? null },
      });
    }
  }, [persist, surface, bumpRev, realtorId, demoViewMode]);

  const markAllRead = useCallback(() => {
    setItems((prev) => { const next = prev.map((n) => ({ ...n, read: true })); void persist(next); return next; }); bumpRev();
  }, [persist, bumpRev]);
  const markRead = useCallback((id: string) => {
    setItems((prev) => { const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n)); void persist(next); return next; }); bumpRev();
  }, [persist, bumpRev]);

  const unreadCount = items.filter((n) => !n.read).length;

  return { items, hydrated, permission, unreadCount, foreground, dismissForeground, requestPermission, broadcastFromRealtor, markAllRead, markRead, refresh, pushToken: pushTokenRef.current };
});
