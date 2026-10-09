/** Temporary diagnostics for the gate harness (only when the harness sets window.__mraHistoryTrace). */
export function historyTrace(tag: string, kind: string, data: object = {}) {
  if (typeof window === "undefined" || !(window as unknown as { __mraHistoryTrace?: boolean }).__mraHistoryTrace) return;
  console.log("[hist]", JSON.stringify({ tag, kind, ...data, path: window.location.pathname, stack: (new Error().stack ?? "").split("\n").slice(2, 9).map(l => l.trim().slice(0, 160)).join(" | ") }));
}
