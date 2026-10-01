import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import { uploadJpegToStorage } from "./imageUpload";

/**
 * Convert a local file:// (or any) image URI into a portable, cross-device
 * URL.
 *
 * Strategy:
 *   1. Resize + JPEG-compress the source.
 *   2. Try to upload to Supabase Storage → return public https URL (preferred —
 *      keeps the synced JSON blob small enough to stay under Supabase's
 *      payload limits, which is what actually broke cross-device updates).
 *   3. If Storage isn't configured, fall back to an inline `data:image/jpeg;base64,...`
 *      URL so the app still works locally.
 *
 * Already-portable URLs (http(s)://, data:) are returned unchanged.
 */
export async function toPortableImage(uri: string, maxWidth: number = 1400): Promise<string> {
  if (!uri || typeof uri !== "string") return typeof uri === "string" ? uri : "";
  if (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:")) {
    return uri;
  }
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      {
        compress: 0.55,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
    if (result.base64) {
      // Prefer Storage URL — tiny, cacheable, doesn't bloat synced JSON blob.
      const remote = await uploadJpegToStorage(result.base64);
      if (remote) return remote;
      // Fallback: inline as data URL so local previews still work.
      return `data:image/jpeg;base64,${result.base64}`;
    }
    return result.uri;
  } catch (e) {
    console.log("[portableImage] manipulate error", e, "platform:", Platform.OS);
    return uri;
  }
}

export async function toPortableImages(uris: string[], maxWidth?: number): Promise<string[]> {
  return Promise.all(uris.map((u) => toPortableImage(u, maxWidth)));
}
