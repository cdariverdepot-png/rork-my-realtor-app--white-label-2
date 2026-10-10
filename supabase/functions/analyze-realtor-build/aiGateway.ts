import type { AiPersistence } from "./aiPersistence.ts";
/**
 * The single metered path to the OpenAI Responses API for the importer functions.
 *
 * Every model request names its stage, is priced from its reported token usage, and is checked
 * against the deployment's policy before it is sent:
 *   - AI_MODE=offline blocks every request (offline replay and test runs can never reach a paid model).
 *   - Staging deployments use OPENAI_API_KEY_STAGING. They fall back to the shared production key only
 *     when AI_STAGING_ALLOW_SHARED_KEY=1 is set, so routine testing cannot spend production credit by default.
 *   - Staging requests have hard per-request limits (AI_STAGING_MAX_CALLS, AI_STAGING_MAX_USD).
 *     Production requests are metered and logged but not capped here; the provider account limit applies.
 *   - An identical, already completed request inside the same import is answered from memory instead of
 *     being bought twice. Failed or incomplete answers are never reused, so intentional retries still run.
 * Costs are estimates from list prices (override with AI_PRICE_TABLE); the provider's usage page is the
 * authority. Self-contained: the Edge bundle embeds this file, so it imports nothing.
 */

export type AiStage = "profile" | "navigation" | "copy-variation" | "listing-files" | "page-normalizer";
export type DeploymentChannel = "production" | "staging";

export type AiCallRecord = {
  stage: AiStage;
  model: string;
  /** HTTP status, or why no request was sent / no answer arrived. */
  outcome: number | "blocked" | "network-error" | "reused";
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  /** False when the model is not in the price table (a conservative rate was used). */
  priced: boolean;
  ms: number;
  reason?: string;
  requestId?: string;
  usageKnown?: boolean;
  reservedUsd?: number;
};

export type AiUsageSummary = {
  channel: DeploymentChannel;
  mode: "live" | "offline";
  calls: number;
  blocked: number;
  reused: number;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  unresolvedUsd: number;
  inFlight: number;
  byStage: Record<string, { calls: number; estimatedUsd: number }>;
  records: Omit<AiCallRecord, "ms">[];
};

export type AiBlockCode = "ai_offline" | "ai_key_missing" | "ai_budget" | "ai_busy" | "ai_checkpoint";

export class AiBlockedError extends Error {
  readonly code: AiBlockCode;
  constructor(message: string, code: AiBlockCode) { super(message); this.name = "AiBlockedError"; this.code = code; }
}

/** USD per million tokens: [input, cached input, output]. List prices; verify against the provider's pricing page. */
export const AI_LIST_PRICES: Record<string, [number, number, number]> = {
  "gpt-4.1": [2.0, 0.5, 8.0],
  "gpt-5.4-mini": [0.75, 0.075, 4.5],
  "gpt-4.1-mini": [0.4, 0.1, 1.6],
  "gpt-4.1-nano": [0.1, 0.025, 0.4],
  "gpt-4o": [2.5, 1.25, 10.0],
  "gpt-4o-mini": [0.15, 0.075, 0.6],
};
/** Rate used for a model missing from the table: deliberately high so an unknown model never looks cheap. */
const UNKNOWN_MODEL_RATE: [number, number, number] = [5.0, 5.0, 20.0];

type Env = (name: string) => string | undefined;

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function priceTable(env: Env): Record<string, [number, number, number]> {
  const raw = env("AI_PRICE_TABLE");
  if (!raw) return AI_LIST_PRICES;
  try {
    const parsed = JSON.parse(raw);
    const table = { ...AI_LIST_PRICES };
    for (const [model, rate] of Object.entries(parsed ?? {})) {
      if (Array.isArray(rate) && rate.length === 3 && rate.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) table[model] = rate as [number, number, number];
    }
    return table;
  } catch { return AI_LIST_PRICES; }
}

/** Price of one response from its reported usage. A dated model id ("gpt-4.1-2025-04-14") uses its family's rate. */
export function estimateAiCost(model: string, usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
  table: Record<string, [number, number, number]> = AI_LIST_PRICES): { usd: number; priced: boolean } {
  const family = Object.keys(table).sort((a, b) => b.length - a.length).find(name => model === name || model.startsWith(`${name}-20`));
  const [input, cached, output] = family ? table[family] : UNKNOWN_MODEL_RATE;
  const cachedTokens = Math.min(usage.inputTokens, usage.cachedInputTokens);
  const uncached = Math.max(0, usage.inputTokens - cachedTokens);
  const usd = (uncached * input + cachedTokens * cached + usage.outputTokens * output) / 1_000_000;
  return { usd: Math.round(usd * 1e6) / 1e6, priced: Boolean(family) };
}

