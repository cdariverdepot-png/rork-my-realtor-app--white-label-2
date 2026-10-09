import { supabase } from "@/lib/supabase";

/** Owner-scoped JSON export of the realtor's saved records. Available regardless of subscription state. */
export async function exportRealtorData(realtorId: string): Promise<unknown> {
  if (!supabase) throw new Error("Export is unavailable.");
  const { data, error } = await supabase.rpc("export_realtor_data", { p_realtor_id: realtorId });
  if (error || !data) throw new Error("Export is unavailable. Please try again.");
  return data;
}
