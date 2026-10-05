// HTTPS rendering backend for the existing importer contract.
// POST { url, cookie? } -> { html, finalUrl, network }. Does not solve CAPTCHA.
import http from "node:http";
import { createRequire } from "node:module";
import { lookup } from "node:dns/promises";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { publicRenderTarget, selectCapturedResponses, boundDocument, isPrivateAddress } = require("./renderContract.cjs");

const NAV_TIMEOUT_MS = 10_000;
const BODY_LIMIT = 16_000;

function authorized(header, token) {
  if (!token) return false;
  const expected = `Bearer ${token}`;
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

async function assertPublicResolution(url) {
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => isPrivateAddress(record.address))) {
    throw Object.assign(new Error("Renderer URL is not public HTTPS"), { status: 400 });
  }
}

async function renderWithBrowser(browser, target, cookie) {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: false,
  });
  const captured = [];
  try {
    if (cookie) await context.setExtraHTTPHeaders({ cookie: String(cookie).slice(0, 4000) });
    const page = await context.newPage();
    page.on("response", response => {
      if (captured.length >= 40) return;
      const type = response.headers()["content-type"] || "";
      captured.push(response.text().then(html => ({ url: response.url(), contentType: type, html })).catch(() => null));
    });
    const response = await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    let redirects = 0;
    let request = response && response.request();
    while (request && request.redirectedFrom()) {
      redirects += 1;
      request = request.redirectedFrom();
      if (redirects > 6) throw Object.assign(new Error("Renderer stopped a redirect loop"), { status: 502 });
    }
    await page.waitForTimeout(1200);
    const finalUrl = page.url();
    const checked = publicRenderTarget(finalUrl);
    if (checked.error) throw Object.assign(new Error(checked.error), { status: 400 });
    const html = boundDocument(await page.content(), cookie);
    if (!html.trim()) throw Object.assign(new Error("Renderer returned an empty document"), { status: 502 });
    const network = selectCapturedResponses((await Promise.all(captured)).filter(Boolean), finalUrl, cookie);
    return { html, finalUrl, network };
  } finally {
    await context.close().catch(() => {});
  }
}

function createListingRenderServer(options) {
  const token = options.token;
  const lanes = new Map();
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      const payload = JSON.stringify(body);
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
      res.end(payload);
    };
    if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
    if (req.method !== "POST" || (req.url || "/").split("?")[0] !== "/") return send(404, { error: "Not found" });
    if (!authorized(req.headers.authorization || "", token)) return send(401, { error: "Unauthorized" });
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
      catch { return send(400, { error: "Malformed renderer request" }); }
      const target = publicRenderTarget(body.url);
      if (target.error) return send(target.status, { error: target.error });
      const host = target.url.hostname;
      const previous = lanes.get(host) || Promise.resolve();
      let release = () => {};
      const gate = new Promise(resolve => { release = resolve; });
      lanes.set(host, previous.then(() => gate, () => gate));
      previous.catch(() => {}).then(async () => {
        try {
          await assertPublicResolution(target.url);
          const rendered = await renderWithBrowser(options.browser, target.url, typeof body.cookie === "string" ? body.cookie : "");
          send(200, rendered);
        } catch (error) {
          const message = String(error && error.message || "");
          const known = error && error.status && /^(Renderer |Render )/.test(message);
          const status = error && error.status ? error.status : /timeout/i.test(message) ? 504 : 502;
          if (status === 502 && !known) console.error("render failed", message.slice(0, 300));
          send(status, { error: status === 504 ? "Render timed out" : known ? message : "Render failed" });
        } finally {
          release();
        }
      });
    });
  });
  return server;
}

async function main() {
  const token = process.env.LISTING_RENDER_TOKEN;
  if (!token || token.length < 16) {
    console.error("LISTING_RENDER_TOKEN must be set to at least 16 characters.");
    process.exit(1);
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const port = Number(process.env.PORT || 8080);
  const server = createListingRenderServer({ browser, token });
  const close = async () => {
    server.close();
    await browser.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
  server.listen(port, "0.0.0.0", () => {
    console.log(`listing renderer listening on ${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

export { createListingRenderServer, renderWithBrowser };
