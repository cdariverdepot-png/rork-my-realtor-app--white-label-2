import { supabase } from "@/lib/supabase";
import { FREE_SEAT_LIMIT, type PlanId } from "@/constants/plans";
export type SeatConnection = { clientKey: string; clientId: string; clientName: string; connectedAt: number };
export type SeatAttempt = { clientKey: string; clientName: string; attemptedAt: number };
export type SeatState = {
  plan: PlanId; limit: number; used: number; connections: SeatConnection[]; attempts: SeatAttempt[];
  active: boolean; status: string; interval: "month" | "year" | null; serviceEnd: string | null;
  renewalAt: string | null; cancelAtPeriodEnd: boolean; paymentIssue: boolean; everPaid: boolean;
  /** Server-reported reason when service is inactive; never inferred as a payment failure. */
  inactiveReason?: InactiveReason | null;
  /** End of Apple's introductory free trial, when the current period is the trial. */
  trialEnd?: string | null;
};
/** Reasons derived only from verified Apple state; billing_retry only when Apple reports it. */
export type InactiveReason = "not_subscribed" | "billing_retry" | "refunded" | "canceled" | "expired";
export type ClaimResult = { ok: true; reused: boolean; used: number; limit: number } | { ok: false; reason: "limit" | "inactive" | "error"; used?: number; limit?: number };
export const EMPTY_SEAT_STATE: SeatState = { plan: "evaluation", limit: FREE_SEAT_LIMIT, used: 0, connections: [], attempts: [], active: false, status: "unavailable", interval: null, serviceEnd: null, renewalAt: null, cancelAtPeriodEnd: false, paymentIssue: false, everPaid: false, inactiveReason: null, trialEnd: null };
/** Compatibility call after authentication. Never grants access on a network error. */
export async function claimClientSeat(input: { realtorId: string; email: string; clientId: string; name: string }): Promise<ClaimResult> {
  if (!supabase || !input.realtorId) return { ok: false, reason: "error" };
  try {
    const { data, error } = await supabase.rpc("claim_client_seat", { p_realtor_id: input.realtorId, p_client_key: input.email, p_client_id: input.clientId, p_client_name: input.name });
    if (error) return { ok: false, reason: "error" };
    if (data?.ok === true && Number.isInteger(data.used) && Number.isInteger(data.limit)) return { ok: true, reused: data.reused === true, used: data.used, limit: data.limit };
    return { ok: false, reason: data?.reason === "limit" ? "limit" : data?.reason === "inactive" ? "inactive" : "error" };
  } catch { return { ok: false, reason: "error" }; }
}
export async function releaseClientSeat(realtorId: string, clientId: string): Promise<boolean> {
  if (!supabase || !realtorId || !clientId) return false;
  try { const { data, error } = await supabase.rpc("disconnect_client", { p_realtor_id: realtorId, p_client_id: clientId }); return !error && data?.ok === true; } catch { return false; }
}
export async function fetchSeatState(realtorId: string): Promise<SeatState | null> {
  if (!supabase || !realtorId) return null;
  try {
    const { data: r, error } = await supabase.rpc("realtor_seat_state", { p_realtor_id: realtorId });
    if (error || r?.ok !== true || !Number.isInteger(r.used) || !Number.isInteger(r.limit) || typeof r.active !== "boolean") return null;
    return { ...EMPTY_SEAT_STATE, ...r, plan: r.plan === "pro" ? "pro" : "evaluation", connections: Array.isArray(r.connections) ? r.connections : [], attempts: [] };
  } catch { return null; }
}
export async function markAttemptsSeen(_realtorId: string): Promise<void> { /* No unauthenticated attempts consume seats. */ }
