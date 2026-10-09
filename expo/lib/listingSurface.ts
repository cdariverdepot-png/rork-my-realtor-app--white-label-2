import type { Brand } from "@/contexts/BrandContext";
import { liveThemeDesign } from "@/constants/liveThemeDesigns";
import { websiteAppearance, websiteFont } from "@/lib/websitePresentation";
import { presentWebsiteSurface } from "@/lib/websiteDesignRuntime";

/** Colors, type and corner radius for listing screens, from the realtor's imported website or chosen theme. */
export type ListingSurface = { background: string; panel: string; ink: string; muted: string; accent: string; line: string;
  headingFont: string; bodyFont: string; radius: number };

export function listingSurface(brand: Brand): ListingSurface {
  const site = websiteAppearance(brand);
  if (site && brand.websiteDesign) {
    const surface = presentWebsiteSurface(site.background, site.accent, site.ink);
    return { background: surface.background, panel: surface.panel, ink: surface.ink, muted: surface.ink + "B3", accent: surface.accent,
      line: surface.ink + "1F", headingFont: websiteFont(site.headingFontFamily, true), bodyFont: websiteFont(site.fontFamily),
      radius: Math.min(16, Math.max(6, site.radius)) };
  }
  const d = liveThemeDesign(brand.layoutId, brand.theme);
  return { background: d.background, panel: d.panel, ink: d.ink, muted: d.muted, accent: d.accent, line: d.accent + "33",
    headingFont: "CormorantGaramond_500Medium", bodyFont: "Inter_400Regular", radius: 12 };
}

/** "Cindy's listings" from the realtor's own name; a neutral title when no person is named. */
export function listingsHeading(brand: Pick<Brand, "realtor">): string {
  const first = brand.realtor.name.trim().split(/\s+/)[0] ?? "";
  return /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*$/.test(first) && first.length > 1 ? `${first}’s listings` : "Available homes";
}

/** Columns for a listing grid: one card per row on phones, more only when each card keeps a readable width. */
export function listingColumns(contentWidth: number): number {
  return contentWidth >= 1000 ? 3 : contentWidth >= 640 ? 2 : 1;
}

export const homesCount = (count: number) => `${count} ${count === 1 ? "home" : "homes"}`;
