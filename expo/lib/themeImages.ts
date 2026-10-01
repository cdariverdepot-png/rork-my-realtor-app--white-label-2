import type { ThemeConfig } from "@/constants/theme";

export const imagePositionKey = (theme: ThemeConfig, layoutId?: string) =>
  `${layoutId ? layoutId + ":" : ""}${theme.accent}:${theme.displayFont}:${theme.surface}`;

type ContentPos = { left: `${number}%`; top: `${number}%` };
const positionCache = new Map<string, ContentPos>();

export function imagePosition(theme: ThemeConfig, layoutId?: string): ContentPos {
  const point = theme.imagePositions?.[imagePositionKey(theme, layoutId)]
    ?? theme.imagePositions?.[imagePositionKey(theme)]
    ?? { x: 50, y: 50 };
  const clamp = (n: number) => Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
  const x = clamp(point.x);
  const y = clamp(point.y);
  const cacheKey = `${imagePositionKey(theme, layoutId)}:${x}:${y}`;
  const hit = positionCache.get(cacheKey);
  if (hit) return hit;
  const next: ContentPos = { left: `${x}%`, top: `${y}%` };
  positionCache.set(cacheKey, next);
  return next;
}

/** Full framing for direct manipulation: focal point plus zoom (never below 1, so the frame stays filled). */
export function imageFrame(theme: ThemeConfig, layoutId?: string) {
  const point = theme.imagePositions?.[imagePositionKey(theme, layoutId)]
    ?? theme.imagePositions?.[imagePositionKey(theme)]
    ?? { x: 50, y: 50 };
  const clamp = (n: number) => Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
  const zoom = Number.isFinite(point.zoom) ? Math.min(3, Math.max(1, point.zoom as number)) : 1;
  return { x: clamp(point.x), y: clamp(point.y), zoom };
}