/** Token usage as the Responses API reports it; zeros when absent. */
export function readAiUsage(payload: unknown): { inputTokens: number; cachedInputTokens: number; outputTokens: number; model?: string } {
  const usage = (payload && typeof payload === "object" ? (payload as { usage?: Record<string, unknown> }).usage : undefined) ?? {};
  const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  const details = usage.input_tokens_details as { cached_tokens?: unknown } | undefined;
  const model = payload && typeof payload === "object" && typeof (payload as { model?: unknown }).model === "string" ? (payload as { model: string }).model : undefined;
  return { inputTokens: count(usage.input_tokens), cachedInputTokens: count(details?.cached_tokens), outputTokens: count(usage.output_tokens), model };
}

export type AiPolicy = {
  channel: DeploymentChannel;
  mode: "live" | "offline";
  /** Maximum model requests for one incoming request; Infinity when uncapped. */
  maxCalls: number;
  /** Maximum estimated spend for one incoming request; Infinity when uncapped. */
  maxUsd: number;
};

export function aiPolicy(env: Env, channel: DeploymentChannel): AiPolicy {
  const mode = (env("AI_MODE") ?? "").toLowerCase() === "offline" ? "offline" : "live";
  if (channel === "staging") {
    return { channel, mode, maxCalls: numberFrom(env("AI_STAGING_MAX_CALLS"), 4), maxUsd: numberFrom(env("AI_STAGING_MAX_USD"), 0.25) };
  }
  return { channel, mode, maxCalls: Infinity, maxUsd: Infinity };
}

/** The API key this deployment may use, or undefined when its policy allows none. */
export function aiKey(env: Env, channel: DeploymentChannel): string | undefined {
  if (channel === "production") return env("OPENAI_API_KEY") || undefined;
  const own = env("OPENAI_API_KEY_STAGING");
  if (own) return own;
  return env("AI_STAGING_ALLOW_SHARED_KEY") === "1" ? env("OPENAI_API_KEY") || undefined : undefined;
}

export type AiGateway = {
  readonly policy: AiPolicy;
  /** True when a request could be sent at all (mode, key); budgets are checked per request. */
  available(): boolean;
  model(stage: AiStage): string;
  /** POST a Responses API body for a stage. Returns the provider's response (body readable once). */
  request(stage: AiStage, body: Record<string, unknown>, init?: { signal?: AbortSignal; accept?: (payload: unknown) => boolean; cacheSeconds?: number; intent?: string }): Promise<Response>;
  summary(): AiUsageSummary;
};

const STAGE_MODEL_ENV: Record<AiStage, string> = {
  "profile": "OPENAI_MODEL_PROFILE", "navigation": "OPENAI_MODEL_NAVIGATION", "copy-variation": "OPENAI_MODEL_COPY",
  "listing-files": "OPENAI_MODEL_LISTING_FILES", "page-normalizer": "OPENAI_MODEL_PAGE_NORMALIZER",
};

/** Output limits protect against unbounded responses without changing the selected model. */
const OUTPUT_LIMITS: Record<AiStage, number> = {
  profile: 4096, navigation: 512, "copy-variation": 1024, "listing-files": 16000, "page-normalizer": 12000,
};

/** Conservative text bound: UTF-8 bytes plus protocol overhead, with no cache discount.
 * Documents/images cannot be priced from their base64 length: reserve the model's context envelope.
 * This is an admission estimate, not a provider invoice. Unknown usage keeps its reservation.
 */
export function reserveAiCost(model: string, payload: string, outputTokens: number,
  table: Record<string, [number, number, number]> = AI_LIST_PRICES): number {
  const multimodal = /"type"\s*:\s*"input_(?:image|file)"/.test(payload);
  const inputTokens = multimodal ? 1_100_000 : new TextEncoder().encode(payload).length + 2048;
  return estimateAiCost(model, { inputTokens, cachedInputTokens: 0, outputTokens }, table).usd;
}

