/**
 * Which deployment this copy of the function is. The staging workflow rewrites this value in its
 * copied function directory before deploying ("staging"); production deploys keep "production".
 * Staging deployments get their own AI key and hard per-request AI limits (see aiGateway.ts).
 */
export const DEPLOYMENT_CHANNEL: "production" | "staging" = "production";
