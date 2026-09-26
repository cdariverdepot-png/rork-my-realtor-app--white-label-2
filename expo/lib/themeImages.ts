import type { ThemeConfig } from "@/constants/theme";
export const imagePositionKey = (theme: ThemeConfig, layoutId?: string) => `${layoutId ? layoutId + ":" : ""}${theme.accent}:${theme.displayFont}:${theme.surface}`;
export function imagePosition(theme: ThemeConfig, layoutId?: string) {
  const point = theme.imagePositions?.[imagePositionKey(theme, layoutId)] ?? theme.imagePositions?.[imagePositionKey(theme)] ?? { x: 50, y: 50 };
  const clamp = (n: number) => Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
  return { left: `${clamp(point.x)}%` as `${number}%`, top: `${clamp(point.y)}%` as `${number}%` };
}
