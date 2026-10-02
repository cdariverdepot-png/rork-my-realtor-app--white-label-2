import type { Brand } from "@/contexts/BrandContext";
import type { BuildDraft } from "./buildService";
import type { ResolvedFact } from "./sourceModel";
import { CLIENT_LAYOUTS, isClientLayoutId } from "@/constants/clientLayouts";

/** True when `name` is just the email local-part (legacy signup/DB habit), not a real display name. */
export function isEmailLocalPartName(name: string, email: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  const local = (email.split("@")[0] ?? "").trim().toLowerCase();
  return !!local && n === local;
}

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
    // Keep a real signup display name; never protect an email-local-part stand-in
    // (older rows / metadata gaps) — a scraped website name should win there.
    if (
      fact.field === "realtor.name" &&
      next.realtor.name.trim() &&
      !isEmailLocalPartName(next.realtor.name, next.realtor.email)
    ) {
      continue;
    }
    if (group === "realtor" && field in next.realtor) {
      (next.realtor as unknown as Record<string, unknown>)[field] = fact.value;
    } else if (group === "credentials" && field === "license" && nested in next.credentials.license) {
      (next.credentials.license as unknown as Record<string, unknown>)[nested] = fact.value;
    } else if (fact.field === "portraitUrl" && /^https:\/\//.test(fact.value)) {
      next.portraitUrl = fact.value;
    }
  }
  // Drop leftover login handles so the review asks for a real name instead of
  // treating "jdouglastaylor" as a completed display name.
  if (isEmailLocalPartName(next.realtor.name, next.realtor.email)) {
    next.realtor.name = "";
  }
  // Brand lockup derived only from an email handle is not a business name.
  if (isEmailLocalPartName(next.realtor.brandName, next.realtor.email)) {
    next.realtor.brandName = "";
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
    const layout = CLIENT_LAYOUTS.find(layout => layout.id === copy.layoutId)!;
    next.layoutId = copy.layoutId;
    // Opt into the real themed canvases (ReferenceHome / ThemeFace). Without
    // presentationVersion 2 the client falls back to muddy stub surfaces.
    next.themeChosen = true;
    next.theme = {
      ...layout.defaultTheme,
      imagePositions: next.theme?.imagePositions,
      portraitFit: next.theme?.portraitFit,
      presentationVersion: 2,
    };
  }
  return next;
}
