export const PUBLISHED_AUTH_RETURN = "https://my-realtor-app-white-label-2.rork.app";

/** Exact destinations configured in Supabase. Never forward arbitrary URL parameters. */
export function signupEmailRedirect(_origin?: string): string {
  // Email may be opened on a different device. Never send it to loopback.
  return PUBLISHED_AUTH_RETURN;
}
