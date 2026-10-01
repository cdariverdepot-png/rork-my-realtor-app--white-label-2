import createContextHook from "@nkzw/create-context-hook";
import { cancelPendingPreviewExit } from "@/lib/navIntent";
import { registerClientAccount, verifyClientAccount } from "@/lib/clientAccounts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";
import { Platform } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { hashPassword, verifyPassword } from "@/lib/passwordHash";
import { appendClientToRoster } from "@/lib/clientRoster";
import { claimClientSeat } from "@/lib/seats";
import { ensureRealtorAuthRecord, signInRealtorWithAuth, signUpRealtorWithAuth } from "@/lib/realtorAuth";

export type Role = "admin" | "client" | null;

type Session = {
  email: string;
  role: Role;
  /** The realtor whose data to scope to. For admins, their own ID. For clients, the realtor who owns the code they entered. */
  realtorId: string;
  /** For client sessions — links to a record in ClientsContext. */
  clientId?: string;
  /** Display name. */
  name?: string;
  /** Issued-at timestamp, ms. */
  iat?: number;
  /** True for the footer "Dashboard" preview bypass. */
  preview?: boolean;
} | null;

/** A registered client account. */
type ClientAccount = {
  email: string;
  pw: string;
  clientId: string;
  name: string;
  realtorId: string;
  createdAt: number;
};

/** A realtor account row from Supabase. */
export type RealtorRecord = {
  id: string;
  email: string;
  name: string;
  /** Legacy cache only; never fetched from the public profile table. */
  password_hash?: string;
  brand_name: string;
  monogram: string;
  client_code: string;
  client_code_enabled: boolean;
  created_at: string;
  updated_at: string;
};

const STORAGE_KEY = "myrealtor.auth.session.v4";
const LEGACY_KEYS = [
  "vance.auth.session.v1",
  "vance.auth.session.v2",
  "vance.auth.session.v3",
];
const ACCOUNTS_KEY_PREFIX = "myrealtor.auth.accounts.";
const REALTOR_CACHE_KEY = "myrealtor.auth.realtorCache.v1";

/** Session age cap — 30 days for clients. */
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

/** Demo realtor ID for preview/dev fallback. */
export const DEMO_REALTOR_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Temporary production skip-login. Metro inlines the literal env read.
 * When true, portal/home can enter a local admin preview session without Supabase auth.
 * Turn off (remove or set false) to restore normal login.
 */
export const AUTH_BYPASS_ENABLED = process.env.EXPO_PUBLIC_AUTH_BYPASS === "true";

