/**
 * Brand palette for Eliza Vance — luxury concierge realtor app.
 * Editorial / warm / exclusive.
 */
/** Brand palette — green/gold/cream. Used by the Eliza Vance demo
 *  and any realtor-customizable branded client-facing surfaces. */
export const brand = {
  forest: "#0E2A23",
  forestDeep: "#081A15",
  forestLight: "#1A3D33",
  ivory: "#F4EFE6",
  ivoryWarm: "#EDE5D6",
  paper: "#FBF8F2",
  gold: "#D2A343",
  goldLight: "#EBC776",
  goldDeep: "#9C7526",
  charcoal: "#1A1A1A",
  ink: "#2B2A26",
  muted: "#6E6A60",
  hairline: "rgba(46, 42, 32, 0.12)",
  hairlineDark: "rgba(244, 239, 230, 0.18)",
  overlay: "rgba(8, 26, 21, 0.55)",
  // Dark admin surfaces — cinematic, software-first
  nightDeep: "#08090C",
  night: "#0E0F12",
  nightHi: "rgba(255,255,255,0.05)",
  nightLo: "rgba(255,255,255,0.025)",
  nightLine: "rgba(255,255,255,0.08)",
  nightLineSoft: "rgba(255,255,255,0.05)",
  textOnDark: "#F1ECE2",
  textOnDarkMuted: "rgba(241,236,226,0.62)",
  textOnDarkDim: "rgba(241,236,226,0.40)",
} as const;

/** Dark-mode system UI palette — Apple-sleek, gold/black/white.
 *  Used for all non-branded app chrome: landing, login, admin, menus, nav. */
export const dark = {
  bg: brand.nightDeep,
  bgSurface: brand.night,
  bgCard: brand.nightHi,
  text: brand.textOnDark,
  textMuted: brand.textOnDarkMuted,
  textDim: brand.textOnDarkDim,
  gold: brand.gold,
  goldLight: brand.goldLight,
  goldSoft: "rgba(210,163,67,0.10)",
  goldGlow: "rgba(210,163,67,0.13)",
  border: brand.nightLine,
  borderStrong: "rgba(255,255,255,0.11)",
  borderGold: "rgba(210,163,67,0.32)",
  borderGoldSoft: "rgba(210,163,67,0.16)",
  green: "#62D29A",
  amber: "#F5B544",
  red: "#E5664F",
} as const;

export const fonts = {
  serif: "PlayfairDisplay_500Medium",
  serifBold: "PlayfairDisplay_700Bold",
  serifItalic: "PlayfairDisplay_500Medium_Italic",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemi: "Inter_600SemiBold",
} as const;

export default {
  light: {
    text: brand.ink,
    background: brand.paper,
    tint: brand.forest,
    tabIconDefault: brand.muted,
    tabIconSelected: brand.forest,
  },
};
