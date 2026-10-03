import type { Brand } from "@/contexts/BrandContext";
/** Content and presentation saves cannot overwrite the other editor's data. */
export function editorSave(saved: Brand, draft: Brand, mode: "content" | "theme"): Brand {
  const presentation = { layoutId: draft.layoutId, presentation: draft.presentation, websiteVariant: draft.websiteVariant,
    websiteDesign: draft.websiteDesign, websiteStyles: draft.websiteStyles, previousWebsiteDesign: draft.previousWebsiteDesign,
    presentationStyles: draft.presentationStyles, theme: draft.theme, themeChosen: true };
  return mode === 'theme' ? { ...saved, ...presentation } :
    { ...draft, layoutId: saved.layoutId, presentation: saved.presentation, websiteVariant: saved.websiteVariant,
      presentationStyles: saved.presentationStyles, theme: saved.theme, themeChosen: saved.themeChosen };
}
