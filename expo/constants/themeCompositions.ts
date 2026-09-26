/** Geometry traced from the supplied phone mockups, not derived from Eliza. */
export const THEME_COMPOSITIONS = {
  editorial: { textWidth: 1, title: 49, leading: 51, top: 230, minimum: 760, portraitLeft: 0, signature: false },
  coastal: { textWidth: 0.50, title: 33, leading: 34, top: 26, minimum: 410, portraitLeft: 0, signature: true },
  journal: { textWidth: 0.49, title: 34, leading: 36, top: 50, minimum: 425, portraitLeft: 0, signature: false },
  discovery: { textWidth: 0.49, title: 43, leading: 43, top: 45, minimum: 380, portraitLeft: 0, signature: false },
  concierge: { textWidth: 0.53, title: 36, leading: 37, top: 26, minimum: 390, portraitLeft: 0, signature: false },
  property: { textWidth: 0.49, title: 40, leading: 41, top: 35, minimum: 400, portraitLeft: 0, signature: false },
  minimal: { textWidth: 0.69, title: 43, leading: 44, top: 50, minimum: 390, portraitLeft: 0, signature: false },
} as const;
