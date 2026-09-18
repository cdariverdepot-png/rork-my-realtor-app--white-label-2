import type { ThemeConfig } from "@/constants/theme";

/** Layout is separate from content and palette. Switching layouts must not
 * erase a realtor's profile, listings, or generated copy. */
export type ClientLayoutId =
  | "private-collection"
  | "coastal-personal"
  | "modern-editorial"
  | "advisor-journal"
  | "portrait-statement"
  | "warm-concierge";

export type ClientLayout = {
  id: ClientLayoutId;
  name: string;
  description: string;
  defaultTheme: ThemeConfig;
  /** Signals for choosing a starting layout from supplied source material. */
  signals: string[];
};

export const DEFAULT_CLIENT_LAYOUT: ClientLayoutId = "private-collection";

export const CLIENT_LAYOUTS: ClientLayout[] = [
  {
    id: "private-collection",
    name: "Private Collection",
    description: "Dark, polished, and collection led.",
    defaultTheme: { accent: "burgundy", displayFont: "playfair", surface: "bone" },
    signals: ["luxury", "private", "editorial", "exclusive", "formal"],
  },
  {
    id: "coastal-personal",
    name: "Coastal Personal",
    description: "Bright, approachable, and portrait led.",
    defaultTheme: { accent: "champagne", displayFont: "cormorant", surface: "ivory" },
    signals: ["coastal", "airy", "warm", "personal", "light"],
  },
  {
    id: "modern-editorial",
    name: "Modern Editorial",
    description: "Dark presentation with homes in focus.",
    defaultTheme: { accent: "terracotta", displayFont: "fraunces", surface: "bone" },
    signals: ["modern", "architectural", "bold", "contemporary"],
  },
  {
    id: "advisor-journal",
    name: "Advisor Journal",
    description: "Quiet, considered, and story led.",
    defaultTheme: { accent: "gold", displayFont: "lora", surface: "bone" },
    signals: ["advisor", "bespoke", "storytelling", "discreet"],
  },
  {
    id: "portrait-statement",
    name: "Portrait Statement",
    description: "A personal introduction with large type.",
    defaultTheme: { accent: "champagne", displayFont: "playfair", surface: "ivory" },
    signals: ["personal brand", "portrait", "high touch", "statement"],
  },
  {
    id: "warm-concierge",
    name: "Warm Concierge",
    description: "Welcoming, conversational, and action led.",
    defaultTheme: { accent: "bronze", displayFont: "fraunces", surface: "warmsand" },
    signals: ["friendly", "local", "concierge", "welcoming", "family"],
  },
];

export function isClientLayoutId(value: unknown): value is ClientLayoutId {
  return typeof value === "string" && CLIENT_LAYOUTS.some((layout) => layout.id === value);
}