function makePreviewRealtorRecord(): RealtorRecord {
  const now = new Date().toISOString();
  return {
    id: DEMO_REALTOR_ID,
    email: "preview@local",
    name: "Preview",
    brand_name: "PREVIEW",
    monogram: "PR",
    client_code: "PREVIEW",
    client_code_enabled: true,
    created_at: now,
    updated_at: now,
  };
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureDel(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Deterministic client code from email — mirrors the Supabase SQL function. */
function deriveClientCode(email: string): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const n = alpha.length;
  let h1 = 2166136261 >>> 0;
  let h2 = 2216829733 >>> 0;
  for (let i = 0; i < email.length; i++) {
    const ch = email.charCodeAt(i);
    h1 = ((h1 ^ ch) * 16777619) >>> 0;
    h2 = ((h2 ^ ch) * 16777619) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 6; i++) {
    const source = i % 2 === 0 ? h1 : h2;
    out += alpha[source % n];
    if (i % 2 === 0) h1 = ((h1 ^ (h1 >>> 13)) * 16777619) >>> 0;
    else h2 = ((h2 ^ (h2 >>> 17)) * 16777619) >>> 0;
  }
  return out;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session>(null);
  const [viewAsClient, setViewAsClient] = useState<boolean>(false);
  const [demoViewMode, setDemoViewMode] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [accountsRev, setAccountsRev] = useState<number>(0);
  const accountsRevRef = useRef<number>(0);
  const [realtorCache, setRealtorCache] = useState<RealtorRecord[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);

  const currentRealtorId = session?.realtorId;
  const accountsKey = currentRealtorId
    ? `${ACCOUNTS_KEY_PREFIX}${currentRealtorId}`
    : null;

  // Hydrate from local storage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        for (const k of LEGACY_KEYS) {
          const legacy = await AsyncStorage.getItem(k);
          if (legacy) {
            await secureSet(STORAGE_KEY, legacy);
            await AsyncStorage.removeItem(k);
          }
        }
        const [raw, cacheRaw] = await Promise.all([
          secureGet(STORAGE_KEY),
          AsyncStorage.getItem(REALTOR_CACHE_KEY),
        ]);
        if (!mounted) return;

        if (cacheRaw) {
          try {
            const parsed = JSON.parse(cacheRaw) as RealtorRecord[];
            if (Array.isArray(parsed)) setRealtorCache(parsed);
          } catch (e) {
            console.log("[auth] realtor cache parse", e);
          }
        }

        if (raw) {
          const parsed = JSON.parse(raw) as Session;
          const isPreviewOrDemo = !!(parsed?.preview || parsed?.realtorId === DEMO_REALTOR_ID);
          // Read the stored Supabase session (works offline) instead of a
          // network getUser(): a cold start without signal must not log the
          // realtor out. Skip for temporary AUTH_BYPASS preview/demo sessions.
          const authUser = parsed?.role === "admin" && !isPreviewOrDemo && supabase
            ? (await supabase.auth.getSession()).data.session?.user ?? null : null;
          const expired = !!(parsed?.iat && Date.now() - parsed.iat > SESSION_MAX_AGE_MS);
          const dropPreview = isPreviewOrDemo && !AUTH_BYPASS_ENABLED;
          const adminAuthInvalid = parsed?.role === "admin" && !isPreviewOrDemo && (
            !authUser || authUser.is_anonymous || !authUser.email_confirmed_at ||
            authUser.email?.toLowerCase() !== parsed.email.toLowerCase()
          );
          if (expired || dropPreview || adminAuthInvalid) {
            await secureDel(STORAGE_KEY);
          } else {
            setSession(parsed);
            // Keep bypass preview usable: seed realtorCache so OnboardingGuard
            // does not treat setup as forever incomplete.
            if (AUTH_BYPASS_ENABLED && isPreviewOrDemo) {
              setRealtorCache((prev) => {
                const existing = prev.find((r) => r.id === DEMO_REALTOR_ID);
                if (existing?.client_code_enabled) return prev;
                const record = makePreviewRealtorRecord();
                const next = [record, ...prev.filter((r) => r.id !== DEMO_REALTOR_ID)];
                void AsyncStorage.setItem(REALTOR_CACHE_KEY, JSON.stringify(next));
                return next;
              });
            }
            // Hydrate accounts for the session's realtor
            if (parsed?.realtorId) {
              const accRaw = await AsyncStorage.getItem(
                `${ACCOUNTS_KEY_PREFIX}${parsed.realtorId}`
              );
              if (accRaw) {
                try {
                  const accParsed = JSON.parse(accRaw) as ClientAccount[];
                  if (Array.isArray(accParsed)) setAccounts(accParsed);
                } catch (e) {
                  console.log("[auth] accounts parse", e);
                }
              }
            }
          }
        }
      } catch (e) {
        console.log("[auth] hydrate error", e);
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // When realtorId changes (login/logout), reload accounts for that realtor
  useEffect(() => {
    if (!accountsKey || !hydrated) return;
    let cancelled = false;
    (async () => {
      const raw = await AsyncStorage.getItem(accountsKey);
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ClientAccount[];
          if (Array.isArray(parsed)) setAccounts(parsed);
        } catch {}
      } else {
        setAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountsKey, hydrated]);

  const persistSession = useCallback(async (next: Session) => {
    try {
      if (next) await secureSet(STORAGE_KEY, JSON.stringify(next));
      else await secureDel(STORAGE_KEY);
    } catch (e) {
      console.log("[auth] persist session error", e);
    }
  }, []);

  const persistAccounts = useCallback(
    async (next: ClientAccount[]) => {
      if (!accountsKey) return;
      try {
        await AsyncStorage.setItem(accountsKey, JSON.stringify(next));
      } catch (e) {
        console.log("[auth] persist accounts error", e);
      }
    },
    [accountsKey]
  );

  const persistRealtorCache = useCallback(async (next: RealtorRecord[]) => {
    try {
      await AsyncStorage.setItem(REALTOR_CACHE_KEY, JSON.stringify(next));
    } catch (e) {
      console.log("[auth] persist realtor cache", e);
    }
  }, []);

  const openVerifiedRealtorSession = useCallback(async (email: string, realtorId: string) => {
    if (!supabase) return { ok: false as const, error: "The account service is unavailable." };
    const { data, error } = await supabase.from("realtors")
      .select("id,email,name,brand_name,monogram,client_code,client_code_enabled,created_at,updated_at")
      .eq("id", realtorId).single();
    if (error || !data) return { ok: false as const, error: "Your realtor profile could not be loaded." };
    // Older rows got a name derived from the email address. The name typed at
    // signup is the source of truth for everything the realtor sees.
    const signupName = (await supabase.auth.getSession()).data.session?.user?.user_metadata?.realtor_name;
    const record = { ...(data as RealtorRecord),
      ...(typeof signupName === "string" && signupName.trim() ? { name: signupName.trim() } : {}) };
    setRealtorCache(prev => {
      const next = [record, ...prev.filter(item => item.id !== record.id)];
      void persistRealtorCache(next);
      return next;
    });
    const next: Session = { email, role: "admin", realtorId, name: record.name, iat: Date.now() };
    setSession(next);
    await persistSession(next);
    return { ok: true as const, realtorId };
  }, [persistRealtorCache, persistSession]);

  const completeRealtorSignIn = useCallback(async () => {
    const verified = await ensureRealtorAuthRecord();
    if (!verified.ok) return verified;
    const result = await supabase!.auth.getUser();
    const user = result.data.user;
    if (result.error || !user?.email || !user.email_confirmed_at) {
      return { ok: false as const, error: "Please sign in again to continue." };
    }
    return openVerifiedRealtorSession(user.email, verified.realtorId);
  }, [openVerifiedRealtorSession]);

  /** Resolve an enabled invitation without exposing the realtor account row. */
  const lookupRealtorByCode = useCallback(
    async (code: string): Promise<RealtorRecord | null> => {
      const clean = code.replace(/\s+/g, "").toUpperCase();
      if (!clean || !supabase) return null;
      const { data, error } = await supabase.rpc("lookup_realtor_by_code", { p_code: clean });
      if (error || !Array.isArray(data) || !data[0]) return null;
      const row = data[0] as Pick<RealtorRecord, "id" | "name" | "brand_name" | "monogram" | "client_code" | "client_code_enabled">;
      const record: RealtorRecord = { ...row, email: "", created_at: "", updated_at: "" };
      setRealtorCache(prev => {
        const next = [record, ...prev.filter(item => item.id !== record.id)];
        void persistRealtorCache(next);
        return next;
      });
      return record;
    },
    [persistRealtorCache]
  );

  /**
   * Realtor signup — creates a row in Supabase `realtors` and signs in.
   */
  const realtorSignup = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
    }): Promise<{ ok: boolean; error?: string; realtorId?: string; verificationRequired?: boolean }> => {
      const name = input.name.trim();
      const email = normEmail(input.email);
      const password = input.password;
      if (!name) return { ok: false, error: "Please enter your name." };
      if (!isValidEmail(email))
        return { ok: false, error: "Enter a valid email address." };
      if (password.length < 6)
        return { ok: false, error: "Password must be at least 6 characters." };

      const verified = await signUpRealtorWithAuth({ name, email, password });
      if (!verified.ok) return verified;
      return openVerifiedRealtorSession(email, verified.realtorId);
    },
    [openVerifiedRealtorSession]
  );

  /**
   * Realtor login — verifies against Supabase or local cache.
   */
  const realtorLogin = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ ok: boolean; error?: string; realtorId?: string; verificationRequired?: boolean }> => {
      const trimmed = normEmail(email);
      if (!trimmed || !password)
        return { ok: false, error: "Enter your email and password." };

      const verified = await signInRealtorWithAuth(trimmed, password);
      if (!verified.ok) return verified;
      return openVerifiedRealtorSession(trimmed, verified.realtorId);
    },
    [openVerifiedRealtorSession]
  );

  /** Backwards-compatible login alias. */
  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ ok: boolean; error?: string; realtorId?: string }> => {
      return realtorLogin(email, password);
    },
    [realtorLogin]
  );

  /** Demo presentation never creates or replaces an authenticated session. */
  const previewAdmin = useCallback(async (): Promise<void> => {
    setDemoViewMode(true);
    setViewAsClient(true);
  }, []);

  /**
   * Temporary AUTH_BYPASS: local admin session so walkthrough + dashboard work
   * without Supabase login. Does not gut signup/login — flag false = normal auth.
   * demoViewMode/viewAsClient stay false so admin UI (not Explore Demo) is shown.
   */
  const enterAuthBypass = useCallback(async (): Promise<void> => {
    if (!AUTH_BYPASS_ENABLED) return;
    setDemoViewMode(false);
    setViewAsClient(false);
    const record = makePreviewRealtorRecord();
    setRealtorCache((prev) => {
      const next = [record, ...prev.filter((item) => item.id !== record.id)];
      void persistRealtorCache(next);
      return next;
    });
    const next: Session = {
      email: "preview@local",
      role: "admin",
      realtorId: DEMO_REALTOR_ID,
      name: "Preview",
      iat: Date.now(),
      preview: true,
    };
    setSession(next);
    await persistSession(next);
  }, [persistRealtorCache, persistSession]);

  const exitPreview = useCallback(async (): Promise<void> => {
    if (!session?.preview) return;
    setSession(null);
    await persistSession(null);
  }, [persistSession, session]);

  /** Realtor previews their own client-facing app (template). Transient — never persisted. */
  const enterViewAsClient = useCallback((): void => {
    cancelPendingPreviewExit();
    setDemoViewMode(false);
    setViewAsClient(true);
  }, []);

  const exitViewAsClient = useCallback((): void => {
    setViewAsClient(false);
  }, []);

  /** Enter the Eliza Vance demo showcase — forces the demo brand and hides all edit UI. */
  const enterDemoView = useCallback((): void => {
    cancelPendingPreviewExit();
    setDemoViewMode(true);
    setViewAsClient(true);
  }, []);

  /** Exit the demo showcase and return to wherever the user came from. */
  const exitDemoView = useCallback(async (): Promise<void> => {
    setDemoViewMode(false);
    setViewAsClient(false);
    // If this was a preview session (came from landing screen), log out completely.
    if (session?.preview) {
      setSession(null);
      await persistSession(null);
    }
  }, [session, persistSession]);

  /**
   * Client signup — scoped to a specific realtor, and gated by that realtor's
   * available client seats. The seat is claimed on the server BEFORE the
   * account is written locally, so a refused client never ends up half-created.
   */
  const clientSignup = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
      realtorId: string;
    }): Promise<{ ok: boolean; error?: string; clientId?: string; atCapacity?: boolean }> => {
      const name = input.name.trim();
      const email = normEmail(input.email);
      const password = input.password;
      if (!name) return { ok: false, error: "Please enter your name." };
      if (!isValidEmail(email))
        return { ok: false, error: "Enter a valid email address." };
      if (password.length < 6)
        return { ok: false, error: "Password must be at least 6 characters." };
      // Accounts live under the realtor they belong to. Nobody is signed in yet
      // during signup, so read (and below, write) that realtor's list directly.
      const accKey = `${ACCOUNTS_KEY_PREFIX}${input.realtorId}`;
      let realmAccounts: ClientAccount[] = [];
      try {
        const raw = await AsyncStorage.getItem(accKey);
        const parsed = raw ? JSON.parse(raw) as ClientAccount[] : [];
        if (Array.isArray(parsed)) realmAccounts = parsed;
      } catch {}
      if (realmAccounts.some((a) => a.email === email)) {
        return {
          ok: false,
          error: "An account already exists for this email. Try signing in.",
        };
      }
      const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Seats are claimed server-side. A full house stops here — nothing is
      // written, and the caller shows the soft "not accepting clients" card.
      const seat = await claimClientSeat({
        realtorId: input.realtorId,
        email,
        clientId,
        name,
      });
      if (!seat.ok) {
        return {
          ok: false,
          atCapacity: seat.reason === "limit",
          error: "This agent isn't accepting new clients right now.",
        };
      }

      const account: ClientAccount = {
        email,
        pw: await hashPassword(email, password),
        clientId,
        name,
        realtorId: input.realtorId,
        createdAt: Date.now(),
      };
      const nextAccounts = [account, ...realmAccounts];
      setAccounts(nextAccounts);
      try {
        await AsyncStorage.setItem(accKey, JSON.stringify(nextAccounts));
      } catch (e) {
        console.log("[auth] persist accounts error", e);
      }
      // Server copy, so the client can sign in on another device.
      void registerClientAccount({ realtorId: input.realtorId, email, pwHash: account.pw, clientId, name });

      // Save the client onto the realtor's roster under the CORRECT realtorId,
      // independent of any session-scoped context. This is what stops new
      // clients from being written under the "demo" scope.
      try {
        await appendClientToRoster(input.realtorId, {
          id: clientId,
          name,
          email,
          tag: "Client · Signed up",
          source: "manual",
          createdAt: Date.now(),
        });
      } catch (e) {
        console.log("[auth] roster write", e);
      }

      const next: Session = {
        email,
        role: "client",
        realtorId: input.realtorId,
        clientId,
        name,
        iat: Date.now(),
      };
      setSession(next);
      await persistSession(next);
      return { ok: true, clientId };
    },
    [persistSession]
  );

  /**
   * Client login — scoped to a specific realtor.
   *
   * Also re-claims the seat. An existing connection is free (same person, new
   * phone), but if the realtor disconnected them their seat is gone and they
   * are refused unless there is room again.
   */
  const clientLogin = useCallback(
    async (
      email: string,
      password: string,
      realtorId: string
    ): Promise<{ ok: boolean; error?: string; clientId?: string; atCapacity?: boolean }> => {
      const e = normEmail(email);
      if (!e || !password)
        return { ok: false, error: "Enter your email and password." };
      // Load accounts for this realtor
      const accKey = `${ACCOUNTS_KEY_PREFIX}${realtorId}`;
      let realmAccounts = accounts;
      try {
        const raw = await AsyncStorage.getItem(accKey);
        if (raw) {
          const parsed = JSON.parse(raw) as ClientAccount[];
          if (Array.isArray(parsed)) realmAccounts = parsed;
        }
      } catch {}
      let account = realmAccounts.find((a) => a.email === e);
      let verdict = { ok: false, needsUpgrade: false };
      if (account) {
        verdict = await verifyPassword(e, password, account.pw);
        if (!verdict.ok) return { ok: false, error: "Incorrect password." };
      } else {
        // Not on this device (new phone, reinstall): check the server copy.
        const pwHash = await hashPassword(e, password);
        const remote = await verifyClientAccount(realtorId, e, pwHash);
        if (remote.status === "bad_password") return { ok: false, error: "Incorrect password." };
        if (remote.status === "locked") return { ok: false, error: "Too many attempts. Please wait 15 minutes and try again." };
        if (remote.status !== "ok")
          return { ok: false, error: "No account found. Create one to get started." };
        account = { email: e, pw: pwHash, clientId: remote.clientId, name: remote.name || e.split("@")[0], realtorId, createdAt: Date.now() };
        realmAccounts = [account, ...realmAccounts];
        try { await AsyncStorage.setItem(accKey, JSON.stringify(realmAccounts)); } catch {}
        verdict = { ok: true, needsUpgrade: false };
      }
      const found = account as ClientAccount;
      const seat = await claimClientSeat({
        realtorId,
        email: e,
        clientId: found.clientId,
        name: found.name,
      });
      if (!seat.ok) {
        return {
          ok: false,
          atCapacity: seat.reason === "limit",
          error: "This agent isn't accepting new clients right now.",
        };
      }
      // Backfill the server copy (after the seat claim, which it requires) so
      // accounts created before it existed work on other devices too.
      void hashPassword(e, password).then((pwHash) =>
        registerClientAccount({ realtorId, email: e, pwHash, clientId: found.clientId, name: found.name }));
      // Upgrade any legacy-hashed local account to SHA-256 on successful login.
      if (verdict.needsUpgrade) {
        try {
          const modern = await hashPassword(e, password);
          realmAccounts = realmAccounts.map((a) =>
            a.clientId === found.clientId ? { ...a, pw: modern } : a
          );
          await AsyncStorage.setItem(accKey, JSON.stringify(realmAccounts));
        } catch (err) {
          console.log("[auth] client hash upgrade", err);
        }
      }
      const next: Session = {
        email: e,
        role: "client",
        realtorId,
        clientId: found.clientId,
        name: found.name,
        iat: Date.now(),
      };
      setSession(next);
      setAccounts(realmAccounts);
      await persistSession(next);
      return { ok: true, clientId: found.clientId };
    },
    [accounts, persistSession]
  );

  const updateClientProfile = useCallback(
    async (patch: { name?: string }): Promise<void> => {
      if (!session || session.role !== "client" || !session.clientId) return;
      const nextAccounts = accounts.map((a) =>
        a.clientId === session.clientId
          ? { ...a, name: patch.name?.trim() || a.name }
          : a
      );
      setAccounts(nextAccounts);
      void persistAccounts(nextAccounts);
      const next: Session = { ...session, name: patch.name?.trim() || session.name };
      setSession(next);
      await persistSession(next);
    },
    [accounts, persistAccounts, persistSession, session]
  );

  const logout = useCallback(async () => {
    if (session?.role === "admin" && supabase) await supabase.auth.signOut();
    // Preview flags are per signed-in session; never carry them to the next person.
    setViewAsClient(false);
    setDemoViewMode(false);
    setSession(null);
    await persistSession(null);
  }, [persistSession, session?.role]);

  /** Setup unlocks an invitation; it never sends one to a client. */
  const unlockSharingCredentials = useCallback(async () => {
    if (session?.role !== "admin" || demoViewMode) throw new Error("Realtor setup is required.");
    const record = realtorCache.find(r => r.id === session.realtorId);
    if (!record) throw new Error("Your account is still loading.");
    if (record.client_code_enabled) return;
    const clientCode = record.client_code || Array.from(getRandomBytes(6), byte => String(byte % 10)).join("");
    if (supabase) {
      const { error } = await supabase.from("realtors")
        .update({ client_code: clientCode, client_code_enabled: true }).eq("id", record.id);
      if (error) throw error;
    }
    const next = realtorCache.map(r => r.id === record.id ? { ...r, client_code: clientCode, client_code_enabled: true } : r);
    await AsyncStorage.setItem(REALTOR_CACHE_KEY, JSON.stringify(next));
    setRealtorCache(next);
  }, [session, demoViewMode, realtorCache]);

  /** Get the current realtor record from cache. */
  const realtorRecord = session?.realtorId
    ? realtorCache.find((r) => r.id === session.realtorId) ?? null
    : null;

  const isAdmin = session?.role === "admin";
  const isClient = session?.role === "client";
  const isAuthenticated = !!session;
  const realtorIdVal = session?.realtorId ?? null;
  const currentClientId = session?.role === "client" ? session.clientId : undefined;

  return useMemo(() => ({
    session,
    hydrated,
    isAdmin,
    isClient,
    viewAsClient,
    demoViewMode,
    enterViewAsClient,
    exitViewAsClient,
    enterDemoView,
    exitDemoView,
    isAuthenticated,
    isPreviewAdmin: !!session?.preview,
    authBypassEnabled: AUTH_BYPASS_ENABLED,
    realtorId: realtorIdVal,
    realtorRecord,
    currentClientId,
    login,
    realtorSignup,
    realtorLogin,
    completeRealtorSignIn,
    previewAdmin,
    enterAuthBypass,
    exitPreview,
    clientSignup,
    clientLogin,
    updateClientProfile,
    logout,
    lookupRealtorByCode,
    unlockSharingCredentials,
  }), [
    session, hydrated, isAdmin, isClient, viewAsClient, demoViewMode,
    enterViewAsClient, exitViewAsClient, enterDemoView, exitDemoView,
    isAuthenticated, realtorIdVal, realtorRecord, currentClientId,
    login, realtorSignup, realtorLogin, completeRealtorSignIn, previewAdmin, enterAuthBypass, exitPreview,
    clientSignup, clientLogin, updateClientProfile, logout, lookupRealtorByCode, unlockSharingCredentials,
  ]);
});

