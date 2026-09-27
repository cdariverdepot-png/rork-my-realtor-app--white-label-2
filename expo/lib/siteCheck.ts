import { useEffect, useState } from "react";

/**
 * Does this website's domain actually exist? A well-formed address like
 * "sitethatdoesntexist.com" passes the format check, so the domain is looked up
 * over DNS-over-HTTPS (works on iOS, Android and web — no CORS issues).
 *
 * "unknown" means the lookup itself couldn't run (offline, resolver down); the
 * address is then judged on its format alone so a flaky network never blocks.
 */
export type SiteCheck = "idle" | "checking" | "found" | "missing" | "unknown";

const cache = new Map<string, Exclude<SiteCheck, "idle" | "checking">>();

async function lookup(host: string, type: "A" | "AAAA"): Promise<"found" | "missing" | "none"> {
  const resolvers = [
    `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
  ];
  let lastError: unknown;
  for (const url of resolvers) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
      if (!res.ok) throw new Error(`DNS ${res.status}`);
      const body = await res.json() as { Status?: number; Answer?: unknown[] };
      if (body.Status === 3) return "missing"; // NXDOMAIN: no such domain
      if (body.Status === 0) return body.Answer?.length ? "found" : "none";
      throw new Error(`DNS status ${body.Status}`);
    } catch (e) { lastError = e; }
  }
  throw lastError;
}

export async function checkSite(uri: string): Promise<Exclude<SiteCheck, "idle" | "checking">> {
  const host = new URL(uri).hostname.toLowerCase();
  const known = cache.get(host);
  if (known) return known;
  let result: Exclude<SiteCheck, "idle" | "checking">;
  try {
    const v4 = await lookup(host, "A");
    result = v4 === "found" ? "found" : v4 === "missing" ? "missing"
      : (await lookup(host, "AAAA")) === "found" ? "found" : "missing";
  } catch {
    return "unknown"; // not cached — try again next time
  }
  cache.set(host, result);
  return result;
}

/** Debounced check of a normalized https URL (null while the format is invalid). */
export function useSiteCheck(uri: string | null): SiteCheck {
  const [state, setState] = useState<SiteCheck>("idle");
  useEffect(() => {
    if (!uri) { setState("idle"); return; }
    let alive = true;
    const host = new URL(uri).hostname.toLowerCase();
    const known = cache.get(host);
    if (known) { setState(known); return; }
    setState("checking");
    const timer = setTimeout(() => {
      void checkSite(uri).then(result => { if (alive) setState(result); });
    }, 450);
    return () => { alive = false; clearTimeout(timer); };
  }, [uri]);
  return state;
}
