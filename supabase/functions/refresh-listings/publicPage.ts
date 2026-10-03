function publicAddress(address: string): boolean {
  if (address.includes(":")) {
    const ip = address.toLowerCase();
    if (ip === "::" || ip === "::1" || ip.startsWith("::ffff:") ||
        ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip) ||
        ip.startsWith("2001:db8:")) return false;
    return true;
  }
  const bytes = address.split(".").map(Number);
  if (bytes.length !== 4 || bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = bytes;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

async function publicHttps(raw: string): Promise<URL> {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (raw.length > 2048 || url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    throw new Error("Use a public HTTPS page.");
  }
  const answers = await Promise.allSettled([
    Deno.resolveDns(host, "A"), Deno.resolveDns(host, "AAAA"),
  ]);
  const addresses = answers.flatMap(result => result.status === "fulfilled" ? result.value : []);
  if (!addresses.length || addresses.some(address => !publicAddress(address))) {
    throw new Error("This link does not resolve to a public website.");
  }
  return url;
}

/** Fetch one public HTML page, following up to 4 redirects (each re-checked). */
async function fetchPublicPage(uri: string, options?: { fragment?: boolean }, checkRedirect?: (url: URL) => Promise<void>): Promise<{ html: string; finalUrl: URL }> {
  let current = await publicHttps(uri);
  const deadline = Date.now() + 12000;
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { Accept: "text/html,text/plain", "User-Agent": "MyRealtorAppBuilder/1.0",
        ...(options?.fragment ? { "X-Requested-With": "XMLHttpRequest" } : {}) },
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || hop === 4) throw new Error("The page redirected too many times.");
      current = await publicHttps(new URL(location, current).toString());
      await checkRedirect?.(current);
      continue;
    }
    if (!response.ok) throw new Error(`The page returned ${response.status}.`);
    if (!/text\/(html|plain)/i.test(response.headers.get("content-type") ?? "")) {
      throw new Error("The link is not a readable webpage.");
    }
    if (Number(response.headers.get("content-length") ?? 0) > 2_000_000) {
      throw new Error("The page is too large to analyze.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The page is empty.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        throw new Error("The page is too large to analyze.");
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return { html: new TextDecoder().decode(joined), finalUrl: current };
  }
  throw new Error("The page redirected too many times.");
}

export function robotsAllows(text: string, path: string) {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let group = { agents: [] as string[], rules: [] as { allow: boolean; path: string }[] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!match) continue;
    const [, name, value] = match;
    if (name.toLowerCase() === "user-agent") {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
    } else if (value && group.agents.length) group.rules.push({ allow: name.toLowerCase() === "allow", path: value });
  }
  groups.push(group);
  const specific = groups.filter(g => g.agents.some(a => !!a && a !== "*" && "myrealtorappbuilder".includes(a)));
  const selected = specific.length ? specific : groups.filter(g => g.agents.includes("*"));
  const rules = selected.flatMap(g => g.rules).filter(rule => {
    const pattern = rule.path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try { return new RegExp("^" + pattern).test(path); } catch { return false; }
  }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return !rules.length || rules[0].allow;
}

const robotCache = new Map<string, { at: number; promise: Promise<string> }>();
async function respectRobots(url: URL) {
  let cached = robotCache.get(url.origin);
  if (!cached || Date.now() - cached.at > 600_000) {
    const promise = fetchPublicPage(url.origin + "/robots.txt").then(page => page.html).catch(error => {
      if (/returned 404\./.test(String(error))) return "";
      throw new Error("This website's access rules couldn't be checked. Try another public listings page.");
    });
    cached = { at: Date.now(), promise }; robotCache.set(url.origin, cached);
  }
  if (!robotsAllows(await cached.promise, url.pathname + url.search)) throw new Error("This website doesn't allow automatic access to that page. Paste another public listings or profile URL.");
}

export async function fetchHtml(uri: string, options?: { fragment?: boolean }) {
  const url = await publicHttps(uri);
  await respectRobots(url);
  const page = await fetchPublicPage(uri, options, respectRobots);
  if (/<input\b[^>]*type=["']password["']|\b(?:captcha|verify you are human|access denied)\b/i.test(page.html) ||
    /\/(?:login|signin|sign-in)(?:\/|$)/i.test(page.finalUrl.pathname)) {
    throw new Error("That page needs sign-in or blocks automatic access. Paste a public listings or profile URL that opens without signing in.");
  }
  return page;
}

