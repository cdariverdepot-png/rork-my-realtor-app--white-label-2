/**
 * Importer Edge Function names. A build may set EXPO_PUBLIC_FUNCTION_SUFFIX (e.g. "-staging") to
 * exercise staging copies of the importer before a change is promoted. When it is unset, development
 * previews (Rork / Expo dev builds, where __DEV__ is true) use the staging copies, so testing the latest
 * code never runs against, or changes, the importer that App Store users have. Release builds call the
 * production functions. EXPO_PUBLIC_FUNCTION_SUFFIX="none" forces production functions in a preview.
 */
const configured = process.env.EXPO_PUBLIC_FUNCTION_SUFFIX;
const development = typeof __DEV__ !== "undefined" && __DEV__;
const suffix = configured === "none" ? "" : /^-[a-z0-9-]{1,30}$/.test(configured ?? "") ? configured! : configured === undefined && development ? "-staging" : "";

export const BUILD_FUNCTION = `analyze-realtor-build${suffix}`;
export const LISTING_FUNCTION = `refresh-listings${suffix}`;
