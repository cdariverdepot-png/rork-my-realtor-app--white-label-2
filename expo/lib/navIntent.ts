/**
 * One-shot navigation hints read by screen options. Set just before a
 * router.replace that should look like going back (e.g. leaving the client
 * preview for the dashboard), so the stack animates it as a pop, not a push.
 */
export const navIntent = { replaceAsBack: false };

let pendingExit: ReturnType<typeof setTimeout> | null = null;

/**
 * Leave a client preview (or the demo) for the dashboard: navigate first,
 * animated as a "back", and only clear the preview flags once the dashboard is
 * in place. Clearing them first re-renders the leaving screen mid-transition
 * and fires a second redirect.
 */
export function leavePreviewToDashboard(replace: (path: "/admin") => void, clearFlags: () => void) {
  cancelPendingPreviewExit();
  navIntent.replaceAsBack = true;
  replace("/admin");
  pendingExit = setTimeout(() => {
    pendingExit = null;
    navIntent.replaceAsBack = false;
    clearFlags();
  }, 400);
}

/** Re-entering a preview right after leaving must not be undone by the old timer. */
export function cancelPendingPreviewExit() {
  if (pendingExit) clearTimeout(pendingExit);
  pendingExit = null;
  navIntent.replaceAsBack = false;
}

/** Back, or to the dashboard when there's no history (web refresh, deep link). */
export function backOr(router: { canGoBack: () => boolean; back: () => void; replace: (path: "/admin") => void }) {
  if (router.canGoBack()) router.back();
  else router.replace("/admin");
}
