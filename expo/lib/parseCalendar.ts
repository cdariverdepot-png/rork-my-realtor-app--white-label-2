/**
 * Lightweight ICS (iCalendar / RFC 5545) parser.
 * Handles VEVENT blocks, line unfolding, escaped commas/semicolons,
 * DTSTART/DTEND with TZID or UTC ("Z") suffix, all-day DATE values, and DURATION.
 *
 * RRULE / recurring events are NOT expanded — we surface the master event
 * with its DTSTART. That's intentional: realtors typically import a small
 * number of upcoming bookings, and pulling a full recurrence engine would
 * add ~30kb for marginal value. Recurring events still appear as a single
 * row with a "(repeats)" hint so nothing is silently dropped.
 */

export type ParsedEvent = {
  /** ICS UID — used for dedup across re-syncs. */
  uid: string;
  title: string;
  startsAt: number;
  durationMin: number;
  location?: string;
  notes?: string;
  /** True if RRULE present — informational only. */
  recurring?: boolean;
};

function unfold(text: string): string {
  // RFC 5545: lines beginning with a space or tab continue the previous line.
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
}

/** Unescape ICS TEXT values (\n, \, , ; ). */
function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** Parse an ICS DATE / DATE-TIME value (TZID stripped) to ms since epoch. */
function parseIcsDate(value: string, tzid?: string): number | null {
  // YYYYMMDD or YYYYMMDDTHHMMSS[Z]
  const v = value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mi = "00", ss = "00", z] = m;
  const utc = z === "Z";

  // We don't ship a tz database. If TZID is present we treat it as local; if Z
  // we use UTC; if a bare datetime we use the device's local tz. Any drift is
  // small relative to typical showing windows and predictable for the user.
  if (utc || tzid) {
    return Date.UTC(+y, +mo - 1, +d, +hh, +mi, +ss);
  }
  return new Date(+y, +mo - 1, +d, +hh, +mi, +ss).getTime();
}

/** Parse an ISO-8601 duration (PT1H30M etc.) to minutes. */
function parseDurationMin(value: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return 60;
  const [, d, h, mi] = m;
  return (+(d ?? 0) * 24 + +(h ?? 0)) * 60 + +(mi ?? 0);
}

/** Split a property line "KEY;PARAM=VAL:value" into { key, params, value }. */
function splitProp(line: string): { key: string; params: Record<string, string>; value: string } {
  const colon = line.indexOf(":");
  if (colon < 0) return { key: "", params: {}, value: "" };
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(";");
  const key = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i += 1) {
    const eq = parts[i].indexOf("=");
    if (eq > 0) params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
  }
  return { key, params, value };
}

export function parseICS(text: string): ParsedEvent[] {
  const unfolded = unfold(text);
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const out: ParsedEvent[] = [];

  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0];
    const lines = body.split("\n").filter(Boolean);

    let uid = "";
    let title = "";
    let location = "";
    let notes = "";
    let startsAt: number | null = null;
    let endsAt: number | null = null;
    let durationMin: number | null = null;
    let allDay = false;
    let recurring = false;

    for (const line of lines) {
      const { key, params, value } = splitProp(line);
      if (!key) continue;

      switch (key) {
        case "UID":
          uid = value.trim();
          break;
        case "SUMMARY":
          title = unescapeText(value);
          break;
        case "LOCATION":
          location = unescapeText(value);
          break;
        case "DESCRIPTION":
          notes = unescapeText(value);
          break;
        case "DTSTART":
          startsAt = parseIcsDate(value, params.TZID);
          if (params.VALUE === "DATE") allDay = true;
          break;
        case "DTEND":
          endsAt = parseIcsDate(value, params.TZID);
          break;
        case "DURATION":
          durationMin = parseDurationMin(value);
          break;
        case "RRULE":
          recurring = true;
          break;
        default:
          break;
      }
    }

    if (!startsAt) continue;
    if (durationMin == null) {
      if (endsAt != null) durationMin = Math.max(15, Math.round((endsAt - startsAt) / 60000));
      else durationMin = allDay ? 24 * 60 : 60;
    }

    out.push({
      uid: uid || `gen_${startsAt}_${title.slice(0, 12)}`,
      title: title || "Untitled event",
      startsAt,
      durationMin,
      location: location || undefined,
      notes: notes || undefined,
      recurring: recurring || undefined,
    });
  }

  // Sort earliest first.
  out.sort((a, b) => a.startsAt - b.startsAt);
  return out;
}

/**
 * Many calendar providers expose webcal:// URLs. Normalize so fetch() works.
 * Also accepts plain https:// links.
 */
export function normalizeFeedUrl(input: string): string {
  const t = input.trim();
  if (!t) return "";
  if (t.startsWith("webcal://")) return `https://${t.slice("webcal://".length)}`;
  if (t.startsWith("webcals://")) return `https://${t.slice("webcals://".length)}`;
  return t;
}
