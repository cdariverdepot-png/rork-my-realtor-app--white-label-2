/** Structural equality for persisted JSON blobs (brand, listings, etc.). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    // Postgres JSONB reorders object keys. Preserve array order, but compare
    // object fields canonically so hydration cannot manufacture a dirty draft.
    const canonical = (value: unknown) => JSON.stringify(value, (_key, entry) =>
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
    return canonical(a) === canonical(b);
  } catch {
    return false;
  }
}
