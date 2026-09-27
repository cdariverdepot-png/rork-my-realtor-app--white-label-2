/** https:// is assumed when left off; a hostname needs a dot to count. */
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (parsed.protocol !== "https:" || !/\.[a-z]{2,}$/i.test(parsed.hostname)) return null;
    return parsed.toString();
  } catch { return null; }
}

export type WebsiteState = "empty" | "valid" | "invalid";
export const websiteState = (raw: string): WebsiteState =>
  !raw.trim() ? "empty" : normalizeUrl(raw) ? "valid" : "invalid";
