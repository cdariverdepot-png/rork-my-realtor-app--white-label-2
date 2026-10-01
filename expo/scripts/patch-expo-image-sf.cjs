/**
 * Harden expo-image's SF Symbol detection.
 * Upstream calls `uri.startsWith('sf:/')` without checking typeof uri === 'string',
 * which throws when a non-string (require id, nested object) lands in source.uri.
 */
const fs = require("node:fs");
const path = require("node:path");

const targets = [
  {
    file: path.join(__dirname, "..", "node_modules", "expo-image", "src", "Image.tsx"),
    from: "Array.isArray(resolvedSource) && resolvedSource.some((s) => s?.uri?.startsWith('sf:/'));",
    to: "Array.isArray(resolvedSource) && resolvedSource.some((s) => typeof s?.uri === 'string' && s.uri.startsWith('sf:/'));",
  },
  {
    file: path.join(__dirname, "..", "node_modules", "expo-image", "src", "web", "hooks.ts"),
    from: "const isThumbhash = isThumbhashString(source?.uri || '');",
    to: "const isThumbhash = typeof source?.uri === 'string' && isThumbhashString(source.uri);",
  },
];

for (const t of targets) {
  try {
    let body = fs.readFileSync(t.file, "utf8");
    if (body.includes(t.to)) {
      console.log("[patch-expo-image-sf] already applied", path.basename(t.file));
      continue;
    }
    if (!body.includes(t.from)) {
      console.log("[patch-expo-image-sf] pattern missing, skip", path.basename(t.file));
      continue;
    }
    fs.writeFileSync(t.file, body.replace(t.from, t.to));
    console.log("[patch-expo-image-sf] patched", path.basename(t.file));
  } catch (e) {
    console.log("[patch-expo-image-sf] skip", path.basename(t.file), e && e.message);
  }
}
