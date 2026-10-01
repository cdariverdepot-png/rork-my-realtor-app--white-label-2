import React, { memo, useMemo } from "react";
import { type StyleProp } from "react-native";
import { Image, type ImageContentPosition, type ImageProps, type ImageStyle } from "expo-image";

type PortraitImageProps = {
  /** Remote / data / file URI for a real profile portrait. */
  uri?: string | null;
  /** Bundled `require()` asset (sample theme portraits). Takes precedence when set. */
  source?: number;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageProps["contentFit"];
  contentPosition?: ImageContentPosition;
  accessibilityLabel?: string;
  /** Override recycling identity; defaults to the URI or bundled source id. */
  recyclingKey?: string;
  priority?: ImageProps["priority"];
};

/**
 * Stable realtor portrait rendering.
 *
 * expo-image treats a fresh `{ uri }` object as a new source and can fade/reload
 * on parent re-renders (theme preview scroll, parallax, draft identity churn).
 * This helper keeps source identity, recyclingKey, disk cache, and transition
 * locked so the same portrait never flickers across preview / home / dash.
 */
function PortraitImage({
  uri,
  source,
  style,
  contentFit = "cover",
  contentPosition,
  accessibilityLabel,
  recyclingKey,
  priority,
}: PortraitImageProps) {
  const trimmed = uri?.trim() || "";
  const resolved = source !== undefined ? source : trimmed || null;
  const imageSource = useMemo(() => {
    if (resolved == null || resolved === "") return null;
    return typeof resolved === "number" ? resolved : { uri: resolved };
  }, [resolved]);
  const key =
    recyclingKey
    ?? (typeof resolved === "number" ? `portrait-asset:${resolved}` : resolved || undefined);

  if (!imageSource) return null;

  return (
    <Image
      source={imageSource}
      style={style}
      contentFit={contentFit}
      contentPosition={contentPosition}
      recyclingKey={key}
      cachePolicy="memory-disk"
      transition={0}
      priority={priority}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export default memo(PortraitImage);
