import type { ClientDraft } from "@/contexts/ClientsContext";

/**
 * Parse a single CSV line, respecting double-quoted values
 * and escaped quotes ("") inside fields. Tolerant of stray spaces.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Split a CSV file into header + rows, handling \r\n / \n. */
function splitRows(text: string): string[] {
  // Strip BOM if present, normalise newlines.
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return cleaned.split("\n").filter((r) => r.length > 0);
}

const NAME_KEYS = [
  "name",
  "full name",
  "display name",
  "contact name",
];
const FIRST_KEYS = ["first name", "given name", "firstname"];
const LAST_KEYS = ["last name", "family name", "surname", "lastname"];
const EMAIL_KEYS = [
  "email",
  "e-mail",
  "email address",
  "e-mail address",
  "email 1 - value",
  "primary email",
];
const PHONE_KEYS = [
  "phone",
  "phone number",
  "mobile",
  "mobile phone",
  "cell",
  "cell phone",
  "phone 1 - value",
  "primary phone",
];
const COMPANY_KEYS = ["company", "organization", "organisation"];
const TITLE_KEYS = ["job title", "title", "position"];

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v && v.trim()) return v.trim();
  }
  // Try fuzzy contains match.
  for (const k of keys) {
    const found = Object.keys(row).find((rk) => rk.includes(k));
    if (found) {
      const v = row[found];
      if (v && v.trim()) return v.trim();
    }
  }
  return "";
}

/**
 * Parse a CSV exported from Google Contacts, Outlook, Apple Contacts,
 * or LinkedIn. Returns drafts that still need an explicit source assigned.
 */
export function parseCsvContacts(text: string): ClientDraft[] {
  const rows = splitRows(text);
  if (rows.length < 2) return [];
  const header = parseCsvLine(rows[0]).map((h) => h.toLowerCase());
  const out: ClientDraft[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cells = parseCsvLine(rows[i]);
    if (cells.every((c) => !c)) continue;
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = cells[idx] ?? "";
    });

    const first = pick(obj, FIRST_KEYS);
    const last = pick(obj, LAST_KEYS);
    const fallbackName = pick(obj, NAME_KEYS);
    const name = (fallbackName || `${first} ${last}`).trim();
    const email = pick(obj, EMAIL_KEYS);
    const phone = pick(obj, PHONE_KEYS);
    const company = pick(obj, COMPANY_KEYS);
    const title = pick(obj, TITLE_KEYS);
    const tagBits = [title, company].filter(Boolean);

    if (!name && !email && !phone) continue;
    out.push({
      name: name || email || phone,
      email,
      phone: phone || undefined,
      tag: tagBits.length > 0 ? tagBits.join(" · ") : undefined,
    });
  }
  return out;
}

/** Parse a vCard (.vcf) file, possibly containing multiple cards. */
export function parseVCard(text: string): ClientDraft[] {
  const cards = text
    .replace(/\r\n?/g, "\n")
    // Unfold lines per RFC 6350 (folded continuation = newline + space/tab).
    .replace(/\n[ \t]/g, "")
    .split(/BEGIN:VCARD/i)
    .slice(1);

  const out: ClientDraft[] = [];
  for (const block of cards) {
    const body = block.split(/END:VCARD/i)[0];
    const lines = body.split("\n").filter(Boolean);

    let name = "";
    let email = "";
    let phone = "";
    let org = "";
    let title = "";

    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const rawKey = line.slice(0, colon).toUpperCase();
      const value = line.slice(colon + 1).trim();
      const key = rawKey.split(";")[0];

      if (key === "FN" && !name) name = value;
      else if (key === "N" && !name) {
        // N: family;given;additional;prefix;suffix
        const parts = value.split(";");
        const given = parts[1] ?? "";
        const family = parts[0] ?? "";
        name = `${given} ${family}`.trim();
      } else if (key === "EMAIL" && !email) email = value;
      else if (key === "TEL" && !phone) phone = value;
      else if (key === "ORG" && !org) org = value.split(";")[0];
      else if (key === "TITLE" && !title) title = value;
    }

    if (!name && !email && !phone) continue;
    const tagBits = [title, org].filter(Boolean);
    out.push({
      name: name || email || phone,
      email,
      phone: phone || undefined,
      tag: tagBits.length > 0 ? tagBits.join(" · ") : undefined,
    });
  }
  return out;
}

/** Detect file type from the first non-empty bytes of content. */
export function sniffContactFile(
  text: string,
): "vcard" | "csv" | "unknown" {
  const head = text.slice(0, 200).toUpperCase();
  if (head.includes("BEGIN:VCARD")) return "vcard";
  if (head.includes(",")) return "csv";
  return "unknown";
}
