import type { AiStage, DeploymentChannel } from "./aiGateway.ts";

/** Server-only stage cache. Never use a domain or client-supplied owner as the cache identity. */
export type AiSavedResponse = { status: number; text: string; contentType: string };
export type AiPersistence = {
  acquire(key: string, stage: AiStage, reserve: number): Promise<{
    state: "acquired" | "cached" | "busy" | "budget";
    attempt?: string; response?: AiSavedResponse;
  }>;
  finish(attempt: string, result: { response?: AiSavedResponse; usage: unknown; cost: number;
    known: boolean; cacheSeconds: number }): Promise<void>;
};

export function createAiPersistence(options: { owner: string; channel: DeploymentChannel;
  env: (name: string) => string | undefined;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: unknown }> }): AiPersistence | undefined {
  // Opt-in deployment flag permits rolling back independently from stored results.
  if (options.env("AI_DURABLE_REUSE") !== "1") return undefined;
  const limit = (name: string, fallback: number | null) => {
    const raw = options.env(name);
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${name}`);
    return n;
  };
  const daily = limit(options.channel === "staging" ? "AI_STAGING_DAILY_USD" : "AI_PRODUCTION_DAILY_USD", options.channel === "staging" ? 3 : null);
  const actor = limit("AI_ACTOR_DAILY_USD", null);
  return {
    async acquire(key, stage, reserve) {
      const { data, error } = await options.rpc("import_ai_acquire", {
        p_owner: options.owner, p_channel: options.channel, p_key: key, p_stage: stage,
        p_reserve: reserve, p_daily_limit: daily, p_actor_limit: actor,
      });
      if (error || !data || !["acquired", "cached", "busy", "budget"].includes(data.state)) {
        throw new Error("The import checkpoint service is unavailable. Please retry; your saved work is retained.");
      }
      return data;
    },
    async finish(attempt, result) {
      const { error } = await options.rpc("import_ai_finish", {
        p_attempt: attempt, p_response: result.response ?? null, p_usage: result.usage,
        p_cost: result.cost, p_known: result.known, p_cache_seconds: result.cacheSeconds,
      });
      if (error) throw new Error("Could not reconcile the import checkpoint.");
    },
  };
}
