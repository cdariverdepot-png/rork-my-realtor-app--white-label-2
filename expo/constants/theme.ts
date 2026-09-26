/**
 * Realtor-customizable theme: accent color + display font.
 * These tokens drive the client-facing branded surfaces (hero, section
 * headings, notes). Admin chrome stays on the fixed dark palette.
 */
import { brand } from "@/constants/colors";

export type ThemeAccent =
  | "pewter"
  | "gold"
  | "champagne"
  | "bronze"
  | "copper"
  | "sapphire"
  | "teal"
  | "plum"
  | "emerald"
  | "sage"
  | "olive"
  | "terracotta"
  | "burgundy"
  | "rosewood"
  | "slate"
  | "ink"
  | "midnight";

export type ThemeFont =
  | "playfair"
  | "cormorant"
  | "fraunces"
  | "dmserif"
  | "garamond"
  | "baskerville"
  | "lora"
  | "montserrat"
  | "grotesk";

/** Paper tone for the client-facing canvas — the third axis of a "look". */
export type ThemeSurface = "ivory" | "warmsand" | "alabaster" | "mist" | "bone";

export type ThemeConfig = {
  /** Opt-in renderer version. Existing profiles retain their saved presentation. */
  presentationVersion?: 2;
  /** Presentation-only positions keyed by look; uploaded assets stay canonical. */
  imagePositions?: Record<string, { x: number; y: number }>;
  accent: ThemeAccent;
  displayFont: ThemeFont;
  surface: ThemeSurface;
};

/**
 * What a realtor sees before they have chosen anything.
 *
 * This deliberately is NOT the house signature look (forest/gold/Playfair) —
 * that palette belongs to the Eliza Vance showcase. A brand-new realtor opening
 * an untouched template should read "blank and well-made", not "someone else's
 * brand I have to undo".
 *
 * Cool pewter on near-black with an architectural grotesque: a drafting-table
 * look that is unmistakably a *template*. Warm ink was the wrong call — against
 * a warm cream canvas it just read as a dimmer version of the gold showcase.
 */
export const DEFAULT_THEME: ThemeConfig = {
  accent: "pewter",
  displayFont: "grotesk",
  surface: "alabaster",
};

/** The demo showcase's own look, kept separate so the default can never drift
 *  back into it. Only buildDemoSeed should use this. */
export const SIGNATURE_THEME: ThemeConfig = {
  accent: "gold",
  displayFont: "playfair",
  surface: "ivory",
};

export type SurfaceTokens = {
  /** The page canvas clients scroll on. */
  paper: string;
  /** Raised cards sitting on the canvas. */
  panel: string;
  /** Hairline rules and card borders. */
  hairline: string;
};

export const THEME_SURFACES: Record<
  ThemeSurface,
  SurfaceTokens & { label: string; note: string }
> = {
  ivory: {
    label: "Ivory",
    note: "Warm gallery white",
    paper: "#FBF8F2",
    panel: "#FFFDF8",
    hairline: "rgba(33,28,18,0.12)",
  },
  warmsand: {
    label: "Warm Sand",
    note: "Sunlit, earthy",
    paper: "#F3EADC",
    panel: "#FBF4E9",
    hairline: "rgba(58,44,26,0.14)",
  },
  alabaster: {
    label: "Alabaster",
    note: "Crisp and quiet",
    paper: "#F7F6F3",
    panel: "#FFFFFF",
    hairline: "rgba(28,28,26,0.11)",
  },
  mist: {
    label: "Mist",
    note: "Cool coastal grey",
    paper: "#EFF1F1",
    panel: "#F9FAFA",
    hairline: "rgba(20,28,30,0.12)",
  },
  bone: {
    label: "Bone",
    note: "Deep, printed paper",
    paper: "#EAE4D8",
    panel: "#F5F0E6",
    hairline: "rgba(44,38,26,0.16)",
  },
};

export const SURFACE_ORDER: ThemeSurface[] = [
  "ivory",
  "warmsand",
  "alabaster",
  "mist",
  "bone",
];

