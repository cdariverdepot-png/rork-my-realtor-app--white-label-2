import {
  deepLinkToSubscriptions, fetchProducts, finishTransaction, getAvailablePurchases, initConnection,
  isUserCancelledError, purchaseErrorListener, purchaseUpdatedListener, requestPurchase, restorePurchases,
  type Purchase,
} from "expo-iap";
import type { StoreProduct, StorePurchase } from "./storekit";
export type { StoreProduct, StorePurchase } from "./storekit";

/** StoreKit bridge — iOS. Apple performs purchase, renewal, billing and management. */
export const storeKitAvailable = true;

let connected: Promise<boolean> | null = null;
export function connectStore(): Promise<boolean> {
  connected ??= initConnection().then((ok) => ok === true).catch(() => { connected = null; return false; });
  return connected;
}

const wrap = (p: Purchase): StorePurchase => ({ productId: p.productId, signedTransaction: p.purchaseToken ?? null, raw: p });

export async function loadSubscriptionProducts(ids: string[]): Promise<StoreProduct[]> {
  if (!ids.length || !(await connectStore())) return [];
  const products = (await fetchProducts({ skus: ids, type: "subs" })) ?? [];
  return (products as unknown as { id: string; displayPrice: string; title?: string; displayName?: string | null }[])
    .map((p) => ({ id: p.id, displayPrice: p.displayPrice, title: p.title ?? p.displayName ?? p.id }));
}

/** appAccountToken binds the Apple transaction to this realtor account on the server. */
export async function buySubscription(productId: string, realtorId: string): Promise<void> {
  if (!(await connectStore())) throw new Error("The App Store is unavailable right now. Please try again.");
  await requestPurchase({ request: { apple: { sku: productId, appAccountToken: realtorId } }, type: "subs" });
}

export async function restoreSubscriptionPurchases(ids: string[]): Promise<StorePurchase[]> {
  if (!(await connectStore())) throw new Error("The App Store is unavailable right now. Please try again.");
  await restorePurchases();
  const purchases = (await getAvailablePurchases()) ?? [];
  return purchases.filter((p) => ids.includes(p.productId)).map(wrap);
}

export function listenForPurchases(onPurchase: (p: StorePurchase) => void, onError: (message: string | null) => void): () => void {
  const updated = purchaseUpdatedListener((p) => onPurchase(wrap(p)));
  const failed = purchaseErrorListener((e) => onError(isUserCancelledError(e) ? null : e?.message || "The purchase could not be completed."));
  return () => { updated.remove(); failed.remove(); };
}

/** Finish only after the server has verified and recorded the transaction. */
export async function finishPurchase(p: StorePurchase): Promise<void> {
  await finishTransaction({ purchase: p.raw as Purchase, isConsumable: false });
}

export async function openManageSubscriptions(): Promise<boolean> {
  try { await deepLinkToSubscriptions({}); return true; } catch { return false; }
}
