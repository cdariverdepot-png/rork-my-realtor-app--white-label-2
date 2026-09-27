import type { Brand } from "@/contexts/BrandContext";
import type { BuildDraft } from "./buildService";
import type { ResolvedFact } from "./sourceModel";
import { CLIENT_LAYOUTS, isClientLayoutId } from "@/constants/clientLayouts";

/** The generated content becomes a local draft. Saving is a separate action. */
export function applyBuildDraft(base: Brand, facts: ResolvedFact[], copy: BuildDraft): Brand {
  const next: Brand = {
    ...base,
    realtor: { ...base.realtor },
    note: { ...base.note, body: [...base.note.body] },
    concierge: { ...base.concierge },
    quickContact: { ...base.quickContact },
    credentials: { ...base.credentials, license: { ...base.credentials.license } },
  };
  // Prefill every value we found, including ones the realtor is asked to
  // confirm: confirming a filled field beats retyping a blank one.
  for (const fact of facts) {
    if (!fact.value) continue;
    const [group, field, nested] = fact.field.split(".");
    if (group === "realtor" && field in next.realtor) {
      (next.realtor as unknown as Record<string, unknown>)[field] = fact.value;
    } else if (group === "credentials" && field === "license" && nested in next.credentials.license) {
      (next.credentials.license as unknown as Record<string, unknown>)[nested] = fact.value;
    } else if (fact.field === "portraitUrl" && /^https:\/\//.test(fact.value)) {
      next.portraitUrl = fact.value;
    }
  }
  if (copy.heroMessage?.trim()) next.realtor.heroMessage = copy.heroMessage.trim();
  if (copy.welcomeNote?.trim()) next.realtor.welcomeNote = copy.welcomeNote.trim();
  if (copy.tagline?.trim()) next.realtor.tagline = copy.tagline.trim();
  if (copy.aboutParagraph?.trim()) {
    next.note.title = `A note from ${next.realtor.name.split(" ")[0] || "your realtor"}`;
    next.note.body = [copy.aboutParagraph.trim()];
  }
  if (copy.conciergeLine?.trim()) next.concierge.title = copy.conciergeLine.trim();
  if (copy.contactLine?.trim()) next.quickContact.sub = copy.contactLine.trim();
  if (isClientLayoutId(copy.layoutId)) {
    next.layoutId = copy.layoutId;
    next.theme = CLIENT_LAYOUTS.find(layout => layout.id === copy.layoutId)!.defaultTheme;
  }
  return next;
}