export type AccentTokens = {
  base: string;
  light: string;
  deep: string;
};

/** Curated accent palettes — each reads as luxury metallic / jewel tone
 *  on both the cream and the dark/forest branded surfaces. */
export type AccentFamily = "Metals" | "Jewels" | "Greens" | "Earth" | "Neutrals";

export const THEME_ACCENTS: Record<
  ThemeAccent,
  AccentTokens & { label: string; family: AccentFamily }
> = {
  // Metals
  gold: { label: "Gold", family: "Metals", base: brand.gold, light: brand.goldLight, deep: brand.goldDeep },
  champagne: { label: "Champagne", family: "Metals", base: "#C8B48C", light: "#E2D3B2", deep: "#9E8A63" },
  bronze: { label: "Bronze", family: "Metals", base: "#A07C4B", light: "#C6A576", deep: "#7A5C34" },
  copper: { label: "Copper", family: "Metals", base: "#B06C49", light: "#D89B77", deep: "#834A2E" },
  // Jewels
  sapphire: { label: "Sapphire", family: "Jewels", base: "#4A6FA5", light: "#86A6D2", deep: "#324E78" },
  teal: { label: "Teal", family: "Jewels", base: "#2F7E78", light: "#6FB1AB", deep: "#1E5853" },
  plum: { label: "Plum", family: "Jewels", base: "#6E4B7A", light: "#A382AE", deep: "#4C3056" },
  // Greens
  emerald: { label: "Emerald", family: "Greens", base: "#3E7A5B", light: "#79AE90", deep: "#27543D" },
  sage: { label: "Sage", family: "Greens", base: "#7C8A66", light: "#AEBB98", deep: "#56654A" },
  olive: { label: "Olive", family: "Greens", base: "#6B6A3C", light: "#9C9A68", deep: "#4A4926" },
  // Earth
  terracotta: { label: "Terracotta", family: "Earth", base: "#B5663F", light: "#D89571", deep: "#8A4928" },
  burgundy: { label: "Burgundy", family: "Earth", base: "#9A4B57", light: "#C8838E", deep: "#6E2F39" },
  rosewood: { label: "Rosewood", family: "Earth", base: "#8E5A5C", light: "#BC8889", deep: "#653C3E" },
  // Neutrals
  // The white-label default. Cool steel reads as "drawing, not decoration" — it
  // cannot be mistaken for a metallic house palette the way warm ink could.
  pewter: { label: "Pewter", family: "Neutrals", base: "#7E8896", light: "#C3CBD5", deep: "#454F5C" },
  slate: { label: "Slate", family: "Neutrals", base: "#6E7886", light: "#9AA3AF", deep: "#4A525C" },
  ink: { label: "Ink", family: "Neutrals", base: "#4A4640", light: "#7C766C", deep: "#2E2B26" },
  midnight: { label: "Midnight", family: "Neutrals", base: "#3A4658", light: "#6C788C", deep: "#25303F" },
};

export const ACCENT_FAMILY_ORDER: AccentFamily[] = [
  "Metals",
  "Jewels",
  "Greens",
  "Earth",
  "Neutrals",
];

/** The deep band behind hero, footer and feature sections.
 *  Every accent needs a dark companion that is unmistakably part of the same
 *  palette — a green band under a terracotta accent is what made the template
 *  look borrowed. */
export type BandTokens = {
  /** Section bands sitting on the page. */
  base: string;
  /** The deepest surface — hero backdrop, footer, app root. */
  deep: string;
  /** Hairlines drawn on the band. */
  hairline: string;
};

/** Everything drawn ON a dark band. Hardcoding these as ivory/forest is what
 *  kept the showcase's warm cream and green fades on every other palette. */
export type OnBandTokens = {
  text: string;
  muted: string;
  dim: string;
  /** Photo scrim, mid stop — matched to the band so fades never go green. */
  scrimSoft: string;
  /** Photo scrim, bottom stop. */
  scrimStrong: string;
  /** Translucent icon-button / chip fill sitting on the band. */
  veil: string;
  /** Border for those translucent controls. */
  veilLine: string;
};

