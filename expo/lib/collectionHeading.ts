/**
 * The heading above a realtor's homes. "Homes I picked for you." is the wording every new profile is seeded with:
 * it claims the realtor chose these homes, which is only true when the realtor wrote it. Unless they did, the
 * collection is headed "Available Properties".
 */
export const NEUTRAL_COLLECTION_HEADING = "Available Properties";
const PICKED_FOR_YOU = /^homes i picked for you\.?$/;
export const isSeededPickedHeading = (title: string | undefined) => PICKED_FOR_YOU.test((title ?? "").replace(/\s+/g, " ").trim().toLowerCase());
export const collectionHeading = (title: string | undefined, fallback = NEUTRAL_COLLECTION_HEADING) =>
  !title?.trim() || isSeededPickedHeading(title) ? fallback : title;
