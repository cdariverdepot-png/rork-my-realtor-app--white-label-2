/**
 * Browser history for the app builder's own steps (web, including Safari on iPhone). The builder's steps are one
 * screen, so without this the browser's Back and the edge swipe skipped the review and left the builder. The
 * review is pushed as one history entry above the website address:
 *  - Back from the review pops that entry: the builder returns to the address, pre-filled, without importing;
 *  - leaving the review on screen (Back or Change) drops the entry, so the next Back leaves the builder;
 *  - the client-app preview opened from the review pushes its own entries on top (copying this marker), so
 *    stepping back through the preview never counts as leaving the review.
 */
export type HistoryLike = { state: unknown; pushState: (state: unknown, title: string) => void; back: () => void };
export type BuilderStep = "collect" | "building" | "review";

const MARKER = "builderStep";
const onReviewEntry = (state: unknown) => (state as Record<string, unknown> | null)?.[MARKER] === "review";

export function createBuilderHistory(history: HistoryLike) {
  let entry = false;
  return {
    /** The builder's step changed. */
    sync(step: BuilderStep) {
      if (step === "review" && !entry) {
        history.pushState({ ...((history.state as object | null) ?? {}), [MARKER]: "review" }, "");
        entry = true;
      } else if (step !== "review" && entry) {
        entry = false;
        if (onReviewEntry(history.state)) history.back();
      }
    },
    /** A popstate arrived: true when it popped the review's own entry (the builder goes back to the address). */
    popped(): boolean {
      if (!entry || onReviewEntry(history.state)) return false;
      entry = false;
      return true;
    },
  };
}
