import type { InactiveReason } from "@/lib/seats";

/**
 * Owner-only account notice for an inactive service. Copy matches the actual server state:
 * a billing problem is mentioned only when Apple reported one.
 */
export function serviceNoticeCopy(reason: InactiveReason | null): { title: string; body: string } | null {
  if (!reason) return null;
  const kept = "Your app, clients, messages and saved data remain available.";
  switch (reason) {
    case "billing_retry":
      // Reported only when Apple says the renewal failed and is in billing retry.
      return { title: "Apple couldn't renew your subscription.", body: `Update the payment method for your Apple ID to restore publishing and client communication. ${kept}` };
    case "revoked":
      return { title: "Your subscription was refunded.", body: `Subscribe again to restore publishing and client communication. ${kept}` };
    case "trial_ended":
      return { title: "Your 7-day trial has ended.", body: `Subscribe to restore publishing and client communication. ${kept}` };
    case "canceled":
      return { title: "Your subscription has ended.", body: `Renew to restore publishing and client communication. ${kept}` };
    default:
      return { title: "Your subscription is inactive.", body: `Renew to restore publishing and client communication. ${kept}` };
  }
}
