/**
 * Browser history for screens that keep steps of their own inside one route (web, including Safari on iPhone):
 * the app builder's review and the client-app preview opened over it (or over the dashboard).
 *
 * The router (react-navigation's linking) answers every popstate by resetting the whole navigation state to the
 * one it recorded for that history entry. For entries these screens push themselves that record can be older
 * than the screen (the dashboard's record dates from page load), and resetting to it remounts the screen: the
 * preview closed and its cleanup walked further back, out of the dashboard. So a popstate that belongs to one of
 * these entries is handled here and stopped before the router sees it (`claimPop`, a capture listener on window,
 * which runs before the router's own listener).
 *
 * The builder's review is pushed as one history entry above the website address:
 *  - Back from the review pops that entry: the builder returns to the address, pre-filled, without importing;
 *  - leaving the review on screen (Back or Change) drops the entry, so the next Back leaves the builder;
 *  - a layer with history entries of its own (the client-app preview) is above it while open: stepping back
 *    through that layer, and the layer dropping its entries as it closes, never count as leaving the review.
 * Entries are recognized by who owns the top of the history, not by data in history.state (the router replaces
 * history.state with its own record).
 */
export type HistoryLike = { pushState: (state: unknown, title: string) => void; back: () => void; state?: unknown };
export type BuilderStep = "collect" | "building" | "review";

/** Layers with their own history entries (ThemePreviewModal registers while it is open on the web). */
let openLayers = 0;
let layerClosedAt = 0;
const SETTLE_MS = 800;
export const historyLayers = {
  open() { openLayers++; },
  /** Call before the layer drops its remaining entries (history.go(-n)), so that pop is not read as Back. */
  close(now = Date.now()) { openLayers = Math.max(0, openLayers - 1); layerClosedAt = now; },
  /** A pop now belongs to a layer: one is open, or one just closed and is dropping its entries. */
  active(now = Date.now()) { return openLayers > 0 || now - layerClosedAt < SETTLE_MS; },
  reset() { openLayers = 0; layerClosedAt = 0; },
};

/** Keep a popstate from reaching the router (and any later listener). */
export function claimPop(event: { stopImmediatePropagation?: () => void } | undefined) {
  event?.stopImmediatePropagation?.();
}

export function createBuilderHistory(history: HistoryLike, layers: Pick<typeof historyLayers, "active"> = historyLayers) {
  let entry = false;
  let ownBack = 0;
  return {
    /** The builder's step changed. */
    sync(step: BuilderStep) {
      if (step === "review" && !entry) {
        history.pushState({ ...((history.state as object | null) ?? {}), builderStep: "review" }, "");
        entry = true;
      } else if (step !== "review" && entry) {
        // Left the review on screen: its entry is the top one (no layer can be open here); drop it.
        entry = false;
        ownBack++;
        history.back();
      }
    },
    /**
     * A popstate arrived. "review": it popped the review's entry (the builder goes back to the address);
     * "own": the builder dropped its entry itself; null: not the builder's (a layer's, or another page's).
     */
    popped(): "review" | "own" | null {
      if (ownBack > 0) { ownBack--; return "own"; }
      if (!entry || layers.active()) return null;
      entry = false;
      return "review";
    },
  };
}
