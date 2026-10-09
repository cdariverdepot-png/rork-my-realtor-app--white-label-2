/**
 * Homes shown only in a preview of an unpublished website change (see hooks/usePendingWebsite) carry this id
 * prefix. They are never written to the saved listing collection.
 */
export const DRAFT_HOME_PREFIX = "draft-";
export const isDraftHome = (item: { id: string }) => item.id.startsWith(DRAFT_HOME_PREFIX);
