type Doc = { id: string; recipientIds?: string[]; transactionId?: string };
type Transaction = { id: string; clientIds?: string[] };
/** Transactions need an explicit client assignment; standalone shared files can be general. */
export function clientDocuments<D extends Doc, T extends Transaction>(docs: D[], transactions: T[], clientId?: string) {
  if (!clientId) return { items: [] as D[], transactions: [] as T[] };
  const mine = transactions.filter(tx => tx.clientIds?.includes(clientId));
  const ids = new Set(mine.map(tx => tx.id));
  return { transactions: mine, items: docs.filter(doc =>
    (!doc.recipientIds?.length || doc.recipientIds.includes(clientId)) &&
    (!doc.transactionId || ids.has(doc.transactionId))) };
}
