/**
 * Deploy-web.yml rewrites expo/.env.production to APP_URL (+ bypass flag).
 * postinstall normalizes EXPO_PUBLIC_AUTH_BYPASS after that rewrite and before export.
 *
 * Production default is OFF so real login/verification/password-reset work.
 * Set DEFAULT_BYPASS = "true" only for intentional preview/demo builds.
 */
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BYPASS = "false";
const envPath = path.join(__dirname, "..", ".env.production");
const KEY = "EXPO_PUBLIC_AUTH_BYPASS";

try {
  let body = "";
  try {
    body = fs.readFileSync(envPath, "utf8");
  } catch {
    body = "";
  }
  const lines = body.split(/\n/);
  const next = [];
  let found = false;
  for (const line of lines) {
    if (/^\s*EXPO_PUBLIC_AUTH_BYPASS\s*=/.test(line)) {
      next.push(`${KEY}=${DEFAULT_BYPASS}`);
      found = true;
    } else if (line.length || next.length) {
      next.push(line);
    }
  }
  if (!found) next.push(`${KEY}=${DEFAULT_BYPASS}`);
  while (next.length && next[next.length - 1] === "") next.pop();
  fs.writeFileSync(envPath, next.join("\n") + "\n");
  console.log(`[ensure-auth-bypass-env] ${KEY}=${DEFAULT_BYPASS}`);
} catch (e) {
  console.warn("[ensure-auth-bypass-env]", e && e.message ? e.message : e);
}
