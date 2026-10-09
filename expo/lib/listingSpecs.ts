/**
 * Beds, baths and size a listing actually published. A source that did not publish a value leaves
 * it at 0 or empty; showing "0 beds · 0 baths" would state something false, so unknowns are omitted.
 */
type Specs = { beds?: number; baths?: number; sqft?: string };
type Style = "short" | "upper" | "long";

const known = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
const knownSize = (value: unknown) => typeof value === "string" && value.trim() !== "" && !/^(?:0+|n\/?a|null|undefined|-+)$/i.test(value.trim());

/**
 * Interior size as clients read it: a bare number from the source ("2,129") gains its unit ("2,129 sq ft");
 * a size that already names its unit ("1,850 sq ft", "0.5 acres") is shown as published. Unknown sizes are "".
 */
export function sizeLabel(value: unknown): string {
  if (!knownSize(value)) return "";
  const size = (value as string).trim();
  return /^\d[\d,]*(?:\.\d+)?$/.test(size) ? `${size} sq ft` : size;
}

export function specParts(item: Specs, style: Style = "short"): string[] {
  const label = { short: ["bd", "ba"], upper: ["BD", "BA"], long: ["beds", "baths"] }[style];
  return [
    known(item.beds) ? `${item.beds} ${style === "long" && item.beds === 1 ? "bed" : label[0]}` : "",
    known(item.baths) ? `${item.baths} ${style === "long" && item.baths === 1 ? "bath" : label[1]}` : "",
    sizeLabel(item.sqft),
  ].filter(Boolean);
}

export const specLine = (item: Specs, style: Style = "short", withSize = true) =>
  specParts(withSize ? item : { ...item, sqft: undefined }, style).join(" · ");
export const hasValue = known;
