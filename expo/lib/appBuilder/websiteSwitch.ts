import { beginImportSession, isActiveImportSession } from "./importScope";
import type { ListingSyncResult } from "@/lib/listingSourceService";
import type { ImportEvent } from "@/lib/importProgress";

/**
 * The one website-switch sequence of the app. Setup (Build Your App) and Studio (Update From URL, applied when the
 * realtor publishes) both use it, so a realtor's app can never show one website's branding with another website's
 * listings:
 *
 *   1. a new import session supersedes any import still running (a late result of it is ignored here and refused
 *      by the server);
 *   2. the previous website stops syncing and its listings are archived (never deleted; reconnecting restores them
 *      with their notes and tags). Listings added from a file or one at a time are not touched;
 *   3. the new website's listings are imported under the new session.
 */

/** The website a URL belongs to, for comparing "the same site" (scheme, www., path and case ignored). */
export function websiteHost(url?: string | null): string {
  const value = (url ?? "").trim();
  if (!value) return "";
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}
export function sameWebsite(a?: string | null, b?: string | null): boolean {
  const left = websiteHost(a);
  return !!left && left === websiteHost(b);
}

/** A newer import (another website, or the same switch started again) replaced this one. */
export class SupersededImportError extends Error {
  constructor() { super("A newer import replaced this one."); this.name = "SupersededImportError"; }
}

export type WebsiteSwitchDeps = {
  connect: (url: string, realtorId: string, onEvent: ((event: ImportEvent) => void) | undefined, session: string) => Promise<ListingSyncResult>;
  disconnect: (url: string, realtorId: string, session: string) => Promise<unknown>;
  /** After the previous website was disconnected, e.g. reload the local collection so it leaves the screen at once. */
  afterDisconnect?: () => unknown;
};

export type WebsiteImport = {
  session: string;
  /** True once a newer import started: everything this one returns belongs to a website the realtor left. */
  isStale: () => boolean;
  /** The import of the new website's listings (rejects with the importer's error, or SupersededImportError). */
  listings: Promise<ListingSyncResult>;
};

export function startWebsiteImport({ from, to, realtorId, onEvent, deps, requireDisconnect = false }: {
  from?: string | null; to: string; realtorId: string; onEvent?: (event: ImportEvent) => void; deps: WebsiteSwitchDeps;
  /**
   * Studio: the previous website must be disconnected before anything else happens (a failure stops the switch so
   * it can be retried). Setup: a failed disconnect is tolerated, because the review is scoped to this import and a
   * successful import retires the previous setup's website on the server.
   */
  requireDisconnect?: boolean;
}): WebsiteImport {
  const session = beginImportSession();
  const isStale = () => !isActiveImportSession(session);
  const listings = (async () => {
    if (from && !sameWebsite(from, to)) {
      try { await deps.disconnect(from, realtorId, session); }
      catch (error) { if (requireDisconnect) throw error; }
      await deps.afterDisconnect?.();
    }
    if (isStale()) throw new SupersededImportError();
    return deps.connect(to, realtorId, onEvent, session);
  })();
  // The caller decides what a failure means; never leave an unhandled rejection behind.
  listings.catch(() => {});
  return { session, isStale, listings };
}

/**
 * Studio holds a website change as a draft until the realtor publishes: the marker remembers which website the
 * app's listings come from now (`from`) and which website the draft was built from (`to`). Changing the address
 * twice keeps the original `from`; changing it back to the connected website cancels the switch.
 */
export type PendingWebsite = { from: string; to: string; requestedAt: number };

export function nextPendingWebsite(existing: PendingWebsite | null, previousUrl: string | null | undefined, nextUrl: string, now = Date.now()): PendingWebsite | null {
  const from = existing?.to ? existing.from : previousUrl ?? "";
  if (!websiteHost(nextUrl)) return existing;
  if (sameWebsite(from, nextUrl)) return null;
  // No previous website (`from` empty): publishing still imports the new website's listings.
  return { from: websiteHost(from) ? from : "", to: nextUrl, requestedAt: now };
}

/** Whether a stored marker still describes an unfinished switch. */
export function isPendingWebsite(value: unknown): value is PendingWebsite {
  const v = value as Partial<PendingWebsite> | null;
  return !!v && typeof v.from === "string" && typeof v.to === "string" && !!websiteHost(v.to) && !sameWebsite(v.from, v.to);
}
