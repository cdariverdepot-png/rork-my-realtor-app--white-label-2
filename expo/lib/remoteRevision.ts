/** Forced reads may repair a cold cache, but never overwrite an edit made during the read. */
export function shouldApplyRemoteRevision(remote: number, local: number, meta?: { initial?: boolean; forced?: boolean; startedRev?: number }) {
  if (remote > local) return true;
  return !!(meta?.initial || meta?.forced) && (meta.startedRev === undefined || meta.startedRev === local);
}
