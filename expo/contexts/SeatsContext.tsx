import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAuth, DEMO_REALTOR_ID } from "@/contexts/AuthContext";
import {
  EMPTY_SEAT_STATE,
  fetchSeatState,
  markAttemptsSeen,
  releaseClientSeat,
  type SeatAttempt,
  type SeatConnection,
  type SeatState,
} from "@/lib/seats";
import { FREE_SEAT_LIMIT, isUnlimited, type PlanId } from "@/constants/plans";

/**
 * SeatsContext — the app's mirror of the server's seat ledger.
 *
 * This never decides anything. Postgres owns the count (see
 * supabase/sql/seats.sql); everything here exists so the dashboard can show
 * "2 of 3 used" and disable the right buttons without waiting on a round trip.
 * If this context and the server ever disagree, the server wins on the next
 * refresh — and on the claim itself, which is the only moment that matters.
 */
export const [SeatsProvider, useSeats] = createContextHook(() => {
  const { realtorId, isAdmin, demoViewMode } = useAuth();

  const [state, setState] = useState<SeatState>(EMPTY_SEAT_STATE);
  const [loading, setLoading] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);
  const inFlight = useRef<string | null>(null);
  const scope = useRef(realtorId);
  scope.current = realtorId;
  const stateScope = useRef<string | null>(null);
  const verified = loaded && stateScope.current === realtorId;

  /** The showcase realtor is exempt — it is a demo, not a customer. */
  const isDemoRealtor = !realtorId || realtorId === DEMO_REALTOR_ID;
  const tracked = isAdmin && !demoViewMode && !isDemoRealtor;

  const refresh = useCallback(async (): Promise<void> => {
    if (!realtorId || inFlight.current === realtorId) return;
    const requestedScope = realtorId;
    inFlight.current = requestedScope;
    setLoading(true);
    try {
      const next = await fetchSeatState(realtorId);
      if (scope.current !== requestedScope) return;
      if (next) {
        stateScope.current = requestedScope;
        setState(next);
        setLoaded(true);
      }
    } finally {
      if (inFlight.current === requestedScope) inFlight.current = null;
      if (scope.current === requestedScope) setLoading(false);
    }
  }, [realtorId]);

  // Reset hard whenever the account changes so one realtor's count can never
  // be shown under another's name.
  useEffect(() => {
    setState(EMPTY_SEAT_STATE);
    setLoaded(false);
  }, [realtorId]);

  useEffect(() => {
    if (!tracked) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const listener = AppState.addEventListener("change", (value) => { if (value === "active") void refresh(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [tracked, refresh]);

  /**
   * Disconnect a client. The seat frees up immediately, and the person can
   * rejoin later if there is room — their old connection row is reused rather
   * than replaced.
   */
  const disconnect = useCallback(
    async (clientId: string): Promise<boolean> => {
      if (!realtorId) return false;
      const ok = await releaseClientSeat(realtorId, clientId);
      if (ok) await refresh();
      return ok;
    },
    [realtorId, refresh]
  );

  /** Realtor has read the "someone was turned away" notice. */
  const acknowledgeAttempts = useCallback(async (): Promise<void> => {
    if (!realtorId) return;
    setState((prev) => ({ ...prev, attempts: [] }));
    await markAttemptsSeen(realtorId);
  }, [realtorId]);

  /** Is this roster contact an actual connected client? */
  const connectedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of state.connections) set.add(c.clientId);
    return set;
  }, [state.connections]);

  const isConnected = useCallback(
    (clientId: string): boolean => connectedKeys.has(clientId),
    [connectedKeys]
  );

  const active = !tracked || (verified && state.active && (!state.everPaid || (state.serviceEnd !== null && Date.parse(state.serviceEnd) > Date.now())));
  const limit = tracked ? (verified ? active ? state.limit : 0 : FREE_SEAT_LIMIT) : -1;
  const used = tracked && verified ? state.used : 0;
  const unlimited = isUnlimited(limit);
  const remaining = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);
  const atLimit = tracked && !unlimited && used >= limit;

  const plan: PlanId = verified ? state.plan : "evaluation";
  const connections: SeatConnection[] = verified ? state.connections : [];
  const attempts: SeatAttempt[] = tracked ? state.attempts : [];

  return useMemo(
    () => ({
      /** True only when this account is actually metered. */
      tracked,
      active,
      status: verified ? active ? state.status : "inactive" : "unavailable",
      everPaid: verified && state.everPaid,
      serviceEnd: verified ? state.serviceEnd : null,
      renewalAt: verified ? state.renewalAt : null,
      interval: verified ? state.interval : null,
      cancelAtPeriodEnd: verified && state.cancelAtPeriodEnd,
      paymentIssue: verified && state.paymentIssue,
      plan,
      /** -1 when unlimited. */
      limit,
      used,
      remaining,
      unlimited,
      atLimit,
      connections,
      attempts,
      loading,
      loaded: verified,
      isConnected,
      refresh,
      disconnect,
      acknowledgeAttempts,
      /** For copy like "2 of 3 client invitations used." */
      freeLimit: FREE_SEAT_LIMIT,
    }),
    [
      active, verified, state, tracked, plan, limit, used, remaining, unlimited, atLimit, connections,
      attempts, loading, loaded, isConnected, refresh, disconnect,
      acknowledgeAttempts,
    ]
  );
});
