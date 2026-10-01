import * as Linking from "expo-linking";

/**
 * Client invite link: /portal?entry=client&invite=<access code>.
 *
 * Opens the client-facing app entry (download / login / access-code flow),
 * not the guest public /welcome booking page.
 *
 * Set EXPO_PUBLIC_APP_URL (e.g. https://app.yourdomain.com) to share a normal
 * https link that works for anyone. Without it the app's own deep link is used
 * (opens the installed app; on web, this site's address).
 */
export function clientInviteLink(accessCode: string): string {
  const code = (accessCode ?? "").trim().toUpperCase();
  const base = (process.env.EXPO_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const queryParams = { entry: "client", invite: code };
  if (base) {
    const q = new URLSearchParams(queryParams).toString();
    return `${base}/portal?${q}`;
  }
  return Linking.createURL("/portal", { queryParams });
}
