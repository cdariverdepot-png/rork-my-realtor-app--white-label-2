/**
 * Turns the importer's live events into the build screen's activity list.
 *
 * Every line comes from an event the server sent when the work actually started, produced data,
 * or finished. There are no timers, estimates or placeholders: when no event has arrived, the
 * list says only what is true (the request is being sent). Facts such as a site name, profile
 * name, city or listing count appear only after the importer reported them.
 */
export type ImportStage = "site" | "design" | "pages" | "listings" | "details" | "verify" | "profile" | "save";
export type ImportEvent =
  | { kind: "stage"; stage: ImportStage; state: "start" | "done" | "failed" | "skipped"; count?: number; total?: number; succeeded?: number; reason?: string; at: number }
  | { kind: "site"; name: string; host: string; at: number }
  | { kind: "design"; portrait: boolean; logo: boolean; images: number; sections: number; at: number }
  | { kind: "profile"; name?: string; city?: string; at: number }
  | { kind: "listings"; host: string; pages: number; found: number; at: number }
  | { kind: "render"; host: string; state: "start" | "done" | "failed"; at: number };

/** Which request an event belongs to: the listing import (refresh-listings) or the profile build (analyze-realtor-build). */
export type ImportChannel = "listings" | "build";
export type ActivityLine = { id: string; text: string; state: "active" | "done" | "failed" | "note" };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function upsert(lines: ActivityLine[], line: ActivityLine): ActivityLine[] {
  const index = lines.findIndex(item => item.id === line.id);
  if (index < 0) return [...lines, line];
  const next = lines.slice();
  next[index] = line;
  return next;
}
const settle = (lines: ActivityLine[], id: string, state: ActivityLine["state"], text?: string) => {
  const current = lines.find(line => line.id === id);
  return current ? upsert(lines, { ...current, state, text: text ?? current.text }) : lines;
};

/** Lines a request shows before its first event: only that it was sent. */
export function requestStarted(lines: ActivityLine[], channel: ImportChannel): ActivityLine[] {
  return upsert(lines, { id: `${channel}:request`, state: "active",
    text: channel === "listings" ? "Asking the importer to find your listings" : "Asking the importer to read your website" });
}

/** The request finished (with or without events). Anything still marked active is closed honestly. */
export function requestFinished(lines: ActivityLine[], channel: ImportChannel, ok: boolean): ActivityLine[] {
  return lines.map(line => {
    if (!line.id.startsWith(`${channel}:`) || line.state !== "active") return line;
    if (line.id === `${channel}:request`) {
      // No live events reached this device; report only the outcome the response itself proves.
      return ok ? { ...line, state: "done", text: channel === "listings" ? "Listing import finished" : "Website read and profile written" }
        : { ...line, state: "failed" };
    }
    return { ...line, state: ok ? "done" : "failed" };
  });
}

export function applyImportEvent(previous: ActivityLine[], channel: ImportChannel, event: ImportEvent): ActivityLine[] {
  // The first real event replaces "request sent".
  let lines = previous.filter(line => line.id !== `${channel}:request`);
  const id = (part: string) => `${channel}:${part}`;
  switch (event.kind) {
    case "site": {
      const current = lines.find(line => line.id === id("site"));
      return upsert(lines, { id: id("site"), state: current?.state ?? "active", text: `Reading ${event.name}` });
    }
    case "design": {
      const found = [event.portrait && "profile photo", event.logo && "logo"].filter(Boolean) as string[];
      if (found.length) lines = upsert(lines, { id: id("design-identity"), state: "done", text: `Identified your ${found.join(" and ")}` });
      if (event.images) lines = upsert(lines, { id: id("design-images"), state: "done", text: `Sorted ${plural(event.images, "website image")} by role` });
      return lines;
    }
    case "profile": {
      if (!event.name && !event.city) return lines;
      return upsert(lines, { id: id("profile-found"), state: "done", text: `Found ${[event.name, event.city].filter(Boolean).join(" · ")}` });
    }
    case "listings": {
      const text = event.found
        ? `Found ${plural(event.found, "listing")} so far · ${plural(event.pages, "page")} checked`
        : `Looking for listings · ${plural(event.pages, "page")} checked`;
      return upsert(lines, { id: id("listings"), state: "active", text });
    }
    case "render": {
      const host = event.host || "the listing site";
      if (event.state === "start") return upsert(lines, { id: id(`render:${host}`), state: "active", text: `Opening ${host} in a browser (it requires one)` });
      if (event.state === "done") return settle(lines, id(`render:${host}`), "done", `Opened ${host} in a browser`);
      return settle(lines, id(`render:${host}`), "failed", `${host} did not finish loading in the browser`);
    }
    case "stage":
      return applyStage(lines, channel, event);
  }
  return lines;
}

