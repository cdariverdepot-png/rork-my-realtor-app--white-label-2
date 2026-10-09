import type { InactiveReason } from "@/lib/seats";

/**
 * Owner-only account notice for an inactive service. Copy matches the actual server state:
 * a billing problem is mentioned only when Apple reported one.
 */
export function serviceNoticeCopy(reason: InactiveReason | null): { title: string; body: string } | null {
  if (!reason) return null;
  const kept = "Your app, clients, messages and saved data remain available.";
  switch (reason) {
    case "not_subscribed":
      return { title: "Start your 7-day free trial.", body: `Subscribe through the App Store to enable publishing and client communication. ${kept}` };
    case "billing_retry":
      // Reported only when Apple says the renewal failed and Apple is retrying billing.
      return { title: "Apple couldn't renew your subscription.", body: `Apple is retrying billing. Update the payment method for your Apple ID to restore publishing and client communication. ${kept}` };
    case "refunded":
      return { title: "Refunded — your subscription was refunded.", body: `Subscribe again to restore publishing and client communication. ${kept}` };
    case "canceled":
      return { title: "Canceled — your subscription has ended.", body: `Resubscribe to restore publishing and client communication. ${kept}` };
    default:
      return { title: "Expired — your subscription has ended.", body: `Resubscribe to restore publishing and client communication. ${kept}` };
  }
}
