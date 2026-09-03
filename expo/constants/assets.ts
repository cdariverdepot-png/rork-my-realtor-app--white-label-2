/**
 * Bundled fallback shown wherever a person's photo is expected but missing —
 * a lit silhouette rather than a bare initial, so an unfinished profile still
 * reads as a portrait frame instead of an empty box.
 */
export const avatarPlaceholder = require("../assets/images/avatar-placeholder.png") as number;

export const assets = {
  portrait:
    "https://r2-pub.rork.com/generated-images/51a12edd-3cf6-46b9-a095-d950ad2eaeac.png",
  signature:
    "https://r2-pub.rork.com/generated-images/1fae598c-98ba-4cc1-b05e-525421fd724e.png",
} as const;
