import type * as Iap from "expo-iap";
import type { Purchase } from "expo-iap";
import type { StoreProduct, StorePurchase } from "./storekit";
export type { StoreProduct, StorePurchase } from "./storekit";

/**
 * StoreKit bridge — iOS. Apple performs purchase, renewal, billing and management.
 *
 * expo-iap is a native module: it exists in development/TestFlight/App Store builds but not in
 * Expo Go or other preview clients. It is loaded lazily so those clients keep working, with
 * purchasing simply unavailable.
 */
let cached: typeof Iap | null | undefined;
function iap(): typeof Iap | null {
  if (cached !== undefined) return cached;
  try { cached = require("expo-iap") as typeof Iap; } catch { cached = null; }
  return cached;
}
export const storeKitAvailable = iap() !== null;

let connected: Promise<boolean> | null = null;
export function connectStore(): Promise<boolean> {
  const m = iap();
  if (!m) return Promise.resolve(false);
  connected ??= m.initConnection().then((ok) => ok === true).catch(() => { connected = null; return false; });
  return connected;
}

const wrap = (p: Purchase): StorePurchase => ({ productId: p.productId, signedTransaction: p.purchaseToken ?? null, raw: p });
const unavailable = () => new Error("The App Store is unavailable right now. Please try again.");

export async function loadSubscriptionProducts(ids: string[]): Promise<StoreProduct[]> {
  const m = iap();
  if (!m || !ids.length || !(await connectStore())) return [];
  const products = (await m.fetchProducts({ skus: ids, type: "subs" })) ?? [];
  return (products as unknown as { id: string; displayPrice: string; title?: string; displayName?: string | null }[])
    .map((p) => ({ id: p.id, displayPrice: p.displayPrice, title: p.title ?? p.displayName ?? p.id }));
}

/** appAccountToken binds the Apple transaction to this realtor account on the server. */
export async function buySubscription(productId: string, realtorId: string): Promise<void> {
  const m = iap();
  if (!m || !(await connectStore())) throw unavailable();
  await m.requestPurchase({ request: { apple: { sku: productId, appAccountToken: realtorId } }, type: "subs" });
}

export async function restoreSubscriptionPurchases(ids: string[]): Promise<StorePurchase[]> {
  const m = iap();
  if (!m || !(await connectStore())) throw unavailable();
  await m.restorePurchases();
  const purchases = (await m.getAvailablePurchases()) ?? [];
  return purchases.filter((p) => ids.includes(p.productId)).map(wrap);
}

export function listenForPurchases(onPurchase: (p: StorePurchase) => void, onError: (message: string | null) => void): () => void {
  const m = iap();
  if (!m) return () => {};
  const updated = m.purchaseUpdatedListener((p) => onPurchase(wrap(p)));
  const failed = m.purchaseErrorListener((e) => onError(m.isUserCancelledError(e) ? null : e?.message || "The purchase could not be completed."));
  return () => { updated.remove(); failed.remove(); };
}

/** Finish only after the server has verified and recorded the transaction. */
export async function finishPurchase(p: StorePurchase): Promise<void> {
  const m = iap();
  if (m) await m.finishTransaction({ purchase: p.raw as Purchase, isConsumable: false });
}

export async function openManageSubscriptions(): Promise<boolean> {
  const m = iap();
  if (!m) return false;
  try { await m.deepLinkToSubscriptions({}); return true; } catch { return false; }
}
