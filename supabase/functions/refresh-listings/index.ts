import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchHtml } from "./publicPage.ts";
import { isDue, observeListing, mergeObservations, type SyncListing, type Observation } from "./sync.ts";
import { runSourceSync } from "./sourceHandler.ts";
import { propertyDetailRequest, enrichPublicProperty, type FetchHtml } from "../analyze-realtor-build/listingDiscovery.ts";
import { createImportProgress, respondWithProgress, type ImportEvent } from "../analyze-realtor-build/progress.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-listing-sync-token" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO = "00000000-0000-0000-0000-000000000001";

async function sameSecret(a: string, b: string) {
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let mismatch = 0; for (let i = 0; i < x.length; i++) mismatch |= x[i] ^ y[i]; return mismatch === 0;
}

Deno.serve(req => req.method === "POST" ? respondWithProgress(req, cors, sink => handle(req, sink)) : handle(req));

async function handle(req: Request, sink?: (event: ImportEvent) => void): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply({ ok: false, error: "Listing sync is not configured." }, 503);
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const secret = Deno.env.get("LISTING_SYNC_TOKEN");
    const provided = req.headers.get("x-listing-sync-token");
    const scheduled = !!secret && !!provided && await sameSecret(secret, provided);
    if (provided && !scheduled) return reply({ ok: false, error: "Invalid sync credential." }, 401);
    let body: { realtorId?: string; listingId?: string; mode?: string; url?: string; sourceId?: string };
    try { body = await req.json(); } catch { return reply({ ok: false, error: "Use a JSON request." }, 400); }
    if (!body || typeof body !== "object") return reply({ ok: false, error: "Use a JSON request." }, 400);
    let realtorId: string;
    if (scheduled) {
      if (!body.realtorId || !UUID.test(body.realtorId) || body.realtorId === DEMO) return reply({ ok: false, error: "Invalid realtor." }, 400);
      const { data, error } = await sb.from("realtors").select("id").eq("id", body.realtorId).maybeSingle();
      if (error) throw error;
      if (!data) return reply({ ok: false, error: "Realtor not found." }, 404);
      realtorId = data.id;
    } else {
      const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!token) return reply({ ok: false, error: "Sign in to sync listings." }, 401);
      const { data: auth, error: authError } = await sb.auth.getUser(token);
      if (authError || !auth?.user || (!auth.user.is_anonymous && !auth.user.email_confirmed_at)) return reply({ ok: false, error: "Your session has expired. Sign in again to import listings." }, 401);
      const { data, error } = await sb.from("realtors").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
      if (error) throw error;
      if (!data || data.id === DEMO || (body.realtorId && body.realtorId !== data.id)) return reply({ ok: false, error: "This session does not own the selected realtor account. Sign in to that account to import listings." }, 403);
      realtorId = data.id;
    }
    // Listing import is part of app setup/editing, not a paid service action.
    // Subscription entitlement must never block entering or building the app;
    // paid access is enforced only at explicit service-action boundaries.
    if (!body.listingId && body.mode !== "legacy") {
      const progress = createImportProgress(sink);
      const result = await runSourceSync(sb, realtorId, body, fetchHtml, scheduled, progress);
      if (result) {
        const timings = progress.timings();
        console.log("[listing-sync] timings", { mode: body.mode ?? "sync", status: result.status ?? 200, ...timings });
        return reply({ ...result.body, timings }, result.status);
      }
    }
    const collectionKey = realtorId + ":listings.v2";
    const read = async () => {
      const { data, error } = await sb.from("app_kv").select("value,rev").eq("key", collectionKey).maybeSingle();
      if (error) throw error;
      return data as { value: { items?: SyncListing[]; [key: string]: unknown }; rev: number } | null;
    };
    const initial = await read();
    if (!initial) return reply({ ok: true, refreshed: 0, checked: 0 });
    const now = Date.now(), started = now;
    const items = Array.isArray(initial.value?.items) ? initial.value.items : [];
    const targets = items.filter(item => item.sourceUrl && (!body.listingId || item.id === body.listingId) &&
      (body.listingId || !item.sourceId) &&
      (scheduled ? isDue(item, now) : !item.lastSyncAttemptAt || now - item.lastSyncAttemptAt >= 60_000))
      .sort((a, b) => (a.nextSyncAt ?? 0) - (b.nextSyncAt ?? 0)).slice(0, 10);
    if (body.listingId && !items.some(item => item.id === body.listingId && item.sourceUrl)) return reply({ ok: false, error: "No source URL for that listing." }, 404);
    if (!targets.length) return reply({ ok: true, refreshed: 0, checked: 0, message: "Already checked recently." });
    const results = new Map<string, Observation>();
    const pages = new Map<string, Promise<Awaited<ReturnType<typeof fetchHtml>>>>();
    const cachedFetch:FetchHtml=(uri,options)=>{const cacheKey=uri+'|'+!!options?.fragment;if(!pages.has(cacheKey))pages.set(cacheKey,fetchHtml(uri,options));return pages.get(cacheKey)!;};
    for (const item of targets) {
      if (Date.now() - started > 45_000) break;
      try {
        const request=propertyDetailRequest(item.sourceUrl!);
        const page = await cachedFetch(request.url,{fragment:request.fragment});
        const observation=observeListing(item, page.html, page.finalUrl, Date.now());
        if(observation.property)observation.property=await enrichPublicProperty(observation.property,cachedFetch,page);
        results.set(item.id, observation);
      } catch (error) {
        results.set(item.id, { sourceUrl: item.sourceUrl!, checkedAt: Date.now(), error: error instanceof Error ? error.message : "Could not read the source. We'll retry." });
      }
    }
    // Re-read and compare revisions; preserve editor saves and deleted homes.
    for (let retry = 0; retry < 3; retry++) {
      const latest = await read();
      if (!latest) return reply({ ok: true, checked: results.size, refreshed: 0 });
      const current = Array.isArray(latest.value?.items) ? latest.value.items : [];
      const merged = mergeObservations(current, results);
      const rev = Math.max(Number(latest.rev ?? 0) + 1, Date.now());
      const { data: saved, error } = await sb.from("app_kv").update({ value: { ...latest.value, items: merged }, rev,
        updated_at: new Date().toISOString() }).eq("key", collectionKey).eq("rev", latest.rev).select("key");
      if (error) throw error;
      if (!saved?.length) continue;
      const failed = [...results.values()].filter(result => result.error).length;
      const unconfirmed = [...results.values()].filter(result => !result.error && !result.status).length;
      const statusChanges = merged.flatMap(item => {
        const prior = current.find(p => p.id === item.id);
        return prior && item.status !== prior.status ? [{ id: item.id, from: prior.status, to: item.status }] : [];
      });
      return reply({ ok: true, checked: results.size, refreshed: results.size - failed, failed, unconfirmed, statusChanges,
        ...(body.listingId && (failed || unconfirmed) ? { warning: failed ? results.get(body.listingId)?.error : "The details were checked, but the source did not confirm listing status." } : {}) });
    }
    return reply({ ok: false, error: "Your listings changed during sync. Please retry." }, 409);
  } catch (error) {
    console.error("[listing-sync]", error instanceof Error ? error.message : "Sync failed");
    return reply({ ok: false, error: "Listing sync could not finish. Please retry." }, 500);
  }
}
