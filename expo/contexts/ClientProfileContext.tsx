import { privateCacheScope } from '@/lib/privateCache';
import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isKvEnabled, kvSet } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import {
  completion,
  essentialsMet,
  type ProfileAnswers,
} from "@/constants/clientProfile";

/**
 * A client's intake profile, as stored.
 *
 * `answers` is deliberately an open map rather than a typed record of today's
 * questions. The schema in constants/clientProfile.ts decides what the keys
 * mean; this layer only moves the blob around. That is what lets a future
 * iteration add realtor-authored questions — or a whole task list — without a
 * storage migration.
 */
export type ClientProfile = {
  clientId: string;
  /** Denormalised so the realtor can match a profile to a roster row by email. */
  email: string;
  answers: ProfileAnswers;
  /** Set the first time the client finishes the required floor. */
  completedAt: number | null;
  /** Cleared whenever the client edits, so the realtor sees the update. */
  seenByRealtor: boolean;
  updatedAt: number;
  /** Schema generation, for when questions change shape later. */
  version: number;
};

export const PROFILE_VERSION = 1;

function emptyProfile(clientId: string, email: string): ClientProfile {
  return {
    clientId,
    email,
    answers: {},
    completedAt: null,
    seenByRealtor: true,
    updatedAt: Date.now(),
    version: PROFILE_VERSION,
  };
}

/**
 * Profiles for every client of the current realtor, keyed by client id.
 *
 * Scoped and synced exactly like ClientFeedContext, which means the client
 * writes their own profile and the realtor's device receives it through the
 * same shared key — no separate submission endpoint, and it works offline with
 * reconciliation on the next connection.
 */
