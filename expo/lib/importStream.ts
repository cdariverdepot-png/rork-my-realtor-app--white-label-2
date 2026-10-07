import { supabase, supabaseFunctionUrl, supabasePublicKey } from "@/lib/supabase";
import { parseEventFrames, type ImportEvent } from "@/lib/importProgress";

/**
 * Calls an importer Edge Function and delivers its live progress events as they arrive.
 * Resolves with the same { status, body } the ordinary JSON call returns. When the platform
 * cannot read a streamed body incrementally, the events are still applied (all at the end);
 * nothing is simulated in the meantime.
 */
export async function invokeWithProgress(name: string, body: unknown, onEvent: (event: ImportEvent) => void): Promise<{ status: number; body: any }> {
  if (!supabase) throw new Error("Sign in to continue.");
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Your session has expired. Sign in again to continue.");
  // expo/fetch reads response bodies incrementally on iOS and Android (and is the platform fetch on web).
  const { fetch: streamingFetch } = await import("expo/fetch");
  let response: Awaited<ReturnType<typeof streamingFetch>>;
  try {
    response = await streamingFetch(supabaseFunctionUrl(name), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: supabasePublicKey, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new Error("We couldn’t reach the importer. Check your connection and try again.");
  }
  const type = response.headers.get("content-type") ?? "";
  if (!/text\/event-stream/i.test(type)) {
    // The gateway answered before the function streamed (e.g. an expired session).
    let parsed: any = {};
    try { parsed = await response.json(); } catch { parsed = {}; }
    return { status: response.status, body: parsed };
  }
  let result: { status: number; body: any } | undefined;
  const deliver = (text: string) => {
    const { messages, rest } = parseEventFrames(text);
    for (const message of messages) {
      if (message.event) { try { onEvent(message.event); } catch { /* display only */ } }
      if (message.result) result = message.result as { status: number; body: any };
    }
    return rest;
  };
  const reader = response.body?.getReader?.();
  if (reader) {
    const decode = utf8Decoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      buffer = deliver(buffer + decode(value));
      if (done) break;
    }
    deliver(buffer + "\n\n");
  } else {
    deliver((await response.text()) + "\n\n");
  }
  if (!result) throw new Error("The importer stopped before it finished. Please try again.");
  return result;
}

/** Incremental UTF-8 decoding that keeps split multi-byte characters for the next chunk (Hermes has no TextDecoder). */
export function utf8Decoder() {
  if (typeof TextDecoder === "function") {
    const decoder = new TextDecoder();
    return (bytes?: Uint8Array) => decoder.decode(bytes ?? new Uint8Array(), { stream: !!bytes });
  }
  let pending: number[] = [];
  return (bytes?: Uint8Array) => {
    const input = pending.concat(Array.from(bytes ?? []));
    pending = [];
    let out = "";
    let i = 0;
    while (i < input.length) {
      const b = input[i];
      const size = b < 0x80 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      if (i + size > input.length) {
        if (bytes) { pending = input.slice(i); break; }
        out += "\ufffd"; break;
      }
      let code = size === 1 ? b : b & (0xff >> (size + 1));
      for (let k = 1; k < size; k++) code = (code << 6) | (input[i + k] & 0x3f);
      out += String.fromCodePoint(size > 1 && (input[i + 1] & 0xc0) !== 0x80 ? 0xfffd : code);
      i += size;
    }
    return out;
  };
}
