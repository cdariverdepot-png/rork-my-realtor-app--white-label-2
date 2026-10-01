import { supabase, ensureSupabaseSession } from "./supabase";
import type { ManagedListing } from "@/contexts/ListingsContext";

export type ConnectedListingSource = { id: string; url: string; submittedUrl: string; kind: string; state: "connected" | "unavailable";
  nextSyncAt: number; lastCheckedAt?: number; listingCount: number; error?: string };

export async function invokeListingSync(body: { mode?: "connect"; url?: string; listingId?: string }) {
  if (!supabase || !(await ensureSupabaseSession())) throw new Error("Sign in to your realtor account to connect listings.");
  const { data, error } = await supabase.functions.invoke("refresh-listings", { body });
  if (data?.error) throw new Error(data.error);
  if (error) {
    let detail: { error?: string } | undefined;
    try { detail = await error.context?.json(); } catch { /* Non-JSON transport error. */ }
    if (detail?.error) throw new Error(detail.error);
    throw new Error("We couldn’t check your listings right now. Please try again.");
  }
  return data as { ok: boolean; items?: ManagedListing[]; source?: ConnectedListingSource; imported?: number; warning?: string };
}

export async function connectListingSource(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error("Paste the page where your listings live.");
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new Error("Paste the full public link to your profile or listings page."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use the public HTTPS link to your profile or listings page.");
  return invokeListingSync({ mode: "connect", url: url.toString() });
}
