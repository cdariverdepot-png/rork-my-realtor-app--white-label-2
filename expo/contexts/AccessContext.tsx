import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isKvEnabled, kvGet } from "@/lib/kvStore";
import { useKvSync } from "@/lib/kvSync";
import { useAuth, type RealtorRecord } from "@/contexts/AuthContext";

/**
 * AccessContext — resolves codes to realtor IDs for multi-tenant routing.
 *
 * A client enters a 6-char code. We look it up in the Supabase `realtors`
 * table (or local cache) to find the matching realtor, then route the
 * session to that realtor's scoped data.
 *
 * Realtor admins sign in with email/password directly — no access code needed.
 */

export type AccessConfig = {
  clientCodeEnabled: boolean;
  clientCode: string;
  updatedAt: number;
};

export type CodeResult =
  | { role: "admin"; realtorId: string; record: RealtorRecord }
  | { role: "client"; realtorId: string; record: RealtorRecord }
  | { role: "invalid" };

const STORAGE_KEY_PREFIX = "myrealtor.access.";

const der = (s: string): string => {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const n = alpha.length;
  let h1 = 2166136261 >>> 0;
  let h2 = 2216829733 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
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
};

function normalize(code: string): string {
  return code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export const [AccessProvider, useAccess] = createContextHook(() => {
  const { realtorId, lookupRealtorByCode, realtorRecord } = useAuth();
  const [config, setConfig] = useState<AccessConfig>({
    clientCodeEnabled: true,
    clientCode: "",
    updatedAt: 0,
  });
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [rev, setRev] = useState<number>(0);
  const revRef = useRef<number>(0);
  const configRef = useRef<AccessConfig>(config);

  const storageKey = realtorId
    ? `${STORAGE_KEY_PREFIX}${realtorId}`
    : STORAGE_KEY_PREFIX + "anon";

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Load access config for the current realtor
  useEffect(() => {
    if (!realtorId) {
      setHydrated(true);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (mounted && raw) {
          const parsed = JSON.parse(raw) as Partial<AccessConfig>;
          setConfig((prev) => ({ ...prev, ...parsed }));
        }
        // Also set client code from realtor record
        if (realtorRecord?.client_code) {
          setConfig((prev) =>
            prev.clientCode
              ? prev
              : {
                  ...prev,
                  clientCode: realtorRecord.client_code,
                  clientCodeEnabled: realtorRecord.client_code_enabled ?? true,
                }
          );
        }
      } catch (e) {
        console.log("[access] hydrate error", e);
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [realtorId, realtorRecord, storageKey]);

  const persist = useCallback(
    async (next: AccessConfig) => {
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      } catch (e) {
        console.log("[access] persist", e);
      }
    },
    [storageKey]
  );

  const update = useCallback(
    (mutator: (current: AccessConfig) => AccessConfig) => {
      const next = { ...mutator(configRef.current), updatedAt: Date.now() };
      const nextRev = Math.max(revRef.current, Date.now());
      revRef.current = nextRev;
      setRev(nextRev);
      setConfig(next);
      void persist(next);
    },
    [persist]
  );

  const setClientCodeEnabled = useCallback(
    (enabled: boolean) => {
      update((c) => ({ ...c, clientCodeEnabled: enabled }));
      // Also update in Supabase if available
      if (supabase && realtorId) {
        const sb = supabase;
        void (async () => {
          try {
            const { error } = await sb
              .from("realtors")
              .update({ client_code_enabled: enabled })
              .eq("id", realtorId);
            if (error) console.log("[access] supabase update error", error.message);
          } catch (e) {
            console.log("[access] supabase update exception", e);
          }
        })();
      }
    },
    [update, realtorId]
  );

  /**
   * Validates an entered code by looking it up against Supabase `realtors`.
   * Returns the role + realtorId, or "invalid".
   */
  const validateCode = useCallback(
    async (input: string): Promise<CodeResult> => {
      const code = normalize(input);
      if (!code) return { role: "invalid" };

      // Look up the code in Supabase / local cache
      const record = await lookupRealtorByCode(code);
      if (!record) return { role: "invalid" };

      // Check if this is the realtor's own code (for admin access)
      // Realtors also sign in with email/password, but the code can be a shortcut
      // For now, any valid code routes to client path
      // The realtor admin path is via email/password in the portal

      return {
        role: "client",
        realtorId: record.id,
        record,
      };
    },
    [lookupRealtorByCode]
  );

  /** Force a fresh lookup from Supabase. */
  const refresh = useCallback(async (): Promise<void> => {
    // No-op for now — lookupRealtorByCode already tries Supabase first
  }, []);

  return {
    hydrated,
    clientCodeEnabled: config.clientCodeEnabled,
    clientCode: realtorRecord?.client_code ?? config.clientCode,
    updatedAt: config.updatedAt,
    setClientCodeEnabled,
    validateCode,
    refresh,
    publishClientCode: () => {},
    setClientCode: () => {},
    regenerateClientCode: () => {},
  };
});
