import React from "react";

/**
 * Legacy compatibility boundary.
 *
 * Subscription state must never gate application entry, navigation, onboarding,
 * profile setup, or read-only data. Paid service is enforced at the individual
 * write/action boundary instead. Keeping this pass-through temporarily avoids
 * breaking stale imports while making a global lockout impossible.
 */
export default function ServiceAccessGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
