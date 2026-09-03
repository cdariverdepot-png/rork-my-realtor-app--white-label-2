/**
 * Screen scenery — the walkthrough photography reused across the app.
 *
 * The intro carousel establishes six frames. Rather than dropping the client
 * and the realtor into flat grey forms once they're inside, every tool screen
 * inherits one of those same frames, so the app reads as one continuous world
 * instead of a landing page bolted onto a utility.
 *
 * Each screen also carries an accent hue. The palette is warm-gold by default,
 * but a single shared gold across eleven screens makes them indistinguishable
 * at a glance; the accent gives each tool a recognizable temperature while the
 * charcoal ground keeps the family together.
 */

export type BackdropKey =
  | "documents"
  | "insights"
  | "calendar"
  | "favorites"
  | "listings"
  | "notifications"
  | "portal"
  | "account"
  | "clientProfile"
  | "book"
  | "message"
  | "note"
  // Realtor-side (admin) tools. Same world, cooler accents so the working
  // surfaces read as distinct from the client-facing ones.
  | "adminClients"
  | "adminCalendar"
  | "adminDocuments"
  | "adminListings"
  | "adminInsights"
  | "adminMessages"
  | "adminNotifications"
  | "adminFeed"
  | "adminAccess"
  | "adminAppointments"
  | "adminAdd"
  | "adminBuild";

export const SCREEN_BG: Record<BackdropKey, number> = {
  documents: require("@/assets/images/onboard-bg-control.jpg"),
  insights: require("@/assets/images/onboard-bg-listings.jpg"),
  calendar: require("@/assets/images/onboard-bg-connected.jpg"),
  favorites: require("@/assets/images/onboard-bg-brand.jpg"),
  listings: require("@/assets/images/onboard-bg-listings.jpg"),
  notifications: require("@/assets/images/onboard-bg-connected.jpg"),
  portal: require("@/assets/images/onboard-bg-codes.jpg"),
  account: require("@/assets/images/onboard-bg-control.jpg"),
  clientProfile: require("@/assets/images/onboard-bg-connected.jpg"),
  book: require("@/assets/images/login-bg-door.jpg"),
  message: require("@/assets/images/onboard-bg-connected.jpg"),
  note: require("@/assets/images/onboard-bg-brand.jpg"),
  adminClients: require("@/assets/images/onboard-bg-connected.jpg"),
  adminCalendar: require("@/assets/images/onboard-bg-connected.jpg"),
  adminDocuments: require("@/assets/images/onboard-bg-control.jpg"),
  adminListings: require("@/assets/images/onboard-bg-listings.jpg"),
  adminInsights: require("@/assets/images/onboard-bg-listings.jpg"),
  adminMessages: require("@/assets/images/onboard-bg-connected.jpg"),
  adminNotifications: require("@/assets/images/onboard-bg-connected.jpg"),
  adminFeed: require("@/assets/images/onboard-bg-brand.jpg"),
  adminAccess: require("@/assets/images/onboard-bg-codes.jpg"),
  adminAppointments: require("@/assets/images/login-bg-door.jpg"),
  adminAdd: require("@/assets/images/onboard-bg-listings.jpg"),
  adminBuild: require("@/assets/images/onboard-bg-control.jpg"),
};

/** Per-screen accent. Read against the charcoal ground, not on white. */
export const SCREEN_ACCENT: Record<BackdropKey, string> = {
  documents: "#6FA8E5",
  insights: "#62D29A",
  calendar: "#F5B544",
  favorites: "#E5778F",
  listings: "#D2A343",
  notifications: "#C99BE5",
  portal: "#5FC9C2",
  account: "#D2A343",
  clientProfile: "#5FC9C2",
  book: "#E58B5A",
  message: "#6FA8E5",
  note: "#D2A343",
  adminClients: "#5FC9C2",
  adminCalendar: "#F5B544",
  adminDocuments: "#6FA8E5",
  adminListings: "#D2A343",
  adminInsights: "#62D29A",
  adminMessages: "#6FA8E5",
  adminNotifications: "#C99BE5",
  adminFeed: "#E5778F",
  adminAccess: "#5FC9C2",
  adminAppointments: "#E58B5A",
  adminAdd: "#62D29A",
  adminBuild: "#D2A343",
};

/** Translucent wash of an accent, for icon wells and active chips. */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
