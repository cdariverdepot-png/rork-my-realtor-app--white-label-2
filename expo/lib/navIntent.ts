/**
 * One-shot navigation hints read by screen options. Set just before a
 * router.replace that should look like going back (e.g. leaving the client
 * preview for the dashboard), so the stack animates it as a pop, not a push.
 */
export const navIntent = { replaceAsBack: false };
