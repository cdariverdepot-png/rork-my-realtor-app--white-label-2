const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = getDefaultConfig(__dirname);

// Website preview code shares the importer design model from the repo-level
// Supabase function. Expo's project root is /expo, so Metro must explicitly
// watch the repository root to resolve that shared module during web export.
config.watchFolders = [path.resolve(__dirname, "..")];

module.exports = withRorkMetro(config);
