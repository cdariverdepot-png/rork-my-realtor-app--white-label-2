import * as Linking from "expo-linking";

/**
 * The realtor's public booking link: /welcome?ref=<realtor id>.
 *
 * Set EXPO_PUBLIC_APP_URL (e.g. https://app.yourdomain.com) to share a normal
 * https link that works for anyone. Without it the app's own deep link is used
 * (opens the installed app; on web, this site's address).
 */
export function bookingLink(realtorId: string): string {
  const base = (process.env.EXPO_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (base) return `${base}/welcome?ref=${encodeURIComponent(realtorId)}`;
  return Linking.createURL("/welcome", { queryParams: { ref: realtorId } });
}
