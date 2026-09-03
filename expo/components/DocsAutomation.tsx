import { useEffect, useRef } from "react";
import { useDocuments, type DocItem } from "@/contexts/DocumentsContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useClients } from "@/contexts/ClientsContext";

/**
 * Simulates the webhook callbacks an e-signature portal (DocuSign / Dotloop /
 * SkySlope) would normally fire back into the app. Drives portal envelopes
 * through Sent → Opened → Signed automatically and surfaces a concierge
 * notification on every transition.
 *
 * Real production wiring would replace the timed transitions with a server
 * polling endpoint or a webhook receiver — the local state shape is identical.
 */
const TICK_MS = 12_000;
/** A portal envelope is considered "opened by the client" after this delay. */
const OPEN_AFTER_MS = 45_000;
/** Once opened, signing typically completes within this window. */
const SIGN_AFTER_OPEN_MS = 90_000;

const PORTAL_LABEL_SHORT: Record<string, string> = {
  docusign: "DocuSign",
  dotloop: "Dotloop",
  skyslope: "SkySlope",
  authentisign: "Authentisign",
  adobesign: "Adobe Sign",
  hellosign: "Dropbox Sign",
  other: "secure portal",
};

function recipientLabel(d: DocItem, lookup: Map<string, string>): string {
  const ids = d.recipientIds ?? [];
  if (ids.length === 0) return "Your client";
  const names = ids
    .map((id) => lookup.get(id))
    .filter((s): s is string => !!s);
  if (names.length === 0) return "Your client";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}

export default function DocsAutomation() {
  const { items, hydrated, setStatus } = useDocuments();
  const { broadcastFromRealtor } = useNotifications();
  const { clients } = useClients();

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  /** Avoids re-firing notifications across re-renders / app foregrounding. */
  const announcedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!hydrated) return;
    const tick = () => {
      const now = Date.now();
      const lookup = new Map<string, string>();
      for (const c of clientsRef.current) lookup.set(c.id, c.name);

      for (const d of itemsRef.current) {
        if (d.kind !== "portal") continue;
        const sentAt = d.sentAt ?? d.uploadedAt;
        const portalName = d.portal ? PORTAL_LABEL_SHORT[d.portal] ?? "secure portal" : "secure portal";
        const recipient = recipientLabel(d, lookup);

        // Awaiting → Viewed
        if (
          (d.status === "awaiting-signature" || d.status === "shared" || !d.status) &&
          !d.viewedAt &&
          now - sentAt >= OPEN_AFTER_MS
        ) {
          const key = `${d.id}:viewed`;
          if (!announcedRef.current.has(key)) {
            announcedRef.current.add(key);
            setStatus(d.id, "viewed");
            broadcastFromRealtor({
              kind: "status",
              title: `${recipient} opened ${d.name}`,
              body: `Tracked through ${portalName}. Awaiting signature.`,
              recipientIds: undefined,
            });
          }
          continue;
        }

        // Viewed → Signed
        if (
          d.status === "viewed" &&
          d.viewedAt &&
          !d.signedAt &&
          now - d.viewedAt >= SIGN_AFTER_OPEN_MS
        ) {
          const key = `${d.id}:signed`;
          if (!announcedRef.current.has(key)) {
            announcedRef.current.add(key);
            setStatus(d.id, "signed");
            broadcastFromRealtor({
              kind: "status",
              title: `${recipient} signed ${d.name}`,
              body: `Audit trail filed automatically via ${portalName}.`,
              recipientIds: undefined,
            });
          }
        }
      }
    };

    // Run once immediately so a freshly opened app reconciles state.
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [hydrated, setStatus, broadcastFromRealtor]);

  return null;
}
