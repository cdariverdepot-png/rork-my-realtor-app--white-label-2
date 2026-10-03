import type { ClientLayoutId } from "@/constants/clientLayouts";
import { CLIENT_LAYOUTS, DEFAULT_CLIENT_LAYOUT } from "@/constants/clientLayouts";
import type { Brand } from "@/contexts/BrandContext";
import { THEME_ACCENTS, type ThemeConfig } from "@/constants/theme";
import { rememberPresentation } from '@/lib/websitePresentation';

export type ThemeDesign = {
  name: string; background: string; ink: string; muted: string; accent: string;
  panel: string; light: boolean; composition: "editorial" | "coastal" | "journal" | "discovery" | "concierge" | "property" | "minimal";
  collection: "editorial" | "compact" | "feature" | "paired";
};
export const THEME_DESIGNS: Record<ClientLayoutId, ThemeDesign> = {
  "eliza-editorial": { name: "Eliza · Editorial", background: "#081A15", ink: "#F4EFE6", muted: "#D0C8B8", accent: "#D4B989", panel: "#FBF8F2", light: false, composition: "editorial", collection: "editorial" },
  "coastal-personal": { name: "Marissa · Coastal", background: "#F8F4EF", ink: "#17262D", muted: "#526067", accent: "#806039", panel: "#FFFDFA", light: true, composition: "coastal", collection: "paired" },
  "advisor-journal": { name: "Vance · Journal", background: "#0D0E0E", ink: "#F4EFE6", muted: "#B9B7B0", accent: "#CCB084", panel: "#191A19", light: false, composition: "journal", collection: "editorial" },
  "warm-concierge": { name: "Sloane · Discovery", background: "#211E19", ink: "#FAF5EB", muted: "#D0C2AE", accent: "#E1B77F", panel: "#302A23", light: false, composition: "discovery", collection: "compact" },
  "private-collection": { name: "Burgundy · Concierge", background: "#101011", ink: "#F9F2E8", muted: "#C5B8AA", accent: "#D4AF7A", panel: "#29151A", light: false, composition: "concierge", collection: "compact" },
  "modern-editorial": { name: "Noah · Modern", background: "#141311", ink: "#FFF8F0", muted: "#D0C2B4", accent: "#E79A79", panel: "#24211D", light: false, composition: "property", collection: "feature" },
  "portrait-statement": { name: "Mina · Quiet Luxury", background: "#111713", ink: "#F5F0E6", muted: "#C8C2B3", accent: "#C6AC7D", panel: "#1D231D", light: false, composition: "minimal", collection: "paired" },
};
export const THEME_CAROUSEL_ORDER: ClientLayoutId[] = [
  "eliza-editorial", "coastal-personal", "advisor-journal", "warm-concierge",
  "private-collection", "modern-editorial", "portrait-statement",
];
export function themeDesign(layout?: ClientLayoutId, config?: ThemeConfig): ThemeDesign {
  const id = layout ?? DEFAULT_CLIENT_LAYOUT;
  const design = THEME_DESIGNS[id] ?? THEME_DESIGNS[DEFAULT_CLIENT_LAYOUT];
  if (config?.website) return { ...design, ...config.website, name: 'My Website', light: !/^#(?:0|1|2|3)/i.test(config.website.background) };
  // Reference layouts own a coordinated palette; legacy controls apply only to legacy layouts.
  if (config?.presentationVersion === 2) return design;
  const preset = CLIENT_LAYOUTS.find(item => item.id === id);
  if (!config || config.accent === preset?.defaultTheme.accent) return design;
  const accent = THEME_ACCENTS[config.accent];
  return accent ? { ...design, accent: design.light ? accent.deep : accent.light } : design;
}
/** Presentation-only draft. Never copy a demo identity or replace canonical data. */
export function themeCandidate(saved: Brand, layoutId: ClientLayoutId): Brand {
  const layout = CLIENT_LAYOUTS.find(item => item.id === layoutId);
  if (!layout) return saved;
  if (saved.presentation !== 'website' && saved.layoutId === layoutId && saved.theme.presentationVersion === 2) return { ...saved, presentation: 'premium', themeChosen: true };
  const remembered = rememberPresentation(saved);
  return { ...remembered, layoutId, presentation: 'premium', themeChosen: true, theme: {
    ...(remembered.presentationStyles?.[layoutId] ?? layout.defaultTheme),
    website: undefined, imagePositions: saved.theme.imagePositions, portraitFit: saved.theme.portraitFit, presentationVersion: 2,
  } };
}
