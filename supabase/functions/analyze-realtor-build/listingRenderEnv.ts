/** Git copy is empty on purpose. Do not commit a renderer URL or token.
 *  The deploy workflow overwrites this file on the runner when the Supabase
 *  access token cannot call secrets set, then deploys that copy.
 */
export function listingRenderEnv(_name: string): string | undefined {
  return undefined;
}