function applyStage(lines: ActivityLine[], channel: ImportChannel, event: Extract<ImportEvent, { kind: "stage" }>): ActivityLine[] {
  const id = (part: string) => `${channel}:${part}`;
  const { stage, state } = event;
  const failed = state === "failed";
  switch (stage) {
    case "site":
      if (state === "start") return upsert(lines, { id: id("site"), state: "active", text: lines.find(l => l.id === id("site"))?.text ?? "Reading your website" });
      return settle(lines, id("site"), failed ? "failed" : "done", failed ? "Your website could not be read" : undefined);
    case "design":
      if (state === "start") return upsert(lines, { id: id("design"), state: "active", text: "Matching your website’s design and imagery" });
      return settle(lines, id("design"), failed ? "failed" : "done");
    case "pages": {
      const total = event.total ?? 0;
      if (state === "start") return upsert(lines, { id: id("pages"), state: "active", text: `Reading linked pages · ${event.count ?? 0} of ${total}` });
      return settle(lines, id("pages"), failed ? "failed" : "done", `Read ${plural(total, "linked page")}`);
    }
    case "listings":
      if (state === "skipped") return lines; // The listing import running alongside reports these.
      if (state === "start") return upsert(lines, { id: id("listings"), state: "active", text: lines.find(l => l.id === id("listings"))?.text ?? "Looking for your listings" });
      if (failed) return settle(lines, id("listings"), "failed", "Your listings could not be read from this page");
      return upsert(lines, { id: id("listings"), state: "done",
        text: event.count ? `Found ${plural(event.count, "active listing")}` : "No active listings were found on this page" });
    case "details": {
      const total = event.total ?? 0, count = event.count ?? 0;
      if (state === "start") return upsert(lines, { id: id("details"), state: "active", text: `Reading listing details · ${count} of ${total}` });
      if (failed) return settle(lines, id("details"), "failed");
      // Only listings whose full details were actually read count as read.
      const read = event.succeeded ?? 0;
      return upsert(lines, { id: id("details"), state: "done",
        text: read === 0 ? `Full details weren’t available for ${total === 1 ? "this listing" : `these ${total} listings`}`
          : read === total ? `Read full details for ${total === 1 ? "the listing" : `all ${total} listings`}`
          : `Read full details for ${read} of ${plural(total, "listing")}` });
    }
    case "verify":
      if (state === "start") return upsert(lines, { id: id("verify"), state: "active", text: "Rechecking listings that are no longer on the page" });
      return settle(lines, id("verify"), failed ? "failed" : "done");
    case "profile":
      if (state === "start") return upsert(lines, { id: id("profile"), state: "active", text: "Writing your profile and app copy" });
      return settle(lines, id("profile"), failed ? "failed" : "done", failed ? "Your profile could not be written" : undefined);
    case "save":
      if (channel === "listings") {
        if (state === "start") return upsert(lines, { id: id("save"), state: "active", text: `Saving ${plural(event.total ?? 0, "listing")}` });
        return settle(lines, id("save"), failed ? "failed" : "done", failed ? undefined : `Saved ${plural(event.count ?? 0, "listing")}`);
      }
      if (state === "start") return upsert(lines, { id: id("save"), state: "active", text: "Saving your app draft" });
      return settle(lines, id("save"), failed ? "failed" : "done");
  }
  return lines;
}

/** Parses server-sent-event frames; returns complete messages and the unparsed remainder. */
export function parseEventFrames(buffer: string): { messages: { event?: ImportEvent; result?: { status: number; body: unknown } }[]; rest: string } {
  const messages: { event?: ImportEvent; result?: { status: number; body: unknown } }[] = [];
  let rest = buffer;
  let boundary: number;
  while ((boundary = rest.indexOf("\n\n")) >= 0) {
    const frame = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    const data = frame.split("\n").filter(line => line.startsWith("data: ")).map(line => line.slice(6)).join("\n");
    if (!data) continue;
    try { messages.push(JSON.parse(data)); } catch { /* a malformed frame is ignored, never guessed at */ }
  }
  return { messages, rest };
}
