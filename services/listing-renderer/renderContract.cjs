// Public-page render contract. No browser, no secrets, no hostname-specific sites.
const HTML_CAP = 1_500_000;
const NETWORK_CAP = 30;
const NETWORK_BODY_CAP = 256_000;

function isPrivateAddress(ip) {
  const value = String(ip).toLowerCase().replace(/^\[|\]$/g, "");
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  if (value.includes(":")) {
    return value === "::1" || value === "::" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd");
  }
  const parts = value.split(".").map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isIpLiteral(host) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");
}

/** HTTPS public pages only. Private networks, metadata hosts and non-HTTP schemes are rejected. */
function publicRenderTarget(raw) {
  let url;
  try { url = new URL(String(raw)); } catch { return { error: "Renderer URL is not public HTTPS", status: 400 }; }
  if (url.protocol !== "https:" || url.username || url.password) return { error: "Renderer URL is not public HTTPS", status: 400 }; 
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
    || host === "metadata.google.internal" || host === "metadata.google.com" || host.endsWith(".metadata.google.internal")) {
    return { error: "Renderer URL is not public HTTPS", status: 400 };
  }
  if (isIpLiteral(host) && isPrivateAddress(host)) return { error: "Renderer URL is not public HTTPS", status: 400 };
  url.hash = "";
  return { url };
}

function sameSite(left, right) {
  const strip = host => host.replace(/^www\./, "").toLowerCase();
  return strip(left.hostname) === strip(right.hostname);
}

function providerInventoryHost(hostname) {
  return /(?:^|\.)(?:flexmls\.com|sparkplatform\.com|idxhome\.com|ihomefinder\.com|showcaseidx\.com|placester\.com|chimeroi\.com|chime\.me)$/i.test(hostname);
}

function usefulNetworkBody(entry, pageUrl) {
  let url;
  try { url = new URL(entry.url); } catch { return false; }
  if (url.protocol !== "https:") return false;
  const type = String(entry.contentType || "");
  if (/image|font|css|video|audio|octet-stream/i.test(type)) return false;
  const path = `${url.pathname}${url.search}`;
  const structured = /json/i.test(type) || /\/(?:api|graphql)\b|listing|search|bootstrap|config/i.test(path);
  if (!structured) return false;
  if (sameSite(url, pageUrl)) return true;
  return providerInventoryHost(url.hostname) && /\/(?:api|graphql)\b|listing|search/i.test(path);
}

/** Keep the discovery engine's useful same-origin payloads and drop the rest. */
function selectCapturedResponses(entries, pageUrl, secret) {
  let page;
  try { page = new URL(pageUrl); } catch { return []; }
  const out = [];
  for (const entry of entries || []) {
    if (out.length >= NETWORK_CAP) break;
    if (!entry || typeof entry.url !== "string" || !usefulNetworkBody(entry, page)) continue;
    let html = String(entry.html ?? "").slice(0, NETWORK_BODY_CAP);
    if (secret && secret.length >= 8) html = html.split(secret).join("[session]");
    out.push({ url: entry.url, html });
  }
  return out;
}

function boundDocument(html, secret) {
  let text = String(html ?? "").slice(0, HTML_CAP);
  if (secret && secret.length >= 8) text = text.split(secret).join("[session]");
  return text;
}

module.exports = {
  HTML_CAP, NETWORK_CAP, NETWORK_BODY_CAP,
  isPrivateAddress, publicRenderTarget, selectCapturedResponses, boundDocument,
};
