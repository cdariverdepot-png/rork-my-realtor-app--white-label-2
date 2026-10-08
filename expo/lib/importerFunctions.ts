/**
 * Importer Edge Function names. A build may set EXPO_PUBLIC_FUNCTION_SUFFIX (e.g. "-staging") to
 * exercise staging copies of the importer before a change is promoted; production builds leave it
 * unset and call the production functions.
 */
const suffix = /^-[a-z0-9-]{1,30}$/.test(process.env.EXPO_PUBLIC_FUNCTION_SUFFIX ?? "") ? process.env.EXPO_PUBLIC_FUNCTION_SUFFIX! : "";

export const BUILD_FUNCTION = `analyze-realtor-build${suffix}`;
export const LISTING_FUNCTION = `refresh-listings${suffix}`;
