import type { ClientLayoutId } from "./clientLayouts";
/** Review artifacts only. These flattened mockups are never used as a live theme. */
export const THEME_REFERENCES: Record<ClientLayoutId, { source: number; aspect: number }> = {
  "coastal-personal": { source: require("@/assets/theme-references/marissa.jpg"), aspect: 462 / 1000 },
  "advisor-journal": { source: require("@/assets/theme-references/vance.jpg"), aspect: 462 / 1000 },
  "warm-concierge": { source: require("@/assets/theme-references/sloane.png"), aspect: 852 / 1846 },
  "eliza-editorial": { source: require("@/assets/theme-references/eliza.jpg"), aspect: 1242 / 2688 },
  "private-collection": { source: require("@/assets/theme-references/burgundy.jpg"), aspect: 1242 / 2688 },
  "modern-editorial": { source: require("@/assets/theme-references/nora.jpg"), aspect: 1242 / 2688 },
  "portrait-statement": { source: require("@/assets/theme-references/mina.png"), aspect: 941 / 1672 },
};
