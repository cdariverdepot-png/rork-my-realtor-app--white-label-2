import { ensureSupabaseSession, supabase } from "@/lib/supabase";
export type BillingOffer = { interval: "month" | "year"; total: string; amount: number; currency: string };
export type BillingResponse = { configured: boolean; mode?: "test"; prices?: { month: BillingOffer; year: BillingOffer; savings: string | null }; url?: string; error?: string };
export async function billingRequest(realtorId: string, action: "status" | "checkout" | "refresh" | "cancel" | "resume" | "manage", interval?: "month" | "year"): Promise<BillingResponse> {
  if (!supabase) throw new Error("Billing is unavailable. Please try again later.");
  await ensureSupabaseSession();
  const { data, error } = await supabase.functions.invoke("billing", { body: { realtorId, action, interval } });
  if (error || !data || data.error) throw new Error(data?.error || "Billing is unavailable. Your records have been retained.");
  return data;
}
export function verifiedBillingURL(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid billing link.");
  const url = new URL(value);
  if (url.protocol !== "https:" || !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)) throw new Error("Invalid billing link.");
  return url.href;
}
export async function exportRealtorData(realtorId: string): Promise<unknown> {
  if (!supabase) throw new Error("Export is unavailable.");
  const { data, error } = await supabase.rpc("export_realtor_data", { p_realtor_id: realtorId });
  if (error || !data) throw new Error("Export is unavailable. Please try again.");
  return data;
}
