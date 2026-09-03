/**
 * Plan tiers and the free-tier client seat limit.
 *
 * A "seat" is a connection — a distinct client account that can actually open
 * the realtor's app. Roster contacts are NOT seats: those are the realtor's own
 * address book and stay unlimited on every tier.
 *
 * The numbers here are a mirror of `seat_limit_for_plan()` in
 * supabase/sql/seats.sql. The server is what enforces the limit; this file only
 * exists so the UI can show the right count before the round trip lands.
 */

export type PlanId = "free" | "pro" | "bespoke";

/** Free accounts may connect this many distinct clients. */
export const FREE_SEAT_LIMIT = 3;

/** Sentinel returned by the server for tiers with no cap. */
export const UNLIMITED = -1;

export function seatLimitForPlan(plan: PlanId | string | null | undefined): number {
  return plan === "pro" || plan === "bespoke" ? UNLIMITED : FREE_SEAT_LIMIT;
}

export function isUnlimited(limit: number): boolean {
  return limit < 0;
}

export type PlanTier = {
  id: PlanId;
  name: string;
  /** Short line under the name. */
  tagline: string;
  price: string;
  priceNote: string;
  /** Secondary billing option, e.g. the annual price. */
  altPrice?: string;
  features: string[];
  /** The one we're steering people toward. */
  featured: boolean;
  ctaLabel: string;
  /** Sold outside the app — not an in-app purchase. */
  contactOnly?: boolean;
};

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Everything you need to build it.",
    price: "$0",
    priceNote: "forever",
    features: [
      "The complete Brand Studio",
      "Your photography, fonts and colours",
      "Listings, documents and showings",
      "3 client invitations",
    ],
    featured: false,
    ctaLabel: "YOUR CURRENT PLAN",
  },
  {
    id: "pro",
    name: "Professional",
    tagline: "For an agent with a real book of clients.",
    price: "$49",
    priceNote: "per month",
    altPrice: "or $490 a year — two months free",
    features: [
      "Everything in Free",
      "Unlimited client invitations",
      "No cap as your roster grows",
      "Priority support",
    ],
    featured: true,
    ctaLabel: "UPGRADE",
  },
  {
    id: "bespoke",
    name: "Bespoke",
    tagline: "Your name on the App Store, not ours.",
    price: "From $3,000",
    priceNote: "one-off build",
    altPrice: "optional ongoing maintenance",
    features: [
      "Everything in Professional",
      "Your own app, listed under your name",
      "Your icon on your clients' home screens",
      "Built with you, one to one",
    ],
    featured: false,
    ctaLabel: "TALK TO US",
    contactOnly: true,
  },
];
