import { createClient } from "npm:@supabase/supabase-js@2";
import { appleConfig, notificationSnapshot, transactionSnapshot } from "./core.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store" } });

/**
 * Apple subscription entitlement sync. Apple handles purchase, renewal, cancellation and billing.
 *  - App (signed-in realtor): POST { action: "sync", signedTransactions: [jws...] } after purchase/restore.
 *  - App Store Server Notifications V2: POST { signedPayload } (verified by Apple's certificate chain).
 * Only a verified snapshot is stored; nothing here charges money.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const config = appleConfig((k) => Deno.env.get(k));
  if (!url || !key) return reply({ error: "Subscription service is not configured." }, 503);
  if (!config) return reply({ error: "App Store subscriptions are not configured yet." }, 503);
  const db = createClient(url, key);
  let body: any;
  try { body = await request.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  if (!body || typeof body !== "object") return reply({ error: "Invalid request." }, 400);

  const apply = async (realtorId: string, snapshot: unknown) => {
    const { data, error } = await db.rpc("apple_apply", { p_realtor_id: realtorId, p_snapshot: snapshot });
    if (error) throw new Error("Could not save subscription status.");
    return data;
  };

  // Apple server notification.
  if (typeof body.signedPayload === "string") {
    let parsed;
    try { parsed = await notificationSnapshot(body.signedPayload, config); } catch { return reply({ error: "Invalid notification." }, 400); }
    if (!parsed) return reply({ ok: true, ignored: true });
    const { data: owner } = await db.rpc("apple_realtor", { p_original_transaction_id: parsed.snapshot.original_transaction_id });
    const realtorId = typeof owner === "string" ? owner : parsed.appAccountToken;
    if (!realtorId) return reply({ ok: true, unmatched: true });
    try { return reply({ ok: true, result: await apply(realtorId, parsed.snapshot) }); } catch (e) { return reply({ error: (e as Error).message }, 500); }
  }

  // Signed-in realtor syncing purchases/restores from the device.
  if (body.action !== "sync" || !Array.isArray(body.signedTransactions) || body.signedTransactions.length === 0 || body.signedTransactions.length > 20) {
    return reply({ error: "Invalid request." }, 400);
  }
  const jwt = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return reply({ error: "Sign in is required." }, 401);
  const { data: auth, error: authError } = await db.auth.getUser(jwt);
  if (authError || !auth.user || auth.user.is_anonymous) return reply({ error: "Sign in as the realtor to restore purchases." }, 401);
  const { data: realtor } = await db.from("realtors").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!realtor) return reply({ error: "Only the realtor account can manage this subscription." }, 403);
  const results: unknown[] = [];
  for (const jws of body.signedTransactions) {
    try {
      const { snapshot, appAccountToken } = await transactionSnapshot(String(jws), config);
      // Purchases are bound to the realtor at purchase time; a receipt cannot unlock another account.
      if (appAccountToken && appAccountToken !== realtor.id.toLowerCase()) { results.push({ ok: false, reason: "other_account" }); continue; }
      results.push(await apply(realtor.id, snapshot));
    } catch (e) {
      results.push({ ok: false, reason: (e as Error).message });
    }
  }
  return reply({ ok: results.some((r: any) => r?.ok === true), results });
});
