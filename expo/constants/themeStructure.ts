import type { ClientSectionId } from "./sections";
import { DEFAULT_CLIENT_LAYOUT, type ClientLayoutId } from "@/constants/clientLayouts";

/** Presentation only. Visibility is decided by the canonical content rules first. */
export const THEME_SECTION_ORDER: Record<ClientLayoutId, readonly ClientSectionId[]> = {
  "private-collection": ["hero", "listings", "concierge", "social", "note", "beat", "credentials", "quickContact", "support", "footer"],
  "coastal-personal": ["hero", "listings", "quickContact", "note", "concierge", "credentials", "social", "beat", "support", "footer"],
  "modern-editorial": ["hero", "listings", "quickContact", "beat", "social", "note", "concierge", "credentials", "support", "footer"],
  "advisor-journal": ["hero", "beat", "listings", "note", "credentials", "concierge", "social", "quickContact", "support", "footer"],
  "portrait-statement": ["hero", "listings", "concierge", "note", "social", "beat", "credentials", "quickContact", "support", "footer"],
  "warm-concierge": ["hero", "listings", "concierge", "quickContact", "note", "beat", "social", "credentials", "support", "footer"],
  "eliza-editorial": ["hero", "listings", "note", "beat", "quickContact", "concierge", "credentials", "social", "support", "footer"],
};

export function orderThemeSections(sections: ClientSectionId[], layout?: ClientLayoutId) {
  const order = THEME_SECTION_ORDER[layout ?? DEFAULT_CLIENT_LAYOUT] ?? THEME_SECTION_ORDER[DEFAULT_CLIENT_LAYOUT];
  const rank = (id: ClientSectionId) => order.includes(id) ? order.indexOf(id) : order.length;
  return [...sections].sort((a, b) => rank(a) - rank(b));
}
