import { readSource, reconcileInventory, verifyMissing, type ListingSource, type SourceInventory } from "./sources.ts";
import { applyObservation, type SyncListing } from "./sync.ts";
import { createListingRenderer, enrichPublicProperty, listingRenderBackendFromEnv, type DiscoveredListing, type FetchHtml } from "../analyze-realtor-build/listingDiscovery.ts";
import { discoveryReporter, type ImportProgress } from "../analyze-realtor-build/progress.ts";

type Database = ReturnType<typeof import("npm:@supabase/supabase-js@2")["createClient"]>;
type Row = { value: Record<string, unknown>; rev: number };

/**
 * Property details are read in separate, bounded jobs. A large inventory means 100 detail pages,
 * often 300 KB-1 MB each; reading them inside the inventory crawl exceeded the Edge Function CPU
 * allowance and lost the whole import. The inventory job saves every listing and reads the first
 * details; each detail job reads the next batch and saves it before the next job starts. Nothing is
 * skipped: every listing in the import is attempted exactly once, and each job's work is kept even
 * if a later job is interrupted.
 */
export const INVENTORY_JOB_DETAILS = 12;
export const DETAIL_JOB_SIZE = 25;

export async function runSourceSync(sb: Database, realtorId: string, body: { mode?: string; url?: string; sourceId?: string; since?: number },
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
  if (body.mode === "details") return runDetailJob(body, fetchHtml, read, save, listingKey, progress);
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
      progress ? discoveryReporter(progress) : undefined, INVENTORY_JOB_DETAILS);
    const enrichment = inventory.meta.enrichment;
    // Deferred details stay "in progress": the detail jobs that follow finish this line.
    if (progress?.isOpen("details") && !enrichment?.deferred?.length) progress.finish("details", "done", { count: (enrichment?.enriched ?? 0) + (enrichment?.failed ?? 0), total: enrichment?.scheduled, succeeded: enrichment?.enriched ?? 0 });
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
    // Listings whose details this job read are marked; deferred ones are left for the detail jobs.
    const deferred = new Set(inventory.meta.enrichment?.deferred ?? []);
    const detailsRead = new Set(inventory.listings.map(home => home.sourceUrl).filter(url => !deferred.has(url)));
    return { ...value, items: reconcileInventory(enriched, inventory, now).map(item =>
      item.sourceId === inventory.source.id && typeof item.sourceUrl === "string" && detailsRead.has(item.sourceUrl) ? { ...item, detailAttemptAt: now } : item) };
  });
  progress?.finish("save", "done", { count: inventory.listings.length });
  const detailsPending = inventory.meta.enrichment?.deferred?.length ?? 0;
  const incomplete=detailsPending ? 0 : inventory.listings.filter(item=>!item.description||!item.images.length||!item.detailsComplete).length;
  return { body: { ok: true, source: inventory.source, imported: inventory.listings.length,
    ...(detailsPending ? { detailsPending, detailsSince: now } : {}),
    ...(incomplete?{warning:`${incomplete} listing${incomplete===1?" has":"s have"} incomplete property details. The source did not expose a readable full description or gallery; previously saved details are preserved.`}:{}),
    checked: inventory.listings.length, complete: inventory.complete, items: saved.items } };
}

type Read = (key: string) => Promise<Row | null>;
type Save = (key: string, merge: (value: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>) => Promise<Record<string, unknown>>;

const asDiscovered = (item: SyncListing): DiscoveredListing => ({
  title: item.title, description: item.description ?? "", price: item.price ?? "", beds: Number(item.beds) || 0, baths: Number(item.baths) || 0,
  sqft: typeof item.sqft === "string" ? item.sqft : "", neighborhood: typeof item.neighborhood === "string" ? item.neighborhood : "",
  image: item.image ?? "", images: Array.isArray(item.images) ? item.images : [], sourceUrl: item.sourceUrl!, status: item.status,
  listingNumber: typeof item.listingNumber === "string" ? item.listingNumber : undefined,
  propertyType: typeof item.propertyType === "string" ? item.propertyType : undefined,
  facts: item.facts && typeof item.facts === "object" ? item.facts as Record<string, string> : undefined,
});

/** One bounded batch of property detail pages for the import that started at `since`. */
async function runDetailJob(body: { sourceId?: string; since?: number }, fetchHtml: FetchHtml, read: Read, save: Save,
  listingKey: string, progress?: ImportProgress): Promise<{ body: Record<string, unknown>; status?: number }> {
  const since = Number(body.since);
  if (!body.sourceId || !Number.isFinite(since) || since <= 0) return { body: { ok: false, error: "Choose the import whose details should be read." }, status: 400 };
  const items = ((await read(listingKey))?.value.items ?? []) as SyncListing[];
  const scope = (Array.isArray(items) ? items : []).filter(item => item.sourceId === body.sourceId && typeof item.sourceUrl === "string" && !item.sourceArchived);
  const attemptedIn = (item: SyncListing) => Number(item.detailAttemptAt ?? 0) >= since;
  const pending = scope.filter(item => !attemptedIn(item));
  const batch = pending.slice(0, DETAIL_JOB_SIZE);
  const total = scope.length;
  let handled = total - pending.length;
  let succeeded = scope.filter(item => attemptedIn(item) && item.detailsComplete).length;
  progress?.start("details", { count: handled, total, succeeded });
  const pages = new Map<string, ReturnType<FetchHtml>>();
  const cachedFetch: FetchHtml = (uri, options) => {
    const key = `${uri}|${options?.fragment ?? false}`;
    if (!pages.has(key)) pages.set(key, fetchHtml(uri, options));
    return pages.get(key)!;
  };
  const results = new Map<string, DiscoveredListing | null>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, batch.length) }, async () => {
    while (next < batch.length) {
      const item = batch[next++];
      try {
        const enriched = await enrichPublicProperty(asDiscovered(item), cachedFetch);
        results.set(item.id, enriched);
        if (enriched.detailsComplete) succeeded++;
      } catch { results.set(item.id, null); }
      handled++;
      progress?.start("details", { count: handled, total, succeeded });
    }
  }));
  const now = Date.now();
  const saved = await save(listingKey, value => ({ ...value, items: ((Array.isArray(value.items) ? value.items : []) as SyncListing[]).map(item => {
    if (!results.has(item.id) || item.sourceId !== body.sourceId) return item;
    const property = results.get(item.id);
    const observed = property && property.sourceUrl === item.sourceUrl
      ? applyObservation(item, { sourceUrl: item.sourceUrl!, checkedAt: now, property, status: property.status }) : item;
    return { ...observed, detailAttemptAt: now };
  }) }));
  const remaining = pending.length - batch.length;
  const savedItems = (Array.isArray(saved.items) ? saved.items : []) as SyncListing[];
  if (remaining > 0) {
    progress?.start("details", { count: handled, total, succeeded });
    return { body: { ok: true, attempted: batch.length, remaining, detailsPending: remaining, detailsSince: since, items: savedItems } };
  }
  progress?.finish("details", "done", { count: handled, total, succeeded });
  const incomplete = savedItems.filter(item => item.sourceId === body.sourceId && !item.sourceArchived && (!item.description || !item.images?.length || !item.detailsComplete)).length;
  return { body: { ok: true, attempted: batch.length, remaining: 0, items: savedItems,
    ...(incomplete ? { warning: `${incomplete} listing${incomplete === 1 ? " has" : "s have"} incomplete property details. The source did not expose a readable full description or gallery; previously saved details are preserved.` } : {}) } };
}
