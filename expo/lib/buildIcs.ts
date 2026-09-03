/**
 * Minimal RFC 5545 ICS builder for showing appointments.
 * Used to produce two-way calendar holds (Apple/Google/Outlook).
 */

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function fmtUTC(t: number): string {
  const d = new Date(t);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export type IcsInput = {
  uid: string;
  title: string;
  startsAt: number;
  durationMin: number;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
};

/** Build a single-event ICS calendar string. */
export function buildIcs(input: IcsInput): string {
  const end = input.startsAt + input.durationMin * 60_000;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vance Private//Showings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${fmtUTC(Date.now())}`,
    `DTSTART:${fmtUTC(input.startsAt)}`,
    `DTEND:${fmtUTC(end)}`,
    `SUMMARY:${escape(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escape(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escape(input.location)}`);
  if (input.organizerEmail) {
    const cn = input.organizerName ? `;CN=${escape(input.organizerName)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${input.organizerEmail}`);
  }
  // Two reminders mirroring the in-app schedule.
  lines.push(
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Showing in 24 hours",
    "TRIGGER:-P1D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Showing in 1 hour",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  );
  return lines.join("\r\n");
}

/** Encode an ICS string as a data URL suitable for `Linking.openURL`. */
export function icsDataUrl(ics: string): string {
  // Native iOS/Android Linking handles data: URLs but base64 is safest.
  if (typeof globalThis.btoa === "function") {
    return `data:text/calendar;base64,${globalThis.btoa(unescape(encodeURIComponent(ics)))}`;
  }
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

/** Build a Google Calendar quick-add deep link. */
export function googleCalendarUrl(input: IcsInput): string {
  const start = fmtUTC(input.startsAt);
  const end = fmtUTC(input.startsAt + input.durationMin * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${start}/${end}`,
  });
  if (input.description) params.set("details", input.description);
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
