import { verifyAppleJws, type VerifyOptions } from "./appleJws.ts";

/** Minimal entitlement snapshot stored per realtor. Apple remains the billing system of record. */
export type AppleSnapshot = {
  original_transaction_id: string; product_id: string; environment: string;
  expires_at: string | null; revoked_at: string | null; signed_at: string;
  /** Current period is Apple's introductory free trial (Apple decides eligibility). */
  in_trial: boolean;
  auto_renew?: boolean | null; billing_issue?: boolean | null;
};
export type AppleConfig = { bundleId: string; productIds: string[]; environments: string[]; verify?: VerifyOptions };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function appleConfig(get: (k: string) => string | undefined): AppleConfig | null {
  const productIds = (get("APPLE_SUBSCRIPTION_PRODUCT_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const bundleId = (get("APPLE_BUNDLE_ID") ?? "").trim();
  if (!bundleId || productIds.length === 0) return null; // Never invent product IDs.
  const environments = (get("APPLE_ENVIRONMENTS") ?? "Production,Sandbox").split(",").map((s) => s.trim()).filter(Boolean);
  return { bundleId, productIds, environments };
}

const iso = (ms: unknown) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/** Verified StoreKit 2 transaction → snapshot, or an error for anything not ours. */
export async function transactionSnapshot(jws: string, config: AppleConfig): Promise<{ snapshot: AppleSnapshot; appAccountToken: string | null }> {
  const t = await verifyAppleJws<Record<string, any>>(jws, config.verify);
  if (t.bundleId !== config.bundleId) throw new Error("Transaction is for another app");
  if (!config.productIds.includes(t.productId)) throw new Error("Unknown subscription product");
  if (!config.environments.includes(t.environment)) throw new Error("Unexpected App Store environment");
  if (t.type && t.type !== "Auto-Renewable Subscription") throw new Error("Not a subscription transaction");
  const otid = String(t.originalTransactionId ?? "");
  if (!/^\d{1,40}$/.test(otid)) throw new Error("Invalid transaction");
  return {
    appAccountToken: typeof t.appAccountToken === "string" && UUID.test(t.appAccountToken) ? t.appAccountToken.toLowerCase() : null,
    snapshot: {
      original_transaction_id: otid, product_id: t.productId, environment: t.environment,
      expires_at: iso(t.expiresDate), revoked_at: iso(t.revocationDate), signed_at: iso(t.signedDate) ?? new Date().toISOString(),
      // offerType 1 = introductory offer; offerDiscountType (iOS 17.2+) confirms it is the free trial.
      in_trial: t.offerType === 1 && (t.offerDiscountType === undefined || t.offerDiscountType === "FREE_TRIAL"),
    },
  };
}

const BILLING_ISSUE_TYPES = new Set(["DID_FAIL_TO_RENEW"]);
const BILLING_CLEARED_TYPES = new Set(["DID_RENEW", "SUBSCRIBED", "OFFER_REDEEMED"]);

/** Verified App Store Server Notification V2 → snapshot (null for notifications with no subscription state). */
export async function notificationSnapshot(signedPayload: string, config: AppleConfig): Promise<{ snapshot: AppleSnapshot; appAccountToken: string | null; type: string } | null> {
  const n = await verifyAppleJws<Record<string, any>>(signedPayload, config.verify);
  const data = n.data ?? {};
  if (data.bundleId && data.bundleId !== config.bundleId) throw new Error("Notification is for another app");
  if (!data.signedTransactionInfo) return null; // e.g. TEST notifications
  const { snapshot, appAccountToken } = await transactionSnapshot(data.signedTransactionInfo, config);
  let renewal: Record<string, any> | null = null;
  if (data.signedRenewalInfo) renewal = await verifyAppleJws<Record<string, any>>(data.signedRenewalInfo, config.verify);
  const type = String(n.notificationType ?? "");
  // Grace period: Apple asks apps to keep service during billing grace.
  const grace = typeof renewal?.gracePeriodExpiresDate === "number" ? renewal.gracePeriodExpiresDate : null;
  if (grace && (!snapshot.expires_at || grace > Date.parse(snapshot.expires_at))) snapshot.expires_at = iso(grace);
  snapshot.auto_renew = typeof renewal?.autoRenewStatus === "number" ? renewal.autoRenewStatus === 1 : null;
  snapshot.billing_issue = renewal?.isInBillingRetryPeriod === true || BILLING_ISSUE_TYPES.has(type) ? true
    : BILLING_CLEARED_TYPES.has(type) ? false : (typeof renewal?.isInBillingRetryPeriod === "boolean" ? renewal.isInBillingRetryPeriod : null);
  snapshot.signed_at = iso(n.signedDate) ?? snapshot.signed_at;
  return { snapshot, appAccountToken, type };
}
