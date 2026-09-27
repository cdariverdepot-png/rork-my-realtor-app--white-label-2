/**
 * Is an item addressed to this client? Items with no recipients are for
 * everyone; items addressed to specific clients are only for them. Anyone who
 * isn't a signed-in client (the realtor, a preview) sees everything.
 */
export const isForClient = (recipientIds: string[] | undefined, clientId: string | undefined): boolean =>
  !clientId || !recipientIds || recipientIds.length === 0 || recipientIds.includes(clientId);
