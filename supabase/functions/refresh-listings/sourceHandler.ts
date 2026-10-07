import { readSource, reconcileInventory, verifyMissing, type ListingSource, type SourceInventory } from "./sources.ts";
import type { SyncListing } from "./sync.ts";
import { createListingRenderer, listingRenderBackendFromEnv, type FetchHtml } from "../analyze-realtor-build/listingDiscovery.ts";
import { discoveryReporter, type ImportProgress } from "../analyze-realtor-build/progress.ts";

type Database = ReturnType<typeof import("npm:@supabase/supabase-js@2")["createClient"]>;
type Row = { value: Record<string, unknown>; rev: number };

export async function runSourceSync(sb: Database, realtorId: string, body: { mode?: string; url?: string; sourceId?: string },
  fetchHtml: FetchHtml, scheduled: boolean, progress?: ImportProgress): Promise<{ body: Record<string, unknown>; status?: number } | null> {
  const sourceKey = `${realtorId}:listing-sources.v1`, listingKey = `${realtorId}:listings.v2`;
  const read = async (key: string): Promise<Row | null> => {
    const { data, error } = await sb.from("app_kv").select("value,rev").eq("key", key).maybeSingle();
    if (error) throw error; return data;
  };
  // All server writes use compare-and-swap; retries always merge onto current data.
  const save = async (key: string, merge: (value: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>) => {
    for (let retry = 0; retry < 3; retry++) {
      const row = await read(key), rev = Math.max(Number(row?.rev ?? 0) + 1, Date.now());
      const value = await merge(row?.value ?? {});
      const payload = { key, value, rev, updated_at: new Date().toISOString() };
      if (!row) {
        const { error } = await sb.from("app_kv").insert(payload);
        if (!error) return value;
        if (error.code === "23505") continue; throw error;
      }
      const { data, error } = await sb.from("app_kv").update(payload).eq("key", key).eq("rev", row.rev).select("key");
      if (error) throw error; if (data?.length) return value;
    }
    throw new Error("Your listings changed during sync. Please retry.");
  };
  const row = await read(sourceKey);
  const sources = (Array.isArray(row?.value?.sources) ? row!.value.sources : []) as ListingSource[];
  const connecting = body.mode === "connect";
  if (connecting && scheduled) return { body: { ok: false, error: "Connect sources from your realtor account." }, status: 403 };
  if (connecting && (!body.url || typeof body.url !== "string")) return { body: { ok: false, error: "Paste the page where your listings live." }, status: 400 };
  const now = Date.now();
  const target = connecting ? sources.find(source => source.url === body.url || source.submittedUrl === body.url) :
    sources.filter(source => (!body.sourceId || source.id === body.sourceId) &&
      (scheduled ? source.nextSyncAt <= now : !source.lastCheckedAt || now - source.lastCheckedAt > 60_000))
      .sort((a, b) => a.nextSyncAt - b.nextSyncAt)[0];
  if (!connecting && !target) return body.sourceId ? { body: { ok: true, checked: 0 } } : null;
  if (connecting && sources.length >= 5 && !target) return { body: { ok: false, error: "You already have five connected sources. Use one of your connected pages." }, status: 400 };
  let inventory: SourceInventory;
  progress?.start("listings");
  try {
    inventory = await readSource(connecting ? body.url! : target!.url, fetchHtml, target, undefined, createListingRenderer(listingRenderBackendFromEnv(name => Deno.env.get(name))),
      progress ? discoveryReporter(progress) : undefined);
    const enrichment = inventory.meta.enrichment;
    if (progress?.isOpen("details")) progress.finish("details", "done", { count: (enrichment?.enriched ?? 0) + (enrichment?.failed ?? 0), total: enrichment?.scheduled });
    progress?.finish("listings", "done", { count: inventory.listings.length });
  } catch (error) {
    if (progress?.isOpen("details")) progress.finish("details", "failed");
    progress?.finish("listings", "failed");
    const message = error instanceof Error ? error.message : "We couldn’t find your listings on that page. Try the page showing all of your active listings.";
    if (target) await save(sourceKey, value => ({ ...value, sources: (Array.isArray(value.sources) ? value.sources : []).map(source => {
      const s = source as ListingSource;
      if (s.id !== target.id) return s;
      const failures = Number(s.failures ?? 0) + 1;
      return { ...s, state: "unavailable", error: message, failures, lastCheckedAt: now,
        nextSyncAt: now + Math.min(24, 0.5 * 2 ** Math.min(failures - 1, 6)) * 3_600_000 };
    }) }));
    return { body: { ok: false, error: message }, status: 422 };
  }
  // Save the source first so an interrupted collection write remains recoverable by the next sync.
  await save(sourceKey, value => {
    const all = (Array.isArray(value.sources) ? value.sources : []) as ListingSource[];
    const prior = all.find(source => source.id === inventory.source.id);
    if (prior && (prior.lastCheckedAt ?? 0) > (inventory.source.lastCheckedAt ?? 0)) return value;
    return { ...value, sources: [...all.filter(source => source.id !== inventory.source.id), inventory.source] };
  });
  const old = await read(listingKey);
  const oldItems = (Array.isArray(old?.value.items) ? old!.value.items : []) as SyncListing[];
  const missing = oldItems.filter(item => item.sourceId === inventory.source.id && item.sourceUrl && !inventory.listings.some(home => home.sourceUrl === item.sourceUrl)).length;
  if (missing) progress?.start("verify", { total: Math.min(missing, 4) });
  const verified = await verifyMissing(oldItems, inventory, fetchHtml);
  if (missing) progress?.finish("verify");
  progress?.start("save", { total: inventory.listings.length });
  const observations = new Map(verified.filter((item, i) => item !== oldItems[i]).map(item => [item.id, item]));
  const saved = await save(listingKey, async value => {
    const sourceRow = await read(sourceKey);
    const latestSources = (Array.isArray(sourceRow?.value.sources) ? sourceRow!.value.sources : []) as ListingSource[];
    const currentSource = latestSources.find(s => s.id === inventory.source.id);
    if ((currentSource?.lastCheckedAt ?? 0) > (inventory.source.lastCheckedAt ?? 0)) return value;
    const latest = (Array.isArray(value.items) ? value.items : []) as SyncListing[];
    // Verification updates source fields only; preserve current notes/visibility and newly changed URLs.
    const enriched = latest.map(item => {
      const checked = observations.get(item.id);
      return checked && checked.sourceUrl === item.sourceUrl ? { ...item, status: checked.status, lastStatusVerifiedAt: checked.lastStatusVerifiedAt } : item;
    });
    return { ...value, items: reconcileInventory(enriched, inventory, now) };
  });
  progress?.finish("save", "done", { count: inventory.listings.length });
  const incomplete=inventory.listings.filter(item=>!item.description||!item.images.length||!item.detailsComplete).length;
  return { body: { ok: true, source: inventory.source, imported: inventory.listings.length,
    ...(incomplete?{warning:`${incomplete} listing${incomplete===1?" has":"s have"} incomplete property details. The source did not expose a readable full description or gallery; previously saved details are preserved.`}:{}),
    checked: inventory.listings.length, complete: inventory.complete, items: saved.items } };
}
