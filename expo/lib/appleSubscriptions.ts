import { ensureSupabaseSession, supabase } from "@/lib/supabase";

/**
 * App Store subscription configuration. Product IDs come from App Store Connect via build
 * environment variables and are never invented here. Without them, purchase controls stay off.
 */
export const APPLE_SUBSCRIPTION_IDS = {
  month: (process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_MONTHLY_ID ?? "").trim(),
  year: (process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_ANNUAL_ID ?? "").trim(),
};
export const appleSubscriptionIds = (): string[] => [APPLE_SUBSCRIPTION_IDS.month, APPLE_SUBSCRIPTION_IDS.year].filter(Boolean);
export const appleSubscriptionsConfigured = (): boolean => appleSubscriptionIds().length > 0;

/** Apple's own subscription management page; used where StoreKit's sheet is unavailable. */
export const APPLE_MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

/**
 * Send StoreKit 2 signed transactions (JWS) to the server, which verifies Apple's signature
 * before recording entitlement. The device's claim alone never grants paid service.
 */
export async function syncAppleTransactions(signedTransactions: string[]): Promise<{ ok: boolean; results: unknown[] }> {
  const jws = signedTransactions.filter((s) => typeof s === "string" && s.split(".").length === 3);
  if (!jws.length) return { ok: false, results: [] };
  if (!supabase) throw new Error("Subscription status can't be verified right now. Please try again.");
  await ensureSupabaseSession();
  const { data, error } = await supabase.functions.invoke("apple-subscription", { body: { action: "sync", signedTransactions: jws } });
  if (error || !data) throw new Error("Subscription status can't be verified right now. Please try again.");
  if (data.error) throw new Error(String(data.error));
  return { ok: data.ok === true, results: Array.isArray(data.results) ? data.results : [] };
}
