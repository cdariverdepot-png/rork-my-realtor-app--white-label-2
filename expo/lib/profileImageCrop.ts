import * as ImageManipulator from "expo-image-manipulator";
import { Image as RNImage, Platform } from "react-native";

export type CropFocus = { x: number; y: number; zoom: number };

export const DEFAULT_CROP_FOCUS: CropFocus = { x: 50, y: 50, zoom: 1 };
export const MIN_CROP_ZOOM = 1;
export const MAX_CROP_ZOOM = 3;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function clampCropFocus(focus: CropFocus): CropFocus {
  return {
    x: clamp(Number.isFinite(focus.x) ? focus.x : 50, 0, 100),
    y: clamp(Number.isFinite(focus.y) ? focus.y : 50, 0, 100),
    zoom: clamp(Number.isFinite(focus.zoom) ? focus.zoom : 1, MIN_CROP_ZOOM, MAX_CROP_ZOOM),
  };
}

/**
 * Hands-off default crop when a photo is opened for adjust or after upload.
 * No face-detection dependency in this app: upper-third bias for tall portraits
 * (where faces usually sit), mild zoom for wide landscapes, gentle center for
 * near-square shots. User can always drag/pinch from here.
 */
export function proposeCropFocus(imageWidth: number, imageHeight: number): CropFocus {
  const w = Math.max(1, imageWidth);
  const h = Math.max(1, imageHeight);
  const aspect = w / h;
  if (aspect < 0.85) {
    // Tall portrait — keep the head/shoulders in frame.
    return clampCropFocus({ x: 50, y: 32, zoom: aspect < 0.6 ? 1.18 : 1.08 });
  }
  if (aspect > 1.35) {
    // Wide landscape — zoom enough that the square crop is not empty sky/floor.
    const zoom = Math.min(MAX_CROP_ZOOM, 1 + Math.min(1.2, (aspect - 1.35) * 0.4));
    return clampCropFocus({ x: 50, y: 42, zoom });
  }
  return clampCropFocus({ x: 50, y: 45, zoom: 1.05 });
}


/**
 * Square cover-crop in source-image pixels.
 * At zoom=1 the crop side equals min(width, height); higher zoom zooms in.
 * Focal x/y (0–100) pick which part of the remaining slack is visible.
 */
export function computeSquareCropRect(
  imageWidth: number,
  imageHeight: number,
  focus: CropFocus,
): { originX: number; originY: number; width: number; height: number } {
  const w = Math.max(1, Math.floor(imageWidth));
  const h = Math.max(1, Math.floor(imageHeight));
  const f = clampCropFocus(focus);
  const side = Math.max(1, Math.floor(Math.min(w, h) / f.zoom));
  const maxX = Math.max(0, w - side);
  const maxY = Math.max(0, h - side);
  const originX = Math.round((f.x / 100) * maxX);
  const originY = Math.round((f.y / 100) * maxY);
  return {
    originX: clamp(originX, 0, maxX),
    originY: clamp(originY, 0, maxY),
    width: Math.min(side, w),
    height: Math.min(side, h),
  };
}

/** Screen placement for the source image inside a square viewport of `viewSize`. */
export function cropImageLayout(
  imageWidth: number,
  imageHeight: number,
  viewSize: number,
  focus: CropFocus,
): { width: number; height: number; left: number; top: number } {
  const rect = computeSquareCropRect(imageWidth, imageHeight, focus);
  const scale = viewSize / Math.max(1, rect.width);
  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    left: -(rect.originX * scale) || 0,
    top: -(rect.originY * scale) || 0,
  };
}

export function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) resolve({ width, height });
        else reject(new Error("Could not read image size"));
      },
      (err) => reject(err ?? new Error("Could not read image size")),
    );
  });
}

/**
 * Crop + resize a local image URI to a square JPEG suitable for portraitUrl.
 * Returns a local file URI (caller should run toPortableImage for storage).
 */
export async function cropProfileImage(
  uri: string,
  focus: CropFocus = DEFAULT_CROP_FOCUS,
  outputSize: number = 800,
): Promise<string> {
  let width: number;
  let height: number;
  try {
    const size = await getImageSize(uri);
    width = size.width;
    height = size.height;
  } catch {
    // Fallback: probe via manipulator (works for some blob/file URIs on web).
    const probed = await ImageManipulator.manipulateAsync(uri, [], {
      format: ImageManipulator.SaveFormat.JPEG,
    });
    width = probed.width;
    height = probed.height;
    uri = probed.uri;
  }

  const rect = computeSquareCropRect(width, height, focus);
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: rect },
      { resize: { width: outputSize } },
    ],
    {
      compress: 0.92,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );
  if (Platform.OS === "web" && !result.uri) {
    throw new Error("Crop produced no image");
  }
  return result.uri;
}
