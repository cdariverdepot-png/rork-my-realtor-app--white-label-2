/**
 * Browser history for the app builder's own steps (web, including Safari on iPhone). The builder's steps are one
 * screen, so without this the browser's Back and the edge swipe skipped the review and left the builder. The
 * review is pushed as one history entry above the website address:
 *  - Back from the review pops that entry: the builder returns to the address, pre-filled, without importing;
 *  - leaving the review on screen (Back or Change) drops the entry, so the next Back leaves the builder;
 *  - a layer with history entries of its own (the client-app preview) is above it while open: stepping back
 *    through that layer, and the layer dropping its entries as it closes, never count as leaving the review.
 *
 * Entries are recognized by who owns the top of the history, not by data stored in history.state: the router
 * replaces history.state with its own record whenever its navigation state updates.
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

export function createBuilderHistory(history: HistoryLike, layers: Pick<typeof historyLayers, "active"> = historyLayers) {
  let entry = false;
  return {
    /** The builder's step changed. */
    sync(step: BuilderStep) {
      if (step === "review" && !entry) {
        history.pushState({ ...((history.state as object | null) ?? {}), builderStep: "review" }, "");
        entry = true;
      } else if (step !== "review" && entry) {
        // Left the review on screen: its entry is the top one (no layer can be open here); drop it.
        entry = false;
        history.back();
      }
    },
    /** A popstate arrived: true when it popped the review's own entry (the builder goes back to the address). */
    popped(): boolean {
      if (!entry || layers.active()) return false;
      entry = false;
      return true;
    },
  };
}