/** Gold keeps the showcase's exact cream so the demo stays pixel-identical. */
const BAND_TEXT: Partial<Record<ThemeAccent, string>> = { gold: brand.ivory };
const BAND_TEXT_FALLBACK = "#F1F2F4";

function rgbaFromHex(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const THEME_BANDS: Record<ThemeAccent, BandTokens> = {
  // Metals — gold keeps the house forest so the showcase is untouched.
  gold: { base: brand.forest, deep: brand.forestDeep, hairline: "rgba(244,239,230,0.16)" },
  champagne: { base: "#26221B", deep: "#171410", hairline: "rgba(240,234,222,0.16)" },
  bronze: { base: "#241C13", deep: "#15100A", hairline: "rgba(240,232,220,0.16)" },
  copper: { base: "#261A13", deep: "#160E09", hairline: "rgba(242,230,222,0.16)" },
  // Jewels
  sapphire: { base: "#141E2E", deep: "#0B121C", hairline: "rgba(226,234,246,0.16)" },
  teal: { base: "#0E2523", deep: "#071614", hairline: "rgba(224,240,238,0.16)" },
  plum: { base: "#221729", deep: "#140D19", hairline: "rgba(238,228,244,0.16)" },
  // Greens
  emerald: { base: "#10281D", deep: "#081810", hairline: "rgba(226,240,232,0.16)" },
  sage: { base: "#1D2117", deep: "#11140D", hairline: "rgba(234,238,226,0.16)" },
  olive: { base: "#1E1E12", deep: "#12120A", hairline: "rgba(238,238,224,0.16)" },
  // Earth
  terracotta: { base: "#2A1810", deep: "#190D07", hairline: "rgba(246,230,222,0.16)" },
  burgundy: { base: "#26141A", deep: "#160A0E", hairline: "rgba(246,228,232,0.16)" },
  rosewood: { base: "#241618", deep: "#150C0E", hairline: "rgba(244,230,230,0.16)" },
  // Neutrals
  pewter: { base: "#191D22", deep: "#0D1014", hairline: "rgba(233,238,244,0.16)" },
  slate: { base: "#1A1E23", deep: "#0F1216", hairline: "rgba(232,236,242,0.16)" },
  ink: { base: "#1C1A17", deep: "#100F0D", hairline: "rgba(240,236,228,0.16)" },
  midnight: { base: "#161C25", deep: "#0C1117", hairline: "rgba(230,236,246,0.16)" },
};

export type DisplayFontTokens = {
  display: string;
  displayBold: string;
  displayItalic: string;
};

/** Display fonts the realtor can pick for headlines and editorial copy.
 *  All families are preloaded in the root layout. */
export const THEME_FONTS: Record<
  ThemeFont,
  DisplayFontTokens & { label: string; note: string }
> = {
  playfair: {
    label: "Editorial",
    note: "Playfair Display",
    display: "PlayfairDisplay_500Medium",
    displayBold: "PlayfairDisplay_700Bold",
    displayItalic: "PlayfairDisplay_500Medium_Italic",
  },
  cormorant: {
    label: "Classic",
    note: "Cormorant Garamond",
    display: "CormorantGaramond_500Medium",
    displayBold: "CormorantGaramond_600SemiBold",
    displayItalic: "CormorantGaramond_500Medium_Italic",
  },
  fraunces: {
    label: "Modern",
    note: "Fraunces",
    display: "Fraunces_500Medium",
    displayBold: "Fraunces_600SemiBold",
    displayItalic: "Fraunces_500Medium_Italic",
  },
  dmserif: {
    label: "Dramatic",
    note: "DM Serif Display",
    display: "DMSerifDisplay_400Regular",
    displayBold: "DMSerifDisplay_400Regular",
    displayItalic: "DMSerifDisplay_400Regular_Italic",
  },
  garamond: {
    label: "Refined",
    note: "EB Garamond",
    display: "EBGaramond_500Medium",
    displayBold: "EBGaramond_600SemiBold",
    displayItalic: "EBGaramond_500Medium_Italic",
  },
  baskerville: {
    label: "Traditional",
    note: "Libre Baskerville",
    display: "LibreBaskerville_400Regular",
    displayBold: "LibreBaskerville_700Bold",
    displayItalic: "LibreBaskerville_400Regular_Italic",
  },
  lora: {
    label: "Warm",
    note: "Lora",
    display: "Lora_500Medium",
    displayBold: "Lora_600SemiBold",
    displayItalic: "Lora_500Medium_Italic",
  },
  montserrat: {
    label: "Clean",
    note: "Montserrat",
    display: "Montserrat_600SemiBold",
    displayBold: "Montserrat_600SemiBold",
    displayItalic: "Montserrat_500Medium_Italic",
  },
  grotesk: {
    label: "Architectural",
    note: "Space Grotesk",
    display: "SpaceGrotesk_500Medium",
    displayBold: "SpaceGrotesk_600SemiBold",
    displayItalic: "SpaceGrotesk_500Medium",
  },
};

/**
 * A complete, pre-composed look — colour, typography and paper in one tap.
 *
 * Most realtors are not designers; picking three axes independently is how you
 * end up with a lilac accent on grey paper. Looks are the front door, the
 * individual axes stay available underneath for anyone who wants them.
 */
export type ThemeLook = {
  id: string;
  name: string;
  blurb: string;
  accent: ThemeAccent;
  displayFont: ThemeFont;
  surface: ThemeSurface;
};

export const THEME_LOOKS: ThemeLook[] = [
  { id: "neutral-start", name: "Neutral", blurb: "Unbranded — the starting point", accent: "pewter", displayFont: "grotesk", surface: "alabaster" },
  { id: "slate", name: "Slate", blurb: "Quiet, modern, understated", accent: "slate", displayFont: "playfair", surface: "ivory" },
  { id: "midnight-bronze", name: "Midnight Bronze", blurb: "Evening light, high drama", accent: "bronze", displayFont: "playfair", surface: "warmsand" },
  { id: "coastal", name: "Coastal Editorial", blurb: "Airy, blue-hour, classic", accent: "sapphire", displayFont: "cormorant", surface: "ivory" },
  { id: "sage-refined", name: "Sage Refined", blurb: "Garden calm, softly formal", accent: "sage", displayFont: "garamond", surface: "alabaster" },
  { id: "warm-terracotta", name: "Warm Terracotta", blurb: "Sun-baked and welcoming", accent: "terracotta", displayFont: "baskerville", surface: "warmsand" },
  { id: "forest-gold", name: "Forest & Gold", blurb: "The signature house look", accent: "gold", displayFont: "playfair", surface: "ivory" },
  { id: "ink-architect", name: "Ink Architect", blurb: "Structural, spare, precise", accent: "ink", displayFont: "grotesk", surface: "alabaster" },
  { id: "burgundy-classic", name: "Burgundy Classic", blurb: "Old-world and established", accent: "burgundy", displayFont: "lora", surface: "bone" },
  { id: "harbor-teal", name: "Harbor Teal", blurb: "Cool, coastal, contemporary", accent: "teal", displayFont: "fraunces", surface: "mist" },
  { id: "champagne-dramatic", name: "Champagne", blurb: "Luxury, black-tie confidence", accent: "champagne", displayFont: "dmserif", surface: "ivory" },
];

/** Returns the look matching an exact accent/font/surface combination, if any. */
export function matchLook(theme: ThemeConfig): ThemeLook | undefined {
  return THEME_LOOKS.find(
    (l) =>
      l.accent === theme.accent &&
      l.displayFont === theme.displayFont &&
      l.surface === theme.surface
  );
}

/* ------------------------------ Contrast ------------------------------ */

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.1. Accepts `#RRGGBB`. */
function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export type ContrastGrade = "aaa" | "aa" | "large" | "fail";

export type ContrastResult = {
  ratio: number;
  grade: ContrastGrade;
  label: string;
  detail: string;
};

/**
 * Scores a foreground against a background so the studio can warn a realtor
 * before they ship a palette their clients cannot read.
 */
export function contrastCheck(foreground: string, background: string): ContrastResult {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (ratio >= 7)
    return { ratio, grade: "aaa", label: "Excellent", detail: "Exceeds WCAG AAA for normal text" };
  if (ratio >= 4.5)
    return { ratio, grade: "aa", label: "Good", detail: "Meets WCAG AA for normal text" };
  if (ratio >= 3)
    return { ratio, grade: "large", label: "Headlines only", detail: "Readable at large sizes, tight for body copy" };
  return { ratio, grade: "fail", label: "Hard to read", detail: "Below WCAG minimum — clients will struggle" };
}

/**
 * How the credentials band renders on the client home. The theme owns this —
 * the realtor never picks a layout, they only supply the facts. Structured
 * credential data means each look can present the same record differently.
 *
 * - `plate`   — engraved centre-aligned list, formal and diploma-like.
 * - `column`  — left-aligned editorial stack with hairline dividers.
 * - `inline`  — compact small-caps row, for spare/structural looks.
 */
export type CredentialsLayout = "plate" | "column" | "inline";

/** Display font drives the credentials treatment, so the band always matches
 *  the voice of the look it sits inside. */
const CREDENTIALS_LAYOUTS: Record<ThemeFont, CredentialsLayout> = {
  playfair: "plate",
  cormorant: "plate",
  garamond: "column",
  baskerville: "column",
  lora: "column",
  fraunces: "column",
  dmserif: "plate",
  montserrat: "inline",
  grotesk: "inline",
};

export type ThemeTokens = {
  accent: AccentTokens;
  surface: SurfaceTokens;
  /** Dark bands (hero, footer, feature sections) matched to the accent. */
  band: BandTokens;
  /** Text, scrims and controls drawn on top of those bands. */
  onBand: OnBandTokens;
  display: string;
  displayBold: string;
  displayItalic: string;
  /** Theme-chosen presentation for the credentials band. */
  credentials: CredentialsLayout;
};

export function resolveTheme(theme?: Partial<ThemeConfig>): ThemeTokens {
  const accentId = theme?.accent ?? DEFAULT_THEME.accent;
  const fontId = theme?.displayFont ?? DEFAULT_THEME.displayFont;
  const surfaceId = theme?.surface ?? DEFAULT_THEME.surface;
  const a = THEME_ACCENTS[accentId] ?? THEME_ACCENTS.pewter;
  const f = THEME_FONTS[fontId] ?? THEME_FONTS.grotesk;
  const s = THEME_SURFACES[surfaceId] ?? THEME_SURFACES.alabaster;
  const bd = THEME_BANDS[accentId] ?? THEME_BANDS.pewter;
  const onText = BAND_TEXT[accentId] ?? BAND_TEXT_FALLBACK;
  return {
    accent: { base: a.base, light: a.light, deep: a.deep },
    surface: { paper: s.paper, panel: s.panel, hairline: s.hairline },
    band: { base: bd.base, deep: bd.deep, hairline: bd.hairline },
    onBand: {
      text: onText,
      muted: rgbaFromHex(onText, 0.65),
      dim: rgbaFromHex(onText, 0.45),
      scrimSoft: rgbaFromHex(bd.deep, 0.72),
      scrimStrong: rgbaFromHex(bd.deep, 0.92),
      veil: rgbaFromHex(bd.deep, 0.3),
      veilLine: rgbaFromHex(onText, 0.3),
    },
    display: f.display,
    displayBold: f.displayBold,
    displayItalic: f.displayItalic,
    credentials: CREDENTIALS_LAYOUTS[fontId] ?? "plate",
  };
}
