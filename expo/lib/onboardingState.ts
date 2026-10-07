import type { Brand } from "@/contexts/BrandContext";
import { requiredStatus } from "@/constants/sections";

export type RealtorSetupState = "setup-incomplete" | "base-app-created" | "credentials-available" | "client-connected";
export type ClientSetupState = "invitation-required" | "profile-incomplete" | "experience-accessible";

/** Saved facts determine access, regardless of the current route. */
export function realtorSetupState(brand: Brand, credentialsAvailable: boolean, connectedClients = 0): RealtorSetupState {
  if (!requiredStatus(brand).complete) return "setup-incomplete";
  if (!credentialsAvailable) return "base-app-created";
  return connectedClients > 0 ? "client-connected" : "credentials-available";
}

export function clientSetupState(invitationAccepted: boolean, profileCompleted: boolean, essentialsComplete: boolean): ClientSetupState {
  if (!invitationAccepted) return "invitation-required";
  return profileCompleted && essentialsComplete ? "experience-accessible" : "profile-incomplete";
}

/**
 * While setup is still incomplete, the importer, adding a listing, the portfolio,
 * and one listing's existing editor stay reachable. Any other admin page still
 * returns to the importer. The editor is not a new parent of All Listings.
 */
export function incompleteSetupRouteAllowed(path: string): boolean {
  if (path === "/admin/build" || path === "/admin/add" || path === "/admin/listings") return true;
  return /^\/admin\/edit\/[^/?#]+/.test(path);
}
