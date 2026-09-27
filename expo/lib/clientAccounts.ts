import { supabase } from "@/lib/supabase";

/**
 * Server copy of client accounts (supabase/sql/client-accounts.sql), so a
 * client can sign in on a new phone. Local accounts stay the first stop; if
 * the SQL hasn't been run or Supabase is unreachable these quietly report
 * "unavailable" and the app behaves exactly as before.
 */
export async function registerClientAccount(input: {
  realtorId: string; email: string; pwHash: string; clientId: string; name: string;
}): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc("register_client_account", {
      p_realtor_id: input.realtorId, p_email: input.email, p_pw_hash: input.pwHash,
      p_client_id: input.clientId, p_name: input.name,
    });
    if (error) console.log("[clientAccounts] register", error.message);
  } catch (e) {
    console.log("[clientAccounts] register", e);
  }
}

export type VerifyResult =
  | { status: "ok"; clientId: string; name: string }
  | { status: "not_found" | "bad_password" | "unavailable" };

export async function verifyClientAccount(realtorId: string, email: string, pwHash: string): Promise<VerifyResult> {
  if (!supabase) return { status: "unavailable" };
  try {
    const { data, error } = await supabase.rpc("verify_client_account", {
      p_realtor_id: realtorId, p_email: email, p_pw_hash: pwHash,
    });
    if (error) return { status: "unavailable" };
    const row = (data ?? {}) as Record<string, unknown>;
    if (row.ok === true && typeof row.client_id === "string") {
      return { status: "ok", clientId: row.client_id, name: typeof row.name === "string" ? row.name : "" };
    }
    if (row.reason === "bad_password") return { status: "bad_password" };
    if (row.reason === "not_found") return { status: "not_found" };
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
