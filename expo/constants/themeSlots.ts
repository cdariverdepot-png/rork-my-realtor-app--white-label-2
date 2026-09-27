import type { Brand } from "@/contexts/BrandContext";
import { DEFAULT_CLIENT_LAYOUT } from "@/constants/clientLayouts";
import { themeSlotCopy } from "@/constants/themeSamples";

/**
 * Generic wording every new profile is seeded with. It isn't something the
 * realtor wrote, and showing it in every theme is what made them look alike —
 * so it counts as empty and the theme's own copy is used instead.
 */
const SEED_COPY = new Set([
  "Your private concierge", "Everything I'm\nholding for you.", "Curated for you", "Homes I picked\nfor you.",
  "DIRECT LINE", "Reach me directly.", "No assistants. No call centers. {first} writes back personally.",
].map(value => value.replace(/\s+/g, " ").trim().toLowerCase()));
const blank = (value: string | undefined) => {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  return !clean || SEED_COPY.has(clean.toLowerCase());
};
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("");

/**
 * Theme = layout + visual rules; the profile is content poured into its slots.
 * Empty design-copy slots take the theme's own wording so every theme keeps its
 * structure with real data. Personal content (name, portrait, headline, bio,
 * contact details, listings) is never invented. Render-time only — nothing
 * here is saved to the profile.
 */
export function withThemeSlots(brand: Brand): Brand {
  const copy = themeSlotCopy(brand.layoutId ?? DEFAULT_CLIENT_LAYOUT);
  const r = brand.realtor;
  const first = r.name.trim().split(/\s+/)[0] ?? "";
  return {
    ...brand,
    realtor: {
      ...r,
      monogram: blank(r.monogram) ? initials(r.name) : r.monogram,
      brandName: blank(r.brandName) ? r.name.toUpperCase() : r.brandName,
      brandSub: blank(r.brandSub) ? copy.brandSub : r.brandSub,
      heroEyebrow: blank(r.heroEyebrow) ? copy.heroEyebrow : r.heroEyebrow,
      title: blank(r.title) ? copy.title : r.title,
      primaryCta: blank(r.primaryCta) ? copy.primaryCta : r.primaryCta,
      secondaryCta: blank(r.secondaryCta) ? copy.secondaryCta : r.secondaryCta,
    },
    curated: {
      ...brand.curated,
      eyebrow: blank(brand.curated.eyebrow) ? (copy.curatedEyebrow || (first ? `CURATED BY ${first.toUpperCase()}` : "")) : brand.curated.eyebrow,
      title: blank(brand.curated.title) ? copy.collection : brand.curated.title,
    },
    concierge: {
      ...brand.concierge,
      eyebrow: blank(brand.concierge.eyebrow) ? copy.conciergeEyebrow : brand.concierge.eyebrow,
      title: blank(brand.concierge.title) ? copy.conciergeTitle : brand.concierge.title,
    },
    quickContact: {
      ...brand.quickContact,
      kicker: blank(brand.quickContact.kicker) ? copy.quickContact.kicker : brand.quickContact.kicker,
      title: blank(brand.quickContact.title) ? copy.quickContact.title : brand.quickContact.title,
      sub: blank(brand.quickContact.sub) ? (first ? `Connect with ${first}.` : copy.quickContact.sub) : brand.quickContact.sub,
    },
  };
}
