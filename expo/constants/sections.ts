/**
 * The client-facing rule set.
 *
 * Two ideas live here, and they are deliberately separate:
 *
 * 1. **The required floor** — the handful of facts without which the client app
 *    cannot function or cannot legally advertise. Nothing else is ever required.
 * 2. **Section readiness** — a single declaration, per section, of what must
 *    exist before it earns its place on the page.
 *
 * The point is that a realtor should be able to fill in as much or as little as
 * they like beyond the floor, in any combination, and always get a composed
 * screen. Sections that have nothing to say do not render at all — they never
 * render as an empty heading, a blank card, or a hairline attached to nothing.
 *
 * Because readiness is declared here rather than scattered through ten
 * components, the visible list is computable *before* render. That is what lets
 * `app/index.tsx` derive the entrance rhythm from what is actually on screen
 * instead of from the authored order, so any subset still reads as intentional.
 */

import type { Brand } from "@/contexts/BrandContext";
import { hasCredentials } from "@/components/Credentials";

/* ------------------------------ Required floor ------------------------------ */

export type RequiredFieldId =
  | "name"
  | "portrait"
  | "city"
  | "contact"
  | "heroLine"
  | "license";

export type RequiredField = {
  id: RequiredFieldId;
  label: string;
  /** Why the app genuinely needs it — shown to the realtor, never to clients. */
  why: string;
  met: (b: Brand) => boolean;
  href: string;
};

const filled = (s: string | undefined): boolean => (s ?? "").trim().length > 0;

/**
 * The bare minimum for a functioning, compliant client app.
 *
 * Kept deliberately short. Every extra required field is a realtor who never
 * finishes setup, so anything that can be optional is optional — and anything
 * that can be derived (monogram, brand name, copyright) is derived rather than
 * demanded.
 */
export const REQUIRED_FIELDS: RequiredField[] = [
  {
    id: "name",
    label: "Your name",
    why: "Signs your note, your listings and every message.",
    met: (b) => filled(b.realtor.name),
    href: "/admin/studio",
  },
  {
    id: "portrait",
    label: "Your portrait",
    why: "The app opens on your face — without it the first screen is a dark panel.",
    met: (b) => filled(b.portraitUrl),
    href: "/admin/studio",
  },
  {
    id: "city",
    label: "City or region",
    why: "Tells a client which market you actually work.",
    met: (b) => filled(b.realtor.city),
    href: "/admin/studio",
  },
  {
    id: "contact",
    label: "Phone or email",
    why: "Every call, message and booking button needs somewhere to go.",
    met: (b) => filled(b.realtor.phone) || filled(b.realtor.email),
    href: "/admin/studio",
  },
  {
    id: "heroLine",
    label: "Opening line",
    why: "The first sentence a client reads. One line is enough.",
    met: (b) => filled(b.realtor.heroMessage) || filled(b.realtor.tagline),
    href: "/admin/studio",
  },
  {
    id: "license",
    label: "Brokerage & licence",
    why: "Most states require your brokerage and licence number on advertising.",
    met: (b) =>
      filled(b.credentials.license.brokerage) &&
      filled(b.credentials.license.number) &&
      filled(b.credentials.license.state),
    href: "/admin/studio",
  },
];

export type RequiredStatus = {
  met: RequiredField[];
  missing: RequiredField[];
  /** True when every required field is present. */
  complete: boolean;
};

/** Evaluates the required floor against a brand. */
export function requiredStatus(b: Brand): RequiredStatus {
  const met: RequiredField[] = [];
  const missing: RequiredField[] = [];
  for (const f of REQUIRED_FIELDS) (f.met(b) ? met : missing).push(f);
  return { met, missing, complete: missing.length === 0 };
}

/* ------------------------------ Section rules ------------------------------ */

export type ClientSectionId =
  | "hero"
  | "listings"
  | "note"
  | "credentials"
  | "beat"
  | "quickContact"
  | "concierge"
  | "social"
  | "support"
  | "footer";

/** Everything a readiness rule is allowed to look at. */
export type SectionContext = {
  brand: Brand;
  /** Listings the client can actually see (hidden ones already filtered out). */
  visibleListingCount: number;
};

export type ClientSection = {
  id: ClientSectionId;
  /** False hides the section outright — no heading, no card, no spacing. */
  isReady: (ctx: SectionContext) => boolean;
  /**
   * Structural sections are part of the app's frame rather than the realtor's
   * content. They always render and are excluded from the entrance stagger.
   */
  structural?: boolean;
};

/**
 * Authored order. What actually renders is this list filtered by `isReady`.
 *
 * The sequence is an argument, not an arrangement: the hero introduces, the
 * collection gives clients something to do, the note makes it personal,
 * credentials back the personality with fact, the market read shows judgement,
 * and only then do the contact and proof sections ask for something.
 */
export const CLIENT_SECTIONS: ClientSection[] = [
  { id: "hero", isReady: () => true, structural: true },
  {
    id: "listings",
    // Always shown. Listings are the reason a client opens the app at all, so
    // an empty collection becomes an explicit "coming soon" rather than a gap —
    // a missing section here would read as a broken app, not a spare one.
    isReady: () => true,
  },
  {
    id: "note",
    isReady: ({ brand: b }) => filled(b.note.body[0]) || filled(b.note.body[1]),
  },
  { id: "credentials", isReady: ({ brand: b }) => hasCredentials(b.credentials) },
  {
    id: "beat",
    isReady: ({ brand: b }) => b.beat.bullets.some((x) => filled(x.label) || filled(x.copy)),
  },
  {
    id: "quickContact",
    isReady: ({ brand: b }) => filled(b.realtor.phone) || filled(b.realtor.email),
  },
  // The concierge index links to real app features (favourites, messages,
  // documents), so it stands on its own regardless of how much brand copy exists.
  { id: "concierge", isReady: () => true, structural: true },
  {
    id: "social",
    isReady: ({ brand: b }) => b.testimonials.length > 0 || b.recentlyClosed.length > 0,
  },
  { id: "support", isReady: () => true, structural: true },
  { id: "footer", isReady: () => true, structural: true },
];

/** The sections that will actually render, in order. */
export function visibleSections(ctx: SectionContext): ClientSectionId[] {
  return CLIENT_SECTIONS.filter((s) => s.isReady(ctx)).map((s) => s.id);
}

/* ------------------------------ Rhythm ------------------------------ */

/** First section is immediate; the rest cascade evenly. */
const STAGGER_START = 120;
const STAGGER_STEP = 80;

/**
 * Entrance delay derived from a section's position in the **visible** list.
 *
 * Hardcoded per-section delays break as soon as a realtor leaves something out:
 * hiding two sections leaves a hole in the cascade and the page appears to stall.
 * Deriving the delay keeps the rhythm even for every possible combination.
 */
export function revealDelays(ids: ClientSectionId[]): Record<string, number> {
  const out: Record<string, number> = {};
  ids.forEach((id, i) => {
    out[id] = STAGGER_START + i * STAGGER_STEP;
  });
  return out;
}
