/** Fill missing schema fields without deleting saved copy or replacing arrays.
 * Matching demo copy is not proof that a user did not choose that content.
 */
export function preserveProfile<T>(defaults: T, saved: unknown): T {
  if (saved === undefined) return defaults;
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return saved as T;
  const base = defaults && typeof defaults === 'object' && !Array.isArray(defaults)
    ? defaults as Record<string, unknown> : {};
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(saved)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    result[key] = preserveProfile(base[key], value);
  }
  return result as T;
}
