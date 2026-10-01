/**
 * Deploy-web.yml rewrites expo/.env.production to APP_URL only.
 * postinstall normalizes critical EXPO_PUBLIC_* flags after that rewrite
 * and before export.
 *
 * - AUTH_BYPASS defaults OFF so real login/verification/password-reset work.
 * - Guest role codes: REALTOR (admin build), CLIENT + DEMO (client profile).
 *   Never shown in UI; kept in .env.production after deploy-web rewrites.
 */
const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, "..", ".env.production");

/** @type {Record<string, string>} */
const ENSURE = {
  EXPO_PUBLIC_AUTH_BYPASS: "false",
  EXPO_PUBLIC_REALTOR_ACCESS_CODE: "REALTOR",
  EXPO_PUBLIC_CLIENT_ACCESS_CODE: "CLIENT",
  EXPO_PUBLIC_GUEST_ACCESS_CODE: "DEMO",
};

try {
  let body = "";
  try {
    body = fs.readFileSync(envPath, "utf8");
  } catch {
    body = "";
  }
  const lines = body.split(/\n/);
  const next = [];
  const found = new Set();
  for (const line of lines) {
    let matched = false;
    for (const key of Object.keys(ENSURE)) {
      if (new RegExp("^\\s*" + key + "\\s*=").test(line)) {
        next.push(`${key}=${ENSURE[key]}`);
        found.add(key);
        matched = true;
        break;
      }
    }
    if (!matched && (line.length || next.length)) next.push(line);
  }
  for (const [key, value] of Object.entries(ENSURE)) {
    if (!found.has(key)) next.push(`${key}=${value}`);
  }
  while (next.length && next[next.length - 1] === "") next.pop();
  fs.writeFileSync(envPath, next.join("\n") + "\n");
  console.log(
    "[ensure-auth-bypass-env]",
    Object.entries(ENSURE).map(([k, v]) => `${k}=${v}`).join(" ")
  );
} catch (e) {
  console.warn("[ensure-auth-bypass-env]", e && e.message ? e.message : e);
}
