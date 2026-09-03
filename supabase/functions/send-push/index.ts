// Supabase Edge Function — send-push
//
// Delivers an Expo push notification to a realtor's devices or to some/all of
// their clients' devices. This is what makes notifications arrive on a locked
// phone; without it the app can only post local notifications to a device that
// is already awake with the app open.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
//
// No third-party keys required — Expo's push service is free and needs no
// credentials for tokens it issued itself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Audience =
  | { kind: "all-clients" }
  | { kind: "clients"; clientIds: string[] }
  | { kind: "realtor" };

type Payload = {
  realtorId: string;
  audience: Audience;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type TokenRow = {
  token: string;
  role: string;
  client_id: string | null;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const { realtorId, audience, title, body } = payload;
  if (!realtorId || !title || !body || !audience?.kind) {
    return json(400, { ok: false, error: "Missing realtorId, audience, title or body" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json(500, { ok: false, error: "Function not configured" });

  const db = createClient(url, key);

  // Resolve the audience to a concrete list of device tokens.
  let query = db
    .from("push_tokens")
    .select("token, role, client_id")
    .eq("realtor_id", realtorId);

  if (audience.kind === "realtor") {
    query = query.eq("role", "admin");
  } else {
    query = query.eq("role", "client");
    if (audience.kind === "clients") {
      const ids = Array.isArray(audience.clientIds) ? audience.clientIds.filter(Boolean) : [];
      // An explicit but empty recipient list means "nobody", not "everybody".
      if (ids.length === 0) return json(200, { ok: true, sent: 0, note: "no recipients" });
      query = query.in("client_id", ids);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.log("[send-push] token query failed", error.message);
    return json(500, { ok: false, error: "Could not load devices" });
  }

  const tokens = Array.from(
    new Set(
      ((data ?? []) as TokenRow[])
        .map((r) => r.token)
        .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken"))
    )
  );
  if (tokens.length === 0) return json(200, { ok: true, sent: 0, note: "no devices" });

  // Expo accepts up to 100 messages per request.
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) chunks.push(tokens.slice(i, i + 100));

  let sent = 0;
  const invalid: string[] = [];

  for (const chunk of chunks) {
    const messages = chunk.map((to) => ({
      to,
      title,
      body,
      sound: "default",
      priority: "high",
      channelId: "default",
      data: payload.data ?? {},
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      });
      const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      (out.data ?? []).forEach((ticket, i) => {
        if (ticket.status === "ok") sent += 1;
        else if (ticket.details?.error === "DeviceNotRegistered") invalid.push(chunk[i]);
      });
    } catch (e) {
      console.log("[send-push] expo request failed", String(e));
    }
  }

  // Reap tokens Expo told us are dead, so the list does not rot over time.
  if (invalid.length > 0) {
    const { error: delErr } = await db.from("push_tokens").delete().in("token", invalid);
    if (delErr) console.log("[send-push] cleanup failed", delErr.message);
  }

  return json(200, { ok: true, sent, pruned: invalid.length });
});
