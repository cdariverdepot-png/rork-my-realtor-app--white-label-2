import { supabase } from "./supabase";
import type { ManagedListing } from "@/contexts/ListingsContext";
import { invokeWithProgress } from "@/lib/importStream";
import type { ImportEvent } from "@/lib/importProgress";

export type ConnectedListingSource = { id: string; url: string; submittedUrl: string; kind: string; state: "connected" | "unavailable";
  nextSyncAt: number; lastCheckedAt?: number; listingCount: number; error?: string };

export class ListingImportError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = "ListingImportError"; }
}

export async function invokeListingSync(body: { mode?: "connect"; url?: string; listingId?: string; realtorId?: string },
  onEvent?: (event: ImportEvent) => void) {
  // Importing must use the existing login, never create a replacement guest session.
  if (!supabase) throw new Error("Sign in to your realtor account to connect listings.");
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session.session) throw new Error("Your session has expired. Sign in again to import listings.");
  if (onEvent) {
    const streamed = await invokeWithProgress("refresh-listings", body, onEvent);
    if (streamed.status >= 400 || streamed.body?.error) {
      throw new ListingImportError(streamed.body?.error ?? "We couldn’t check your listings right now. Please try again.", streamed.status);
    }
    return streamed.body as { ok: boolean; items?: ManagedListing[]; source?: ConnectedListingSource; imported?: number; warning?: string };
  }
  const { data, error } = await supabase.functions.invoke("refresh-listings", { body });
  if (data?.error) throw new ListingImportError(data.error, error?.context?.status);
  if (error) {
    let detail: { error?: string } | undefined;
    try { detail = await error.context?.json(); } catch { /* Non-JSON transport error. */ }
    if (detail?.error) throw new ListingImportError(detail.error, error.context?.status);
    throw new Error("We couldn’t check your listings right now. Please try again.");
  }
  return data as { ok: boolean; items?: ManagedListing[]; source?: ConnectedListingSource; imported?: number; warning?: string };
}

export async function connectListingSource(raw: string, realtorId?: string, onEvent?: (event: ImportEvent) => void) {
  const value = raw.trim();
  if (!value) throw new Error("Paste the page where your listings live.");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new Error("Paste the full public link to your profile or listings page."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use the public HTTPS link to your profile or listings page.");
  return invokeListingSync({ mode: "connect", url: url.toString(), ...(realtorId ? { realtorId } : {}) }, onEvent);
}
