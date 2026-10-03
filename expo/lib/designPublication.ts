/** Design publication has a single, ordered boundary. Failures never report success. */
export async function commitDesignPublication<T extends { publishedAt?: number; updatedAt?: number }>(options: {
  owner: boolean; candidate: T; previous: T; revision: number; hasPrevious: boolean;
  saveDraft: (value: T) => Promise<void>;
  savePrevious: (value: T, revision: number) => Promise<void>;
  writePublished: (value: T, revision: number) => Promise<void>;
  readPublished: () => Promise<{ value: T; rev: number } | null>;
  enableInvitation: () => Promise<void>;
}): Promise<T> {
  if (!options.owner) throw new Error('Only the realtor owner can publish.');
  const saved = { ...options.candidate, publishedAt: options.revision, updatedAt: options.revision };
  await options.saveDraft(options.candidate);
  if (options.hasPrevious) await options.savePrevious(options.previous, options.revision);
  await options.writePublished(saved, options.revision);
  const verified = await options.readPublished();
  // The existing privacy RPC may advance the row revision using server time.
  // Confirm our publication marker, rather than assuming its revision is unchanged.
  if (!verified || verified.rev < options.revision || verified.value.publishedAt !== options.revision) throw new Error('Publication could not be confirmed. Please retry.');
  await options.enableInvitation();
  return verified.value;
}
