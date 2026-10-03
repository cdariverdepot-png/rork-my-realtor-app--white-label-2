import { SCREEN_BG } from "./backdrops";
import { themeDesign } from "./themeDesigns";
import type { ClientLayoutId } from "./clientLayouts";
import type { ThemeConfig } from "./theme";

/** Client surfaces. Carousel artwork deliberately retains its original palette. */
export const LIVE_THEME_MATERIALS = {
  "eliza-editorial": {
    font: "CormorantGaramond_500Medium",
    bg: "#071B19",
    ink: "#F5F1E7",
    accent: "#D8C29B",
    paper: "#E7E1D3",
    photo: SCREEN_BG.listings,
    radius: 2,
    mood: "THE PRIVATE EDIT",
  },
  "coastal-personal": {
    font: "Fraunces_500Medium",
    bg: "#EBF0EC",
    ink: "#143F48",
    accent: "#396F78",
    paper: "#FFFFFF",
    photo: SCREEN_BG.listings,
    radius: 30,
    mood: "A LIFE BY THE WATER",
  },
  "advisor-journal": {
    font: "LibreBaskerville_400Regular",
    bg: "#111E2A",
    ink: "#F4F1E7",
    accent: "#ACCADD",
    paper: "#E5EDF0",
    photo: SCREEN_BG.documents,
    radius: 3,
    mood: "THE PROPERTY JOURNAL",
  },
  "warm-concierge": {
    font: "Lora_500Medium",
    bg: "#081F25",
    ink: "#F8F4E9",
    accent: "#CDE1D9",
    paper: "#DFEBE5",
    photo: SCREEN_BG.book,
    radius: 28,
    mood: "PERSONAL, BY DESIGN",
  },
  "private-collection": {
    font: "EBGaramond_500Medium",
    bg: "#1A1024",
    ink: "#FFF5ED",
    accent: "#E7C8A4",
    paper: "#F1E5D5",
    photo: SCREEN_BG.portal,
    radius: 10,
    mood: "THE PRIVATE COLLECTION",
  },
  "modern-editorial": {
    font: "SpaceGrotesk_500Medium",
    bg: "#101A32",
    ink: "#F9F6EF",
    accent: "#F4A68F",
    paper: "#EEE7DF",
    photo: SCREEN_BG.calendar,
    radius: 8,
    mood: "A DIFFERENT PERSPECTIVE",
  },
  "portrait-statement": {
    font: "DMSerifDisplay_400Regular",
    bg: "#112723",
    ink: "#F1F3EA",
    accent: "#BDD7C7",
    paper: "#E8EDE4",
    photo: SCREEN_BG.favorites,
    radius: 1,
    mood: "HOME, CONSIDERED",
  },
} as const;
export function liveThemeDesign(id?: ClientLayoutId, config?: ThemeConfig) {
  const key = id ?? "private-collection",
    base = themeDesign(key, config),
    m = LIVE_THEME_MATERIALS[key];
  return {
    ...base,
    background: m.bg,
    ink: m.ink,
    accent: m.accent,
    panel: key === "coastal-personal" ? "#FFFFFF" : m.bg,
    muted: key === "coastal-personal" ? "#4C6970" : "#D4DDE0",
    light: key === "coastal-personal",
  };
}
