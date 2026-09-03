import { useCallback, useEffect, useRef, useState } from "react";
import { kvGet, kvSet, kvSubscribe, recordKvWrite, type KvRow } from "./kvStore";

/**
 * Generic durable sync for a single JSON blob keyed in Supabase `app_kv`.
 *
 * Caller owns local state and a monotonically increasing `rev` (usually
 * Date.now() bumped on every local change). On mount this:
 *   1. fetches the row from kv,
 *   2. subscribes to realtime UPDATE/INSERT events,
 *   3. invokes `onRemote` whenever a newer remote version is observed.
 *
 * Whenever `rev` increases past what was last pushed, the local value is
 * upserted to kv. Failures (e.g. missing table, no network) are logged and
 * the app continues to function in local-only mode.
 */
export type KvRemoteMeta = {
  /** True on the very first fetch after mount (cold start / login). Consumers
   *  should bypass any local-rev guards in this case so the server is
   *  treated as the source of truth. */
  initial: boolean;
  /** True when triggered by an explicit manual refresh (e.g. pull-to-refresh).
   *  Also bypasses the local-rev guard so stale local state can't win. */
  forced: boolean;
};

export function useKvSync<T>(args: {
  key: string;
  enabled: boolean;
  value: T;
  rev: number;
  onRemote: (row: KvRow<T>, meta: KvRemoteMeta) => void;
}): { refresh: () => Promise<void> } {
  const { key, enabled, value, rev, onRemote } = args;

  const onRemoteRef = useRef<(row: KvRow<T>, meta: KvRemoteMeta) => void>(onRemote);
  useEffect(() => {
    onRemoteRef.current = onRemote;
  }, [onRemote]);

  const valueRef = useRef<T>(value);
  const revRef = useRef<number>(rev);
  useEffect(() => {
    valueRef.current = value;
    revRef.current = rev;
  }, [value, rev]);

  const lastPushedRevRef = useRef<number>(-1);
  const [initialFetched, setInitialFetched] = useState<boolean>(false);

  // Initial fetch + realtime subscription.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setInitialFetched(false);
    (async () => {
      const row = await kvGet<T>(key);
      if (cancelled) return;
      if (row) onRemoteRef.current(row, { initial: true, forced: true });
      setInitialFetched(true);
    })();
    const unsub = kvSubscribe<T>(key, (row) => {
      onRemoteRef.current(row, { initial: false, forced: false });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [enabled, key]);

  // Push local updates to kv when rev increases — but only after the initial
  // fetch has completed, so a fresh device can't race-overwrite an existing
  // remote row with its own local seed.
  //
  // Every short-circuit is logged to the write log so we can finally see WHY
  // a save didn't reach Supabase (sync is disabled, initial fetch hasn't
  // landed, rev is stale, etc.) — previously these were invisible.
  useEffect(() => {
    if (!enabled) {
      if (rev > 0) {
        recordKvWrite({
          at: Date.now(),
          key,
          rev,
          sizeKb: 0,
          status: "skipped",
          detail: "sync disabled (supabase client missing or table absent)",
        });
      }
      return;
    }
    if (!initialFetched) {
      if (rev > 0) {
        recordKvWrite({
          at: Date.now(),
          key,
          rev,
          sizeKb: 0,
          status: "skipped",
          detail: "waiting for initial server fetch before pushing",
        });
      }
      return;
    }
    if (rev <= 0) return;
    if (rev <= lastPushedRevRef.current) return;
    lastPushedRevRef.current = rev;
    void kvSet<T>(key, value, rev);
  }, [enabled, initialFetched, key, value, rev]);

  // Manual refetch — useful for pull-to-refresh and periodic polling when
  // the realtime channel hasn't delivered an update.
  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    const row = await kvGet<T>(key);
    if (row) onRemoteRef.current(row, { initial: false, forced: true });
  }, [enabled, key]);

  // Lightweight polling fallback in case the realtime channel is dropped.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      void refresh();
    }, 20000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { refresh };
}
