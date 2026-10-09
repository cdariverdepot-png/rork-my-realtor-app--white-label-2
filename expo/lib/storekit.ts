/**
 * StoreKit bridge — non-iOS build (web, Android). App Store subscriptions are purchased,
 * restored and managed only in the iOS app; see storekit.ios.ts.
 */
export type StoreProduct = { id: string; displayPrice: string; title: string };
export type StorePurchase = { productId: string; signedTransaction: string | null; raw: unknown };

export const storeKitAvailable = false;
export async function connectStore(): Promise<boolean> { return false; }
export async function loadSubscriptionProducts(_ids: string[]): Promise<StoreProduct[]> { return []; }
export async function buySubscription(_productId: string, _realtorId: string): Promise<void> {
  throw new Error("Subscriptions are purchased in the My Realtor App for iPhone.");
}
export async function restoreSubscriptionPurchases(_ids: string[]): Promise<StorePurchase[]> { return []; }
export function listenForPurchases(_onPurchase: (p: StorePurchase) => void, _onError: (message: string | null) => void): () => void { return () => {}; }
export async function finishPurchase(_p: StorePurchase): Promise<void> {}
export async function openManageSubscriptions(): Promise<boolean> { return false; }
