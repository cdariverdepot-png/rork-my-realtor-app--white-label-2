import { kvGet, kvSet } from "@/lib/kvStore";
import { isPendingWebsite, nextPendingWebsite, startWebsiteImport, SupersededImportError, websiteHost, type PendingWebsite, type WebsiteSwitchDeps } from "./websiteSwitch";

/**
 * Where Studio keeps a website change until it is published: the realtor's own record (owner-only; clients
 * never read it). See nextPendingWebsite for the rules.
 */
const key = (realtorId: string) => `${realtorId}:website-switch.v1`;
const listeners = new Set<() => void>();

export function onPendingWebsiteChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const notify = () => listeners.forEach(listener => { try { listener(); } catch { /* a screen that left */ } });

export async function readPendingWebsite(realtorId: string): Promise<PendingWebsite | null> {
  const row = await kvGet<unknown>(key(realtorId));
  return isPendingWebsite(row?.value) ? row!.value as PendingWebsite : null;
}

/** Studio changed the draft's website from previousUrl to nextUrl. */
export async function recordWebsiteChange(realtorId: string, previousUrl: string | null | undefined, nextUrl: string): Promise<PendingWebsite | null> {
  const existing = await readPendingWebsite(realtorId);
  const next = nextPendingWebsite(existing, previousUrl, nextUrl);
  await kvSet(key(realtorId), next ?? { from: "", to: "", requestedAt: 0 }, Date.now(), true);
  notify();
  return next;
}

/** The switch finished (or setup replaced the website itself): nothing is pending any more. */
export async function clearPendingWebsite(realtorId: string): Promise<void> {
  await kvSet(key(realtorId), { from: "", to: "", requestedAt: 0 }, Date.now(), true);
  notify();
}

export type AppliedWebsite = { imported: number; host: string; warning?: string; error?: string };

/**
 * Publishing a Studio draft built from another website switches the app's listings with the same sequence setup
 * uses (startWebsiteImport): the previous website is disconnected first (its listings archived, restorable), then
 * the new website's listings are imported. If the previous website could not be disconnected nothing changed and
 * the switch stays pending (retry). Once it was disconnected the switch is done even if the new website's import
 * fails: the app then shows no other website's homes, and the error says how to add the listings another way.
 */
export async function applyPendingWebsite(realtorId: string, pending: PendingWebsite, deps: WebsiteSwitchDeps): Promise<AppliedWebsite> {
  let disconnected = !pending.from;
  const run = startWebsiteImport({ from: pending.from, to: pending.to, realtorId, requireDisconnect: true,
    deps: { ...deps, disconnect: async (...args) => { const result = await deps.disconnect(...args); disconnected = true; return result; } } });
  const host = websiteHost(pending.to);
  try {
    const result = await run.listings;
    await clearPendingWebsite(realtorId);
    return { imported: result.imported ?? result.items?.length ?? 0, host, warning: result.warning };
  } catch (error) {
    if (error instanceof SupersededImportError || run.isStale() || !disconnected) throw error;
    await clearPendingWebsite(realtorId);
    return { imported: 0, host, error: error instanceof Error && error.message ? error.message : "The listings could not be imported this time." };
  }
}
