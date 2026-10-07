import { supabase } from "@/lib/supabase";

export type ServiceEntitlement = "active" | "inactive" | "unknown";

/**
 * Action-level entitlement check. It never controls navigation or reading.
 * Unknown is deliberately distinct from inactive: callers may keep the app
 * usable while refusing a paid write until the server can verify service.
 */
export async function serviceEntitlement(realtorId: string | null | undefined): Promise<ServiceEntitlement> {
  if (!realtorId || !supabase) return "unknown";
  try {
    const { data, error } = await supabase.rpc("experience_access", { p_realtor_id: realtorId });
    if (error || typeof data?.available !== "boolean") return "unknown";
    return data.available ? "active" : "inactive";
  } catch {
    return "unknown";
  }
}
