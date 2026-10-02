import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
/** Respect iOS Reduce Transparency; the same controls remain usable without glass. */
export function useReducedTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true, changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => { changed = true; if (mounted) setReduced(value); });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (mounted && !changed) setReduced(value); }).catch(() => {});
    return () => { mounted = false; listener.remove(); };
  }, []);
  return reduced;
}
