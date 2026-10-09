import { MONTHLY_PRICE, ANNUAL_PRICE, ANNUAL_EQUIVALENT, CUSTOM_MAINTENANCE } from "./subscriptionPricing";
/** Display configuration only. The server owns all entitlements and prices. */
export type PlanId = "evaluation" | "pro" | "bespoke";
export const EVALUATION_SEAT_LIMIT = 3;
export const FREE_SEAT_LIMIT = EVALUATION_SEAT_LIMIT;
export const UNLIMITED = -1;
export const CUSTOM_SETUP_PRICE = "$499";
export const CUSTOM_INQUIRY_URL = "mailto:hello@myrealtorapp.com?subject=" + encodeURIComponent("Custom app — $499 setup plus required subscription") + "&body=" + encodeURIComponent("I'd like to discuss my own app name, icon and portrait, published directly through my own Apple Developer account. Please confirm the ongoing subscription price and the agreed update/support scope. I understand Apple membership is separate.");
export function seatLimitForPlan(plan: PlanId | string | null | undefined): number {
  return plan === "pro" || plan === "bespoke" ? UNLIMITED : EVALUATION_SEAT_LIMIT;
}
export function isUnlimited(limit: number): boolean { return limit < 0; }
export type PlanTier = { id: PlanId; name: string; tagline: string; price: string; priceNote: string; altPrice?: string; features: string[]; featured: boolean; ctaLabel: string; contactOnly?: boolean };
export const PLAN_TIERS: PlanTier[] = [
  { id: "evaluation", name: "7-Day Free Trial", tagline: "Build your app and connect your first clients.", price: "$0", priceNote: "for 7 days", features: ["All standard features for 7 days", "Up to 3 connected client accounts during trial", "Free trial through the App Store; renews unless canceled", "Contacts and pending invitations do not count"], featured: false, ctaLabel: "YOUR CURRENT PLAN" },
  { id: "pro", name: "Professional", tagline: "Your personalized experience in the shared My Realtor App.", price: MONTHLY_PRICE, priceNote: "or annual", altPrice: ANNUAL_PRICE + " · " + ANNUAL_EQUIVALENT, features: ["All standard features on either billing interval", "Unlimited connected client accounts", "Your clients never pay", "Clients install the shared app and use your invitation", "Upgrade without changing records or invitations"], featured: true, ctaLabel: "SUBSCRIBE" },
  { id: "bespoke", name: "Custom app", tagline: "Your own app, published through your Apple account.", price: CUSTOM_SETUP_PRICE, priceNote: "one-time setup", altPrice: "Plus required " + MONTHLY_PRICE + " or " + ANNUAL_PRICE, features: ["Personalized app name, icon and portrait if desired", "Separate App Store listing", "Your own Apple Developer account from the start", "Apple membership is a separate cost", "Appropriate developer access for publication and updates", CUSTOM_MAINTENANCE, "Store approval is subject to Apple's review"], featured: false, ctaLabel: "DISCUSS YOUR APP", contactOnly: true },
];
