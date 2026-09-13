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
