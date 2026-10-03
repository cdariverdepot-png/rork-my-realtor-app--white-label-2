import { supabase, ensureSupabaseSession } from "./supabase";

/**
 * Uploads a base64-encoded JPEG to the public `app-images` Supabase Storage
 * bucket and returns its public URL. If the bucket does not exist or upload
 * fails, returns null so callers can fall back to inline base64.
 *
 * Bucket setup (run once in Supabase Dashboard → Storage → New Bucket):
 *   name: app-images
 *   public: true
 *
 * Then in SQL editor (RLS for anon uploads):
 *   create policy "public read" on storage.objects for select using (bucket_id = 'app-images');
 *   create policy "anon upload" on storage.objects for insert with check (bucket_id = 'app-images');
 */

const BUCKET = "app-images";

let bucketMissing = false;

function isBucketMissingError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { message?: string; statusCode?: string | number };
  const msg = (err.message ?? "").toLowerCase();
  if (msg.includes("bucket not found")) return true;
  if (msg.includes("the resource was not found")) return true;
  if (String(err.statusCode ?? "") === "404") return true;
  return false;
}

/** Decode a base64 string into a Uint8Array suitable for Supabase upload. */
function base64ToBytes(b64: string): Uint8Array {
  const buffer = (globalThis as { Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } } }).Buffer;
  const binary = typeof atob === "function"
    ? atob(b64)
    : buffer
      ? buffer.from(b64, "base64").toString("binary")
      : "";
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Uploads a JPEG base64 string to Storage and returns the public URL.
 * Returns null if upload fails — caller should fall back to inline data URL.
 */
export async function uploadJpegToStorage(base64: string): Promise<string | null> {
  if (!supabase || bucketMissing) return null;
  try {
    const bytes = base64ToBytes(base64);
    if (bytes.byteLength === 0) return null;
    const name = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}.jpg`;
    const session = await ensureSupabaseSession();
    if (!session) return null;
    const path = `${session.user.id}/${name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "31536000",
    });
    if (error) {
      if (isBucketMissingError(error)) {
        bucketMissing = true;
        console.log(
          "[imageUpload] bucket 'app-images' missing — create it (public) in Supabase Dashboard. Falling back to inline base64."
        );
      } else {
        console.log("[imageUpload] upload error", error.message);
      }
      return null;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) return null;
    console.log("[imageUpload] uploaded", path, "→", data.publicUrl);
    return data.publicUrl;
  } catch (e) {
    if (isBucketMissingError(e)) bucketMissing = true;
    console.log("[imageUpload] exception", e);
    return null;
  }
}

export function isStorageAvailable(): boolean {
  return !!supabase && !bucketMissing;
}
