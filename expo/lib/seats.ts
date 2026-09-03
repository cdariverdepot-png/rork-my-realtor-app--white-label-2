import { supabase } from "@/lib/supabase";
import { FREE_SEAT_LIMIT, UNLIMITED, type PlanId } from "@/constants/plans";

/**
 * Client seat RPCs.
 *
 * Every one of these calls a SECURITY DEFINER function in Postgres (see
 * supabase/sql/seats.sql). The server counts and claims inside one
 * transaction, so the limit survives reinstalls, offline edits and two clients
 * redeeming the same code at the same moment. Nothing here is the enforcement
 * — it is the wire to it.
 */

export type SeatConnection = {
  clientKey: string;
  clientId: string;
  clientName: string;
  connectedAt: number;
};

export type SeatAttempt = {
  clientKey: string;
  clientName: string;
  attemptedAt: number;
};

export type SeatState = {
  plan: PlanId;
  /** -1 means unlimited. */
  limit: number;
  used: number;
  connections: SeatConnection[];
  attempts: SeatAttempt[];
};

export type ClaimResult =
  | { ok: true; reused: boolean; used: number; limit: number }
  /** The realtor is out of seats. This is the conversion moment. */
  | { ok: false; reason: "limit"; used: number; limit: number }
  /** Anything else — bad input, unknown realtor, or Supabase unreachable. */
  | { ok: false; reason: "error" };

export const EMPTY_SEAT_STATE: SeatState = {
  plan: "free",
  limit: FREE_SEAT_LIMIT,
  used: 0,
  connections: [],
  attempts: [],
};

function normKey(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

function asPlan(v: unknown): PlanId {
  return v === "pro" || v === "bespoke" ? v : "free";
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Claim a seat for a client joining a realtor's app.
 *
 * Returns `ok` for a genuinely new connection AND for a client who already
 * holds a seat (same person, new phone). Only a full house returns
 * `reason: "limit"`.
 *
 * If Supabase is unreachable we deliberately fail OPEN: a network blip must
 * never lock a paying realtor's real client out of the app. The next
 * successful call reconciles the count.
 */
export async function claimClientSeat(input: {
  realtorId: string;
  email: string;
  clientId: string;
  name: string;
}): Promise<ClaimResult> {
  const key = normKey(input.email);
  if (!supabase || !input.realtorId || !key) {
    return { ok: true, reused: false, used: 0, limit: UNLIMITED };
  }
  try {
    const { data, error } = await supabase.rpc("claim_client_seat", {
      p_realtor_id: input.realtorId,
      p_client_key: key,
      p_client_id: input.clientId,
      p_client_name: input.name,
    });
    if (error) {
      console.log("[seats] claim error", error.message);
      return { ok: true, reused: false, used: 0, limit: UNLIMITED };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    if (row.ok === true) {
      return {
        ok: true,
        reused: row.reused === true,
        used: asNumber(row.used, 0),
        limit: asNumber(row.limit, FREE_SEAT_LIMIT),
      };
    }
    if (row.reason === "limit") {
      return {
        ok: false,
        reason: "limit",
        used: asNumber(row.used, FREE_SEAT_LIMIT),
        limit: asNumber(row.limit, FREE_SEAT_LIMIT),
      };
    }
    // Unknown realtor / invalid input: let the local flow decide, don't block.
    console.log("[seats] claim refused", String(row.reason ?? "unknown"));
    return { ok: true, reused: false, used: 0, limit: UNLIMITED };
  } catch (e) {
    console.log("[seats] claim exception", e);
    return { ok: true, reused: false, used: 0, limit: UNLIMITED };
  }
}

/** Realtor disconnects a client. Frees the seat immediately. */
export async function releaseClientSeat(
  realtorId: string,
  email: string
): Promise<boolean> {
  const key = normKey(email);
  if (!supabase || !realtorId || !key) return false;
  try {
    const { data, error } = await supabase.rpc("release_client_seat", {
      p_realtor_id: realtorId,
      p_client_key: key,
    });
    if (error) {
      console.log("[seats] release error", error.message);
      return false;
    }
    return (data as Record<string, unknown> | null)?.ok === true;
  } catch (e) {
    console.log("[seats] release exception", e);
    return false;
  }
}

/** Everything the dashboard needs about seats, in one round trip. */
export async function fetchSeatState(realtorId: string): Promise<SeatState | null> {
  if (!supabase || !realtorId) return null;
  try {
    const { data, error } = await supabase.rpc("realtor_seat_state", {
      p_realtor_id: realtorId,
    });
    if (error) {
      console.log("[seats] state error", error.message);
      return null;
    }
    const row = (data ?? {}) as Record<string, unknown>;
    if (row.ok !== true) return null;
    return {
      plan: asPlan(row.plan),
      limit: asNumber(row.limit, FREE_SEAT_LIMIT),
      used: asNumber(row.used, 0),
      connections: Array.isArray(row.connections)
        ? (row.connections as SeatConnection[])
        : [],
      attempts: Array.isArray(row.attempts) ? (row.attempts as SeatAttempt[]) : [],
    };
  } catch (e) {
    console.log("[seats] state exception", e);
    return null;
  }
}

/** Mark turn-away notices as read so the banner retires. */
export async function markAttemptsSeen(realtorId: string): Promise<void> {
  if (!supabase || !realtorId) return;
  try {
    await supabase.rpc("mark_attempts_seen", { p_realtor_id: realtorId });
  } catch (e) {
    console.log("[seats] mark seen exception", e);
  }
}
