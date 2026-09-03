/**
 * Image cache busting.
 *
 * Devices aggressively cache images at the same URL — when the realtor swaps a
 * listing photo, the URL often stays identical (same Storage path) so the
 * client never re-fetches. Appending a version query string forces every
 * device to treat the new image as a different resource.
 *
 * `v` is the listing/blob `updatedAt` (epoch ms). Non-remote sources
 * (`data:`, `file:`, bundled `require`-resolved assets) are returned as-is —
 * appending a query string to them either breaks them or has no effect.
 */
export function bustedUri(uri: string | undefined, version: number | undefined): string | undefined {
  if (!uri || typeof uri !== "string") return uri;
  if (!version || !Number.isFinite(version)) return uri;
  // Only meaningful for remote http(s) URLs.
  if (!/^https?:\/\//i.test(uri)) return uri;
  const sep = uri.includes("?") ? "&" : "?";
  return `${uri}${sep}v=${version}`;
}
