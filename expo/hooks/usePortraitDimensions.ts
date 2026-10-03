import { useEffect, useState } from "react";
import { Asset } from "expo-asset";
import { Image } from "react-native";
import { safeUri } from "@/lib/safeImageSource";
type Dimensions = { width: number; height: number };
const cache = new Map<string, Dimensions>();
const pending = new Map<string, Promise<Dimensions | undefined>>();
export function usePortraitDimensions(uri?: string | null, source?: number) {
  const safe = safeUri(uri), key = source !== undefined ? "asset:" + (safeUri(source) || source) : safe;
  const [loaded, setLoaded] = useState<{ key: string; size?: Dimensions }>();
  useEffect(() => {
    let live = true;
    if (!key || cache.has(key)) return;
    if (!pending.has(key)) {
      const asset = source !== undefined ? Asset.fromModule(source) : undefined;
      const request = asset?.width && asset?.height ? Promise.resolve({ width: asset.width, height: asset.height }) :
        new Promise<Dimensions | undefined>(resolve => Image.getSize(asset?.uri ?? safe, (width, height) => resolve({ width, height }), () => resolve(undefined)));
      pending.set(key, request.then(size => {
        if (size && size.width > 0 && size.height > 0) { cache.set(key, size); return size; }
        return undefined;
      }));
    }
    pending.get(key)!.then(size => { if (live) setLoaded({ key, size }); });
    return () => { live = false; };
  }, [key, source, safe]);
  const size = cache.get(key) ?? (loaded?.key === key ? loaded.size : undefined);
  return { ratio: size ? size.width / size.height : 1, known: !!size, hasPhoto: !!key };
}
