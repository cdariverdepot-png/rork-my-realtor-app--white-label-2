import type { ImageSource } from "expo-image";

/**
 * Normalize anything we might hand to expo-image.
 *
 * expo-image 57 checks `source.uri.startsWith('sf:/')` without verifying uri is
 * a string. Bundled `require()` modules, nested `{ uri }` objects, or a numeric
 * asset id stuffed into `uri` make that throw and hard-crash the screen.
 *
 * Returns:
 *   - a numeric asset id (pass straight through)
 *   - `{ uri: string }` for remote / data / file URLs
 *   - null when there is nothing safe to render
 */
export function safeImageSource(
  input: unknown
): number | ImageSource | null {
  if (input == null || input === false) return null;

  // Bundled require() — Metro asset id
  if (typeof input === "number" && Number.isFinite(input)) return input;

  // Bare URL / data URI / file URI
  if (typeof input === "string") {
    const uri = input.trim();
    return uri ? { uri } : null;
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;

    // Already a numeric asset wrapped by mistake: { uri: 42 }
    if (typeof obj.uri === "number" && Number.isFinite(obj.uri)) {
      return obj.uri;
    }

    // Nested source: { uri: { uri: "https://..." } }
    if (obj.uri && typeof obj.uri === "object") {
      return safeImageSource(obj.uri);
    }

    // Webpack / Metro web sometimes yields { default: <url|number|source> }
    if ("default" in obj && obj.default != null && obj.uri == null) {
      return safeImageSource(obj.default);
    }

    if (typeof obj.uri === "string") {
      const uri = obj.uri.trim();
      if (!uri) return null;
      // Preserve blurhash / headers / width / height when present
      const next: ImageSource = { ...(obj as ImageSource), uri };
      return next;
    }

    // Resolved packager asset missing a string uri — unusable
    if (obj.__packager_asset) return null;
  }

  return null;
}

/** Coerce a portrait / photo field to a string URI, or empty if unsafe. */
export function safeUri(input: unknown): string {
  if (typeof input === "string") return input.trim();
  if (input && typeof input === "object") {
    const uri = (input as { uri?: unknown }).uri;
    if (typeof uri === "string") return uri.trim();
  }
  return "";
}
