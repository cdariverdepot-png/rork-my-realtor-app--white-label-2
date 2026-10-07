import type { InactiveReason } from "@/lib/seats";

/**
 * Owner-only account notice for an inactive service. Copy matches the actual server state:
 * a payment failure is mentioned only when the provider reported one.
 */
export function serviceNoticeCopy(reason: InactiveReason | null): { title: string; body: string } | null {
  if (!reason) return null;
  const kept = "Your app, clients, messages and saved data remain available.";
  switch (reason) {
    case "payment_failed":
      return { title: "We couldn't process your payment.", body: `Update your billing information to restore publishing and client communication. ${kept}` };
    case "trial_ended":
      return { title: "Your 7-day trial has ended.", body: `Subscribe to restore publishing and client communication. ${kept}` };
    case "canceled":
      return { title: "Your subscription has ended.", body: `Renew to restore publishing and client communication. ${kept}` };
    default:
      return { title: "Your subscription is inactive.", body: `Renew to restore publishing and client communication. ${kept}` };
  }
}
