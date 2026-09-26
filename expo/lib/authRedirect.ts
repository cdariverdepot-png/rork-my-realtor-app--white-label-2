export const PUBLISHED_AUTH_RETURN = "https://my-realtor-app-white-label-2.rork.app";

/** Exact destinations configured in Supabase. Never forward arbitrary URL parameters. */
export function signupEmailRedirect(origin?: string): string {
  return origin === "http://127.0.0.1:4179"
    ? "http://127.0.0.1:4179/"
    : PUBLISHED_AUTH_RETURN;
}
