import type { Brand } from "@/contexts/BrandContext";
/** Content and presentation saves cannot overwrite the other editor's data. */
export function editorSave(saved: Brand, draft: Brand, mode: "content" | "theme"): Brand {
  return mode === "theme" ? { ...saved, layoutId: draft.layoutId, theme: draft.theme, themeChosen: true } :
    { ...draft, layoutId: saved.layoutId, theme: saved.theme, themeChosen: saved.themeChosen };
}
