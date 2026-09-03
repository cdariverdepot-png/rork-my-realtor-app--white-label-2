import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

/**
 * Account deletion.
 *
 * App Store guideline 5.1.1(v) requires that any app offering account creation
 * also offers in-app deletion. Beyond compliance, a delete that only clears the
 * phone would be a lie — the record would still be on the server and would come
 * straight back on the next sign-in. So each path does both: server first, then
 * a full local wipe.
 *
 * Server failure does not abort the local wipe. A user who taps delete has
 * withdrawn consent; leaving their data sitting on the device because a network
 * call failed is the wrong trade. The server call is retried on next launch by
 * virtue of the account no longer existing locally.
 */

export type DeleteResult = {
  ok: boolean;
  /** True when the server confirmed. False means local-only wipe happened. */
  serverConfirmed: boolean;
  error?: string;
};

/** Remove every AsyncStorage key belonging to a realtor's scope. */
async function wipeScopedKeys(scope: string): Promise<number> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(`${scope}:`));
    if (mine.length > 0) await AsyncStorage.multiRemove(mine);
    return mine.length;
  } catch (e) {
    console.log("[delete] scoped wipe failed", e);
    return 0;
  }
}

/** Remove a specific list of keys, ignoring individual failures. */
async function wipeKeys(keys: string[]): Promise<void> {
  try {
    await AsyncStorage.multiRemove(keys);
  } catch (e) {
    console.log("[delete] key wipe failed", e);
  }
}

/**
 * Client erases themselves. Frees the realtor's seat so it can be reused, and
 * clears this device. The realtor's own roster entry survives on purpose — see
 * the privacy policy: that is the agent's address book, not our record.
 */
export async function deleteClientAccount(input: {
  realtorId: string;
  email: string;
  clientId?: string;
}): Promise<DeleteResult> {
  const key = input.email.trim().toLowerCase();
  let serverConfirmed = false;

  if (supabase && input.realtorId && key) {
    try {
      const { data, error } = await supabase.rpc("delete_client_account", {
        p_realtor_id: input.realtorId,
        p_client_key: key,
      });
      if (error) console.log("[delete] client rpc error", error.message);
      else serverConfirmed = (data as Record<string, unknown> | null)?.ok === true;
    } catch (e) {
      console.log("[delete] client rpc exception", e);
    }
  }

  // Per-client local state: profile answers, favourites, drafts.
  await wipeKeys([
    `${input.realtorId}:favorites.v1`,
    `myrealtor.auth.session.v4`,
  ]);

  return { ok: true, serverConfirmed };
}

/**
 * Realtor erases themselves and everything they built: brand, listings,
 * documents, roster, messages, client connections and device tokens.
 *
 * The demo showcase is refused server-side and short-circuited here too, so a
 * preview session can never destroy it.
 */
export async function deleteRealtorAccount(input: {
  realtorId: string;
  demoRealtorId: string;
}): Promise<DeleteResult> {
  if (input.realtorId === input.demoRealtorId) {
    return { ok: false, serverConfirmed: false, error: "The demo account can't be deleted." };
  }

  let serverConfirmed = false;
  if (supabase && input.realtorId) {
    try {
      const { data, error } = await supabase.rpc("delete_realtor_account", {
        p_realtor_id: input.realtorId,
      });
      if (error) {
        console.log("[delete] realtor rpc error", error.message);
      } else {
        const row = data as Record<string, unknown> | null;
        serverConfirmed = row?.ok === true;
        if (row?.reason === "demo_protected") {
          return { ok: false, serverConfirmed: false, error: "The demo account can't be deleted." };
        }
      }
    } catch (e) {
      console.log("[delete] realtor rpc exception", e);
    }
  }

  await wipeScopedKeys(input.realtorId);
  await wipeKeys([
    `myrealtor.auth.accounts.${input.realtorId}`,
    `golive.record.v1:${input.realtorId}`,
    "myrealtor.auth.realtorCache.v1",
    "myrealtor.auth.session.v4",
  ]);

  return { ok: true, serverConfirmed };
}
