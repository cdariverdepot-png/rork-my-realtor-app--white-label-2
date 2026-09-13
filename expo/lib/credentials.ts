import type { CredentialsRecord } from "@/contexts/BrandContext";
const filled = (value?: string) => Boolean(value?.trim());
/** Blank repeater rows are editor placeholders, not client-facing content. */
export function hasCredentials(c: CredentialsRecord | undefined): boolean {
  return Boolean(c && (
    c.designations.some(d => filled(d.name) || filled(d.mark)) ||
    c.education.some(e => filled(e.institution) || filled(e.credential)) ||
    c.awards.some(a => filled(a.title)) ||
    c.memberships.some(filled) || c.languages.some(filled)
  ));
}
