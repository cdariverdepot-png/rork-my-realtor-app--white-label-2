import { supabase } from "./supabase";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { invokeWithProgress } from "@/lib/importStream";
import type { ImportEvent } from "@/lib/importProgress";

export type ConnectedListingSource = { id: string; url: string; submittedUrl: string; kind: string; state: "connected" | "unavailable";
  nextSyncAt: number; lastCheckedAt?: number; listingCount: number; error?: string };

export class ListingImportError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = "ListingImportError"; }
}

export type ListingSyncResult = { ok: boolean; items?: ManagedListing[]; source?: ConnectedListingSource; imported?: number; warning?: string;
  /** Listings whose details are read by follow-up detail jobs of the import that started at detailsSince. */
  detailsPending?: number; detailsSince?: number; attempted?: number };

export async function invokeListingSync(body: { mode?: "connect" | "details"; url?: string; listingId?: string; realtorId?: string; sourceId?: string; since?: number },
  onEvent?: (event: ImportEvent) => void): Promise<ListingSyncResult> {
  // Importing must use the existing login, never create a replacement guest session.
  if (!supabase) throw new Error("Sign in to your realtor account to connect listings.");
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session.session) throw new Error("Your session has expired. Sign in again to import listings.");
  if (onEvent) {
    const streamed = await invokeWithProgress("refresh-listings", body, onEvent);
    if (streamed.status >= 400 || streamed.body?.error) {
      throw new ListingImportError(streamed.body?.error ?? "We couldn’t check your listings right now. Please try again.", streamed.status);
    }
    return streamed.body as ListingSyncResult;
  }
  const { data, error } = await supabase.functions.invoke("refresh-listings", { body });
  if (data?.error) throw new ListingImportError(data.error, error?.context?.status);
  if (error) {
    let detail: { error?: string } | undefined;
    try { detail = await error.context?.json(); } catch { /* Non-JSON transport error. */ }
    if (detail?.error) throw new ListingImportError(detail.error, error.context?.status);
    throw new Error("We couldn’t check your listings right now. Please try again.");
  }
  return data as ListingSyncResult;
}

/**
 * Reads the property details an import left for follow-up jobs, one bounded job at a time (see
 * refresh-listings DETAIL_JOB_SIZE). Each job saves its batch, so an interruption keeps everything
 * read so far; the result says plainly how many listings still lack full details and how to retry.
 */
export async function readRemainingDetails(first: ListingSyncResult, realtorId?: string, onEvent?: (event: ImportEvent) => void): Promise<ListingSyncResult> {
  let result = first;
  const sourceId = first.source?.id, since = first.detailsSince;
  if (!sourceId || !since) return first;
  for (let jobs = 0; (result.detailsPending ?? 0) > 0 && jobs < 20; jobs++) {
    let next: ListingSyncResult;
    try {
      next = await invokeListingSync({ mode: "details", sourceId, since, ...(realtorId ? { realtorId } : {}) }, onEvent);
    } catch (error) {
      const pending = result.detailsPending ?? 0;
      const reason = error instanceof Error && error.message ? ` (${error.message.replace(/\.$/, "")})` : "";
      return { ...result, detailsPending: pending,
        warning: `Your listings are saved. Full details for ${pending} of them could not be read this time${reason}. Sync your listings to try again; details already read are kept.` };
    }
    if (!next.attempted) break; // no progress is possible in this import; never loop
    result = { ...result, items: next.items ?? result.items, warning: next.warning, detailsPending: next.detailsPending ?? 0 };
  }
  return result;
}

export async function connectListingSource(raw: string, realtorId?: string, onEvent?: (event: ImportEvent) => void) {
  const value = raw.trim();
  if (!value) throw new Error("Paste the page where your listings live.");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new Error("Paste the full public link to your profile or listings page."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use the public HTTPS link to your profile or listings page.");
  const connected = await invokeListingSync({ mode: "connect", url: url.toString(), ...(realtorId ? { realtorId } : {}) }, onEvent);
  return readRemainingDetails(connected, realtorId, onEvent);
}
