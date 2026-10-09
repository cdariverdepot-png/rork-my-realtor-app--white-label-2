/**
 * Import isolation for the app builder. A realtor can change the website they build from; every import gets
 * its own session, and the review shows only the listing sources that session connected. Homes imported from
 * another website (earlier, or by a slower import still finishing) are never shown as this website's homes.
 */
type Scoped = { sourceId?: string; sourceArchived?: boolean };

/** Only homes from the given sources, and never an archived (disconnected) one. No sources means no homes. */
export function listingsForSources<T extends Scoped>(listings: T[], sourceIds: readonly string[]): T[] {
  if (!sourceIds.length) return [];
  const allowed = new Set(sourceIds);
  return listings.filter(item => !!item.sourceId && allowed.has(item.sourceId) && !item.sourceArchived);
}

/** A unique id for one import run (server accepts [\w-]{8,64}). */
export function newImportSession(): string {
  const random = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `setup-${random}`.slice(0, 64);
}

/**
 * The import session the builder is currently showing, shared by every builder screen instance: leaving the
 * builder mid-import and starting again from another website supersedes the earlier run even though it belongs
 * to a screen that is gone.
 */
let activeImportSession = "";
export function beginImportSession(): string {
  activeImportSession = newImportSession();
  return activeImportSession;
}
export function isActiveImportSession(session: string): boolean {
  return !!session && session === activeImportSession;
}

/**
 * Returning to a review: its homes and its count belong to the listing sources connected now. A replaced website's
 * archived homes, hidden homes or anything else saved in the account never count as this import's. Builds from
 * before connected sources kept their homes in the build draft; those are restored only when nothing is connected
 * and nothing is saved.
 */
export function resumedReviewScope(connectedSourceIds: readonly string[] | null, savedHomes: number) {
  const ids = [...(connectedSourceIds ?? [])];
  return { reviewSourceIds: ids, hasConnectedSource: ids.length > 0, restoreDraftListings: !ids.length && savedHomes === 0 };
}

/** The count the review states: this import's saved homes, or the import's own count until they arrive. */
export function reviewListingCount<T extends Scoped & { hidden?: boolean }>(listings: T[], sourceIds: readonly string[], importedCount: number): number {
  return listingsForSources(listings, sourceIds).filter(item => !item.hidden).length || importedCount;
}
