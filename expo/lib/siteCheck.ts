import { useEffect, useState } from "react";

/**
 * Does this website's domain actually exist? A well-formed address like
 * "sitethatdoesntexist.com" passes the format check, so the domain is looked up
 * over DNS-over-HTTPS (works on iOS, Android and web — no CORS issues).
 *
 * Only NXDOMAIN ("no such domain") counts as missing. A domain that exists but
 * has no address on that exact name (e.g. only www.example.com is set up) is
 * still a real site. "unknown" means the lookup couldn't run (offline, resolver
 * down, timed out); the address is then judged on its format alone so a flaky
 * network never blocks the realtor.
 */
export type SiteCheck = "idle" | "checking" | "found" | "missing" | "unknown";
type Result = Exclude<SiteCheck, "idle" | "checking">;

/** Only "found" is remembered: a missing domain may be registered a minute later. */
const found = new Set<string>();

async function lookup(host: string): Promise<"found" | "missing"> {
  const resolvers = [
    `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`,
  ];
  let lastError: unknown;
  for (const url of resolvers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { headers: { Accept: "application/dns-json" }, signal: controller.signal });
      if (!res.ok) throw new Error(`DNS ${res.status}`);
      const body = await res.json() as { Status?: number };
      if (body.Status === 3) return "missing"; // NXDOMAIN: no such domain
      if (body.Status === 0) return "found";
      throw new Error(`DNS status ${body.Status}`);
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export async function checkSite(uri: string): Promise<Result> {
  const host = new URL(uri).hostname.toLowerCase().replace(/\.$/, "");
  if (found.has(host)) return "found";
  try {
    const result = await lookup(host);
    if (result === "found") found.add(host);
    return result;
  } catch {
    return "unknown";
  }
}

/** Debounced check of a normalized https URL (null while the format is invalid). */
export function useSiteCheck(uri: string | null): SiteCheck {
  const [state, setState] = useState<SiteCheck>("idle");
  useEffect(() => {
    if (!uri) { setState("idle"); return; }
    let alive = true;
    const host = new URL(uri).hostname.toLowerCase().replace(/\.$/, "");
    if (found.has(host)) { setState("found"); return; }
    setState("checking");
    const timer = setTimeout(() => {
      void checkSite(uri).then(result => { if (alive) setState(result); });
    }, 450);
    return () => { alive = false; clearTimeout(timer); };
  }, [uri]);
  return state;
}