export const [ClientProfileProvider, useClientProfiles] = createContextHook(() => {
  const { realtorId, currentClientId, session, isAdmin } = useAuth();
  const { notifyClientJoined } = useNotifications();
  const scope = realtorId ? realtorId : "demo";
  const cacheScope = privateCacheScope(realtorId,currentClientId,isAdmin);
  const STORAGE_KEY = `${cacheScope}:clientProfiles.v1`;
  const CHANNEL = `${scope}:clientProfiles`;
  const KV_KEY = `${scope}:clientProfiles.v1`;

  const [profiles, setProfiles] = useState<Record<string, ClientProfile>>({});
  const [rev, setRev] = useState<number>(0);
  const revRef = useRef<number>(0);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  useEffect(() => {
    setProfiles({});
    setRev(0);
    revRef.current = 0;
    setHydrated(false);
  }, [cacheScope]);

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
          const parsed = JSON.parse(raw) as Record<string, ClientProfile>;
          if (parsed && typeof parsed === "object") setProfiles(parsed);
        }
      } catch (e) {
        console.log("[clientProfile] hydrate", e);
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [STORAGE_KEY]);

  const persist = useCallback(
    async (next: Record<string, ClientProfile>) => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.log("[clientProfile] persist", e);
      }
    },
    [STORAGE_KEY]
  );

  // Live channel so a profile finished on the client's phone lands on the
  // realtor's dashboard without either of them reopening the app.
  useEffect(() => {
    if (!supabase || !hydrated) return;
    const ch = supabase.channel(CHANNEL, { config: { private: true, broadcast: { self: false } } });
    ch.on("broadcast", { event: "set" }, (payload) => {
      const p = payload.payload as ClientProfile;
      if (!p?.clientId) return;
      setProfiles((prev) => {
        const cur = prev[p.clientId];
        if (cur && cur.updatedAt >= p.updatedAt) return prev;
        const next = { ...prev, [p.clientId]: p };
        void persist(next);
        return next;
      });
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      ch.unsubscribe();
      channelRef.current = null;
    };
  }, [hydrated, persist, CHANNEL]);

  const writeProfile = useCallback(
    (clientId: string, email: string, mut: (cur: ClientProfile) => ClientProfile) => {
      setProfiles((prev) => {
        const cur = prev[clientId] ?? emptyProfile(clientId, email);
        const next: ClientProfile = { ...mut(cur), updatedAt: Date.now() };
        const out = { ...prev, [clientId]: next };
        void persist(out);
        channelRef.current?.send({ type: "broadcast", event: "set", payload: next });
        return out;
      });
      bumpRev();
    },
    [persist, bumpRev]
  );

  /* ------------------------- client-side actions ------------------------- */

  /** The profile belonging to whoever is signed in, if they're a client. */
  const myProfile = useMemo<ClientProfile | null>(() => {
    if (!currentClientId) return null;
    return profiles[currentClientId] ?? null;
  }, [profiles, currentClientId]);

  const myAnswers = useMemo<ProfileAnswers>(() => myProfile?.answers ?? {}, [myProfile]);

  /**
   * Saves a partial set of answers. Called on every step so a half-finished
   * profile survives the app being closed — abandoning an intake form and
   * having to start again is the fastest way to never get one back.
   */
  const saveAnswers = useCallback(
    (patch: ProfileAnswers) => {
      if (!currentClientId) return;
      const email = session?.email ?? "";
      writeProfile(currentClientId, email, (cur) => ({
        ...cur,
        email: email || cur.email,
        answers: { ...cur.answers, ...patch },
        // Any edit is news to the realtor, including edits after completion.
        seenByRealtor: false,
      }));
    },
    [currentClientId, session, writeProfile]
  );

  /** Marks the profile as finished and shared. Idempotent. */
  const completeProfile = useCallback(
    async (finalAnswers: ProfileAnswers) => {
      if (!currentClientId) throw new Error("Please sign in to finish your profile.");
      const email = session?.email ?? "";
      const cur = profiles[currentClientId] ?? emptyProfile(currentClientId, email);
      const answers = { ...cur.answers, ...finalAnswers };
      if (!essentialsMet(answers)) throw new Error("Please complete the required profile fields.");
      const next: ClientProfile = {
        ...cur,
        email: email || cur.email,
        answers,
        completedAt: cur.completedAt ?? Date.now(),
        seenByRealtor: false,
        updatedAt: Date.now(),
      };
      const out = { ...profiles, [currentClientId]: next };
      const nextRev = Math.max(revRef.current + 1, Date.now());
      if (supabase && !session?.guestAccess) await kvSet(KV_KEY, out, nextRev, true);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(out));
      setProfiles(out);
      bumpRev();
      void channelRef.current?.send({ type: "broadcast", event: "set", payload: next });
      if (!cur.completedAt) notifyClientJoined(currentClientId, session?.name || "A new client");
    },
    [currentClientId, session, profiles, STORAGE_KEY, KV_KEY, bumpRev, notifyClientJoined]
  );

  /**
   * True once the client has answered everything an agent can't work without.
   * Drives the resume prompts — never a hard gate on the app itself.
   */
  const myEssentialsMet = useMemo<boolean>(
    () => (myProfile ? essentialsMet(myAnswers) : false),
    [myProfile, myAnswers]
  );

  const myCompletion = useMemo(() => completion(myAnswers), [myAnswers]);

  const myProfileShared = useMemo<boolean>(
    () => Boolean(myProfile?.completedAt),
    [myProfile]
  );

  /* ------------------------- realtor-side reads ------------------------- */

  const getProfile = useCallback(
    (clientId: string): ClientProfile | null => profiles[clientId] ?? null,
    [profiles]
  );

  /** Matches a roster contact to a profile when ids differ across devices. */
  const getProfileByEmail = useCallback(
    (email: string): ClientProfile | null => {
      const e = email.trim().toLowerCase();
      if (!e) return null;
      return (
        Object.values(profiles).find((p) => (p.email ?? "").trim().toLowerCase() === e) ?? null
      );
    },
    [profiles]
  );

  /** Profiles the realtor hasn't opened yet — drives the "new" badge. */
  const unseenCount = useMemo<number>(
    () =>
      isAdmin
        ? Object.values(profiles).filter((p) => p.completedAt && !p.seenByRealtor).length
        : 0,
    [profiles, isAdmin]
  );

  const markSeen = useCallback(
    (clientId: string) => {
      const cur = profiles[clientId];
      if (!cur || cur.seenByRealtor) return;
      writeProfile(clientId, cur.email, (p) => ({ ...p, seenByRealtor: true }));
    },
    [profiles, writeProfile]
  );

  /* ------------------------------- sync ------------------------------- */

  const applyRemote = useCallback(
    (
      row: { value: Record<string, ClientProfile>; rev: number },
      meta?: { initial?: boolean; forced?: boolean }
    ) => {
      if (!row?.value) return;
      const force = meta?.initial || meta?.forced;
      if (!force && row.rev <= revRef.current) return;
      revRef.current = Math.max(revRef.current, row.rev);
      setRev(revRef.current);
      setProfiles(row.value);
      void persist(row.value);
    },
    [persist]
  );

  const { refresh } = useKvSync<Record<string, ClientProfile>>({
    key: KV_KEY,
    enabled: hydrated && isKvEnabled(),
    value: profiles,
    rev,
    onRemote: applyRemote,
  });

  return useMemo(
    () => ({
      profiles,
      hydrated,
      // client
      myProfile,
      myAnswers,
      myEssentialsMet,
      myProfileShared,
      myCompletion,
      saveAnswers,
      completeProfile,
      // realtor
      getProfile,
      getProfileByEmail,
      unseenCount,
      markSeen,
      refresh,
    }),
    [
      profiles,
      hydrated,
      myProfile,
      myAnswers,
      myEssentialsMet,
      myProfileShared,
      myCompletion,
      saveAnswers,
      completeProfile,
      getProfile,
      getProfileByEmail,
      unseenCount,
      markSeen,
      refresh,
    ]
  );
});
