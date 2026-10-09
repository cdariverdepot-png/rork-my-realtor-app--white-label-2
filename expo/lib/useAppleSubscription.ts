import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { APPLE_MANAGE_SUBSCRIPTIONS_URL, APPLE_SUBSCRIPTION_IDS, appleSubscriptionIds, appleSubscriptionsConfigured, syncAppleTransactions } from "@/lib/appleSubscriptions";
import {
  buySubscription, connectStore, finishPurchase, listenForPurchases, loadSubscriptionProducts, openManageSubscriptions,
  restoreSubscriptionPurchases, storeKitAvailable, type StoreProduct, type StorePurchase,
} from "@/lib/storekit";

/**
 * Purchase / restore / manage through Apple. Every purchase is verified by the server before the
 * transaction is finished; the device's own state never unlocks paid service by itself.
 */
export function useAppleSubscription(realtorId: string | null, enabled: boolean, onEntitlementChanged: () => void) {
  const configured = storeKitAvailable && appleSubscriptionsConfigured();
  const [products, setProducts] = useState<Record<string, StoreProduct>>({});
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useRef(onEntitlementChanged); refresh.current = onEntitlementChanged;

  const record = useCallback(async (purchases: StorePurchase[]) => {
    const signed = purchases.map((p) => p.signedTransaction).filter((s): s is string => !!s);
    const result = await syncAppleTransactions(signed);
    if (result.ok) for (const p of purchases) await finishPurchase(p).catch(() => {});
    refresh.current();
    return result.ok;
  }, []);

  useEffect(() => {
    if (!configured || !enabled) return;
    let alive = true;
    void connectStore().then(async (ok) => {
      if (!ok || !alive) return;
      const list = await loadSubscriptionProducts(appleSubscriptionIds()).catch(() => []);
      if (alive) setProducts(Object.fromEntries(list.map((p) => [p.id, p])));
    });
    const stop = listenForPurchases(
      (purchase) => {
        void record([purchase])
          .then((ok) => alive && setMessage(ok ? "Subscription active. Publishing and client communication are available." : "Apple confirmed the purchase, but it couldn't be verified for this account yet. Use Restore Purchases to retry."))
          .catch((e) => alive && setMessage(e instanceof Error ? e.message : "Subscription status can't be verified right now."))
          .finally(() => alive && setBusy(null));
      },
      (error) => { if (!alive) return; setBusy(null); if (error) setMessage(error); },
    );
    return () => { alive = false; stop(); };
  }, [configured, enabled, record]);

  const subscribe = useCallback(async (interval: "month" | "year") => {
    const id = APPLE_SUBSCRIPTION_IDS[interval];
    if (!configured || !id) { setMessage(storeKitAvailable ? "App Store subscriptions are not configured in this build yet." : "Subscriptions are purchased in the My Realtor App for iPhone."); return; }
    if (!realtorId || busy) return;
    setBusy("buy"); setMessage(null);
    try { await buySubscription(id, realtorId); } // Outcome arrives through the purchase listener.
    catch (e) { setBusy(null); setMessage(e instanceof Error ? e.message : "The purchase could not be started."); }
  }, [configured, realtorId, busy]);

  const restore = useCallback(async () => {
    if (!configured) { setMessage(storeKitAvailable ? "App Store subscriptions are not configured in this build yet." : "Restore purchases in the My Realtor App for iPhone."); return; }
    if (busy) return;
    setBusy("restore"); setMessage(null);
    try {
      const found = await restoreSubscriptionPurchases(appleSubscriptionIds());
      if (!found.length) { setMessage("No App Store subscription was found for this Apple ID."); return; }
      setMessage((await record(found)) ? "Subscription restored." : "Your App Store subscription isn't active for this account.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Restore could not be completed."); }
    finally { setBusy(null); }
  }, [configured, busy, record]);

  const manage = useCallback(async () => {
    if (storeKitAvailable && (await openManageSubscriptions())) return;
    void Linking.openURL(APPLE_MANAGE_SUBSCRIPTIONS_URL).catch(() => setMessage("Open Settings → your name → Subscriptions to manage it."));
  }, []);

  return { configured, storeKitAvailable, products, busy, message, setMessage, subscribe, restore, manage };
}
