/** Source and evidence records used while a realtor's app is being assembled.
 * These records are drafts. BrandContext remains the published app model. */
export type BuildSourceKind = "url" | "document" | "image" | "contacts" | "listing";
export type BuildSourceStatus = "queued" | "processing" | "ready" | "failed";

export type BuildSource = {
  id: string;
  kind: BuildSourceKind;
  label: string;
  uri: string;
  mimeType?: string;
  status: BuildSourceStatus;
  error?: string;
};

/** Only fields already represented by Brand may become profile facts. */
export type RealtorFactField =
  | "realtor.name"
  | "realtor.title"
  | "realtor.city"
  | "realtor.phone"
  | "realtor.email"
  | "realtor.brandName"
  | "credentials.license.brokerage"
  | "credentials.license.number"
  | "credentials.license.state"
  | "portraitUrl";

export type SourceEvidence = {
  field: RealtorFactField;
  value: string;
  sourceId: string;
  /** A short excerpt or locator that explains where the value came from. */
  locator?: string;
  confidence: number;
};

export type ResolvedFact = {
  field: RealtorFactField;
  value: string;
  evidence: SourceEvidence[];
  confidence: number;
  conflictingValues: string[];
  needsClarification: boolean;
};

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

/** Merge matching observations without silently discarding conflicting facts.
 * The result is still a draft and must not be written to the live Brand here. */
export function resolveFacts(evidence: SourceEvidence[]): ResolvedFact[] {
  const fields = [...new Set(evidence.map((item) => item.field))];
  return fields.map((field) => {
    const groups = new Map<string, SourceEvidence[]>();
    for (const item of evidence.filter((candidate) => candidate.field === field && candidate.value.trim())) {
      const key = normalize(item.value);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const ranked = [...groups.values()].sort((a, b) =>
      Math.max(...b.map((item) => item.confidence)) - Math.max(...a.map((item) => item.confidence)) ||
      b.length - a.length
    );
    const winner = ranked[0] ?? [];
    const distinctSources = new Set(winner.map((item) => item.sourceId)).size;
    const modelConfidence = winner.length ? Math.max(...winner.map((item) => item.confidence)) : 0;
    const confidence = Math.max(0, Math.min(1, modelConfidence + (distinctSources > 1 ? 0.12 : 0) - (ranked.length > 1 ? 0.2 : 0)));
    const highRisk = field === "portraitUrl" || field.startsWith("credentials.license.");
    return {
      field,
      value: winner[0]?.value.trim() ?? "",
      evidence: winner,
      confidence,
      conflictingValues: ranked.slice(1).map((group) => group[0].value.trim()),
      needsClarification: ranked.length > 1 || confidence < 0.6 || (highRisk && distinctSources < 2),
    };
  });
}