export function createAiGateway(options: { env: Env; channel: DeploymentChannel; fetch?: typeof fetch;
  log?: (record: AiCallRecord) => void; now?: () => number; persistence?: AiPersistence }): AiGateway {
  const { env, channel } = options;
  const send = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const policy = aiPolicy(env, channel);
  const table = priceTable(env);
  const records: AiCallRecord[] = [];
  type Saved = { status: number; text: string; contentType: string };
  const completed = new Map<string, Saved>();
  const pending = new Map<string, Promise<Saved>>();
  let attempts = 0, reserved = 0, unresolved = 0;
  const log = options.log ?? ((record: AiCallRecord) => console.log("[ai]", JSON.stringify(record)));
  const spent = () => records.reduce((sum, r) => sum + r.estimatedUsd, 0);
  const model = (stage: AiStage) => env(STAGE_MODEL_ENV[stage]) || env("OPENAI_BUILD_MODEL") || "gpt-4.1";
  const note = (record: AiCallRecord) => { records.push(record); try { log(record); } catch { /* logging never breaks an import */ } };
  const blocked = (stage: AiStage, code: AiBlockCode, message: string) => {
    note({ stage, model: model(stage), outcome: "blocked", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, estimatedUsd: 0, priced: true, ms: 0, reason: code });
    return new AiBlockedError(message, code);
  };
  const responseOf = (saved: Saved) => new Response(saved.text, { status: saved.status, headers: { "Content-Type": saved.contentType } });
  return {
    policy,
    available: () => policy.mode === "live" && Boolean(aiKey(env, channel)),
    model,
    async request(stage, body, init) {
      if (policy.mode === "offline") throw blocked(stage, "ai_offline", "AI requests are disabled in offline mode.");
      const key = aiKey(env, channel);
      if (!key) throw blocked(stage, "ai_key_missing", channel === "staging"
        ? "This test deployment has no separate AI key, so AI steps are switched off."
        : "The AI service is not configured.");
      const outputLimit = Math.min(OUTPUT_LIMITS[stage], Math.max(1, Math.floor(numberFrom(String(body.max_output_tokens ?? OUTPUT_LIMITS[stage]), OUTPUT_LIMITS[stage]))));
      // Callers cannot override the policy-selected model or omit the output bound.
      const { model: _ignoredModel, ...requestBody } = body;
      const payload = JSON.stringify({ model: model(stage), ...requestBody, max_output_tokens: outputLimit });
      const cacheKey = stage + ":" + (init?.intent ?? "") + ":" + payload;
      const reuse = completed.get(cacheKey);
      const running = pending.get(cacheKey);
      if (reuse || running) {
        const saved = reuse ?? await running!;
        note({ stage, model: model(stage), outcome: "reused", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, estimatedUsd: 0, priced: true, ms: 0 });
        return responseOf(saved);
      }
      if (!options.persistence && attempts >= policy.maxCalls) throw blocked(stage, "ai_budget", `This request reached its limit of ${policy.maxCalls} AI calls.`);
      if (!options.persistence && stage !== "profile" && Number.isFinite(policy.maxCalls) && attempts >= policy.maxCalls - 1) {
        throw blocked(stage, "ai_budget", "The remaining AI call of this request is reserved for writing the profile.");
      }
      const reservation = reserveAiCost(model(stage), payload, outputLimit, table);
      if (!options.persistence && spent() + reserved + unresolved + reservation > policy.maxUsd) {
        throw blocked(stage, "ai_budget", `This request cannot safely fit within its AI spending limit ($${policy.maxUsd}).`);
      }
      // Reserve synchronously before the first await: concurrent requests cannot buy the same slot.
      attempts++; reserved += reservation;
      const started = now();
      const work = (async (): Promise<Saved> => {
        let response: Response | undefined;
        let attempt: string | undefined, providerStarted = false;
        const persist = async (result: {response?: Saved; usage: unknown; cost: number; known: boolean; cacheSeconds: number}) => {
          if (!attempt || !options.persistence) return;
          try { await options.persistence.finish(attempt, result); }
          catch { console.error("[ai] checkpoint reconciliation pending", attempt); }
        };
        try {
          if (options.persistence) {
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("import-ai-v1:" + cacheKey));
            const fingerprint = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
            const claim = await options.persistence.acquire(fingerprint, stage, reservation);
            if (claim.state === "cached" && claim.response) {
              attempts--;
              note({stage,model:model(stage),outcome:"reused",inputTokens:0,cachedInputTokens:0,outputTokens:0,estimatedUsd:0,priced:true,ms:0});
              completed.set(cacheKey, claim.response);
              return claim.response;
            }
            if (claim.state === "budget") throw blocked(stage,"ai_budget","This import needs more AI capacity. Your saved work is retained; please try later.");
            if (claim.state !== "acquired" || !claim.attempt) throw blocked(stage,"ai_busy","This analysis is already running or awaiting reconciliation. Your saved work is retained; please retry later.");
            attempt = claim.attempt;
            if (attempts > policy.maxCalls || (stage !== "profile" && attempts > policy.maxCalls - 1) || spent() + reserved + unresolved > policy.maxUsd) {
              await persist({usage:{reason:"local_budget",sent:false},cost:0,known:true,cacheSeconds:0});
              throw blocked(stage,"ai_budget","This request cannot safely fit within its AI budget. Your saved work is retained.");
            }
          }
          providerStarted = true;
          response = await send("https://api.openai.com/v1/responses", { method: "POST", signal: init?.signal,
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: payload });
          const text = await response.text();
          let parsed: any;
          try { parsed = JSON.parse(text); } catch { parsed = undefined; }
          const usage = readAiUsage(parsed);
          const usageKnown = Number.isFinite(parsed?.usage?.input_tokens) && Number.isFinite(parsed?.usage?.output_tokens);
          const cost = estimateAiCost(usage.model ?? model(stage), usage, table);
          // A rejected request is not assumed charged. A successful response without usage is unresolved.
          const settled = usageKnown || response.status >= 400 && response.status < 500;
          const held = !settled ? reservation : 0;
          unresolved += held;
          note({ stage, model: usage.model ?? model(stage), outcome: response.status, inputTokens: usage.inputTokens,
            cachedInputTokens: usage.cachedInputTokens, outputTokens: usage.outputTokens, estimatedUsd: cost.usd,
            priced: cost.priced, ms: now() - started, usageKnown, reservedUsd: held,
            ...(response.headers.get("x-request-id") ? { requestId: response.headers.get("x-request-id")! } : {}) });
          const saved = { status: response.status, text, contentType: response.headers.get("Content-Type") ?? "application/json" };
          const finished = response.ok && parsed && (parsed.status === undefined || parsed.status === "completed");
          let accepted = false;
          try { accepted = Boolean(finished && init?.accept?.(parsed)); } catch { /* invalid output is not durable */ }
          if (finished && (!init?.accept || accepted)) completed.set(cacheKey, saved);
          await persist({response: accepted ? saved : undefined, usage: records[records.length - 1], cost: cost.usd,
            known: settled, cacheSeconds: accepted ? Math.min(604800, Math.max(0, init?.cacheSeconds ?? 0)) : 0});
          return saved;
        } catch (error) {
          if (!providerStarted) {
            attempts--;
            if (error instanceof AiBlockedError) throw error;
            throw blocked(stage,"ai_checkpoint","The import checkpoint service is unavailable. Your saved work is retained; please retry later.");
          }
          unresolved += reservation;
          note({ stage, model: model(stage), outcome: "network-error", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
            estimatedUsd: 0, priced: true, usageKnown: false, reservedUsd: reservation,
            ...(response?.headers.get("x-request-id") ? { requestId: response.headers.get("x-request-id")! } : {}),
            ms: now() - started, reason: error instanceof Error ? error.name : "error" });
          await persist({usage: records[records.length - 1],cost:0,known:false,cacheSeconds:0});
          throw error;
        } finally { reserved = Math.max(0, reserved - reservation); }
      })();
      pending.set(cacheKey, work);
      try { return responseOf(await work); } finally { pending.delete(cacheKey); }
    },
    summary() {
      const byStage: Record<string, { calls: number; estimatedUsd: number }> = {};
      for (const r of records) {
        if (r.outcome === "blocked" || r.outcome === "reused") continue;
        const entry = byStage[r.stage] ??= { calls: 0, estimatedUsd: 0 };
        entry.calls++; entry.estimatedUsd = Math.round((entry.estimatedUsd + r.estimatedUsd) * 1e6) / 1e6;
      }
      return { channel, mode: policy.mode, calls: attempts, blocked: records.filter(r => r.outcome === "blocked").length,
        reused: records.filter(r => r.outcome === "reused").length,
        inputTokens: records.reduce((s, r) => s + r.inputTokens, 0), outputTokens: records.reduce((s, r) => s + r.outputTokens, 0),
        estimatedUsd: Math.round(spent() * 1e6) / 1e6, unresolvedUsd: Math.round(unresolved * 1e6) / 1e6, inFlight: pending.size, byStage,
        records: records.slice(0, 40).map(({ ms: _ms, ...rest }) => rest) };
    },
  };
}
