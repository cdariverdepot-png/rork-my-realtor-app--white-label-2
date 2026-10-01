import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

/** Local, unpublished setup progress. Saving a draft never unlocks sharing. */
export function useSetupDraft<T>(key: string, value: T, restore: (saved: T) => void, enabled = true) {
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const current = useRef(value);
  current.current = value;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const cleared = useRef(false);
  const ready = enabled && loadedKey === key;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    cleared.current = false;
    void AsyncStorage.getItem(key).then(raw => {
      if (alive && raw) restoreRef.current(JSON.parse(raw));
    }).catch(() => { if (alive) setError("Saved progress couldn't be loaded on this device."); })
      .finally(() => { if (alive) setLoadedKey(key); });
    return () => { alive = false; };
  }, [key, enabled]);
  const flush = useCallback(async () => {
    if (cleared.current) return;
    const serialized = JSON.stringify(current.current);
    const write = queue.current.catch(() => {}).then(() => AsyncStorage.setItem(key, serialized));
    queue.current = write;
    await write;
  }, [key]);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (ready && !cleared.current) void flush().then(() => setError(""))
      .catch(() => setError("Progress couldn't be saved on this device. Keep this page open and retry."));
  }, [ready, serialized, flush]);
  const clear = useCallback(async () => {
    cleared.current = true;
    await queue.current.catch(() => {});
    await AsyncStorage.removeItem(key);
  }, [key]);
  return { ready, error, flush, clear };
}
