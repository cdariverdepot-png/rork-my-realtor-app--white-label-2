/**
 * Live import progress. Every event reports work that actually started, produced data, or
 * finished; nothing here is timed, estimated or invented. Clients opt in with
 * `Accept: text/event-stream`; everyone else receives the ordinary JSON response.
 */
export type ImportStage = "site" | "design" | "pages" | "listings" | "details" | "verify" | "profile" | "save";
export type ImportEvent =
  /** A pipeline stage started, finished, failed, or was not needed. count/total are real tallies. */
  /** For "details", succeeded counts listings whose full details were actually read (count = pages handled). */
  | { kind: "stage"; stage: ImportStage; state: "start" | "done" | "failed" | "skipped"; count?: number; total?: number; succeeded?: number; reason?: string; at: number }
  /** The page title / site name the realtor's own website published. */
  | { kind: "site"; name: string; host: string; at: number }
  /** What the design reader identified in the source markup. */
  | { kind: "design"; portrait: boolean; logo: boolean; images: number; sections: number; at: number }
  /** Profile facts after validation against the sources (never the raw model guess). */
  | { kind: "profile"; name?: string; city?: string; at: number }
  /** Listing discovery tallies: pages examined and distinct listings found so far. */
  | { kind: "listings"; host: string; pages: number; found: number; at: number }
  /** Ownership scope: other brokerages' listings left out of a market feed, and other offices' listings featured on the site. */
  | { kind: "scope"; excluded: number; featured: number; at: number }
  /** A browser render was requested because the public page needs one. */
  | { kind: "render"; host: string; state: "start" | "done" | "failed"; at: number };

type WithoutAt<T> = T extends unknown ? Omit<T, "at"> : never;
export type ImportEventInput = WithoutAt<ImportEvent>;
export type EmitImportEvent = (event: ImportEventInput) => void;

/** Stage clock: emits stage events and records real durations for logs and responses. */
export function createImportProgress(sink?: (event: ImportEvent) => void) {
  const started = Date.now();
  const opened = new Map<ImportStage, number>();
  const durations: Partial<Record<ImportStage, number>> = {};
  const emit: EmitImportEvent = event => {
    if (!sink) return;
    try { sink({ ...event, at: Date.now() - started } as ImportEvent); } catch { /* progress never breaks the import */ }
  };
  const close = (stage: ImportStage) => {
    const begun = opened.get(stage);
    if (begun === undefined) return;
    opened.delete(stage);
    durations[stage] = (durations[stage] ?? 0) + Date.now() - begun;
  };
  return {
    emit,
    start(stage: ImportStage, extra?: { count?: number; total?: number; succeeded?: number }) {
      if (!opened.has(stage)) opened.set(stage, Date.now());
      emit({ kind: "stage", stage, state: "start", ...extra });
    },
    finish(stage: ImportStage, state: "done" | "failed" | "skipped" = "done", extra?: { count?: number; total?: number; succeeded?: number; reason?: string }) {
      close(stage);
      emit({ kind: "stage", stage, state, ...extra });
    },
    isOpen(stage: ImportStage) { return opened.has(stage); },
    /** Durations in ms for each stage that ran, plus the request total. */
    timings(): Record<string, number> {
      return { ...durations, total: Date.now() - started };
    },
  };
}
export type ImportProgress = ReturnType<typeof createImportProgress>;

/** Turns the discovery engine's callbacks into listing tallies, render and detail-page events. */
export function discoveryReporter(progress: ImportProgress) {
  let lastPages = -1, lastFound = -1;
  return (event: DiscoveryProgressEvent) => {
    let host = "";
    try { host = new URL(event.url).hostname.replace(/^www\./, ""); } catch { host = ""; }
    if (event.phase === "render") progress.emit({ kind: "render", host, state: event.state });
    else if (event.phase === "inventory") {
      if (event.pages === lastPages && event.found === lastFound) return;
      lastPages = event.pages; lastFound = event.found;
      progress.emit({ kind: "listings", host, pages: event.pages, found: event.found });
    } else if (event.done < event.total) progress.start("details", { count: event.done, total: event.total, succeeded: event.enriched });
    else progress.finish("details", "done", { count: event.done, total: event.total, succeeded: event.enriched });
  };
}
/** Mirrors the engine's onProgress events (kept structural so this module has no imports). */
export type DiscoveryProgressEvent =
  | { phase: "inventory"; url: string; pages: number; found: number }
  | { phase: "render"; url: string; state: "start" | "done" | "failed" }
  | { phase: "details"; url: string; done: number; total: number; enriched: number };

/**
 * Serve a handler either as ordinary JSON or, when the client asks for an event stream, as
 * server-sent events: `data: {"event":…}` lines while work runs, then one
 * `data: {"result":{"status":…,"body":…}}` carrying exactly the JSON response.
 */
export function respondWithProgress(request: Request, headers: Record<string, string>,
  run: (sink?: (event: ImportEvent) => void) => Promise<Response>): Promise<Response> {
  if (!/text\/event-stream/i.test(request.headers.get("accept") ?? "")) return run(undefined);
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;
  const write = (value: unknown) => {
    if (closed || !controller) return;
    try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); } catch { closed = true; }
  };
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
    cancel() { closed = true; },
  });
  (async () => {
    let status = 500;
    let body: unknown = { error: "The import could not finish. Please retry." };
    try {
      const response = await run(event => write({ event }));
      status = response.status;
      body = await response.json().catch(() => ({ error: "The import returned an unreadable response." }));
    } catch (error) {
      console.error("[import] stream handler failed", error instanceof Error ? error.message : String(error));
    }
    write({ result: { status, body } });
    closed = true;
    try { controller?.close(); } catch { /* client went away */ }
  })();
  return Promise.resolve(new Response(stream, { status: 200, headers: { ...headers,
    "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } }));
}
