import AsyncStorage from "@react-native-async-storage/async-storage";
import { isKvEnabled, kvGet, kvSet } from "@/lib/kvStore";

/**
 * A client record on a realtor's roster. Mirrors the shape used by
 * ClientsContext so the same Storage/KV blob is shared between the two.
 */
export type RosterClient = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  tag?: string;
  source?: string;
  createdAt: number;
};

/** AsyncStorage + KV key for a realtor's roster. Must match ClientsContext. */
function rosterKey(realtorId: string): string {
  return `${realtorId}:clients.v1`;
}

/**
 * Append (or merge) a client onto a specific realtor's roster.
 *
 * Critically, this targets `realtorId` directly — it does NOT depend on the
 * current session scope. That's what guarantees a freshly-signed-up client is
 * saved under the realtor whose code they entered, never under "demo" (which
 * was the bug when the write went through a session-scoped context hook before
 * the new session had propagated).
 *
 * Reads the freshest roster (Supabase KV first, then local) so a realtor's
 * existing roster is never clobbered, merges by email, and writes back to both
 * local storage and KV so the realtor's device picks it up on next sync.
 */
export async function appendClientToRoster(
  realtorId: string,
  client: RosterClient
): Promise<void> {
  if (!realtorId) return;
  const key = rosterKey(realtorId);

  let list: RosterClient[] = [];

  // Prefer the durable shared copy so we merge onto the realtor's real roster.
  try {
    if (isKvEnabled()) {
      const row = await kvGet<RosterClient[]>(key);
      if (row?.value && Array.isArray(row.value)) list = row.value;
    }
  } catch (e) {
    console.log("[roster] kv read", e);
  }

  // Fall back to whatever is on this device.
  if (list.length === 0) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as RosterClient[];
        if (Array.isArray(parsed)) list = parsed;
      }
    } catch (e) {
      console.log("[roster] local read", e);
    }
  }

  const emailLc = client.email.trim().toLowerCase();
  // Merge by email — but contacts without one (a phone-only lead) are distinct people.
  const idx = emailLc ? list.findIndex(
    (c) => (c.email ?? "").trim().toLowerCase() === emailLc
  ) : -1;
  let next: RosterClient[];
  if (idx >= 0) {
    // Preserve the existing id/createdAt; refresh name/contact.
    const existing = list[idx];
    next = [...list];
    next[idx] = {
      ...existing,
      ...client,
      id: existing.id,
      createdAt: existing.createdAt,
    };
  } else {
    next = [client, ...list];
  }

  const rev = Date.now();
  try {
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch (e) {
    console.log("[roster] local write", e);
  }
  try {
    if (isKvEnabled()) await kvSet(key, next, rev);
  } catch (e) {
    console.log("[roster] kv write", e);
  }
}
