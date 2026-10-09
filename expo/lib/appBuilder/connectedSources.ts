import { kvGet } from "@/lib/kvStore";

/** The ids of the listing sources currently connected to this realtor (the realtor's own store; owner-only read). */
export async function connectedSourceIds(realtorId: string): Promise<string[] | null> {
  try {
    const row = await kvGet<{ sources?: { id?: unknown }[] }>(`${realtorId}:listing-sources.v1`);
    const sources = Array.isArray(row?.value?.sources) ? row!.value.sources : [];
    return sources.map(source => typeof source.id === "string" ? source.id : "").filter(Boolean);
  } catch { return null; }
}
