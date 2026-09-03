/**
 * Time-of-day ambient theming.
 * Returns a luxe gradient + accent tint that shifts the hero atmosphere
 * based on the viewer's local hour. Updates every 5 min.
 */
import { useEffect, useState } from "react";

export type Ambient = {
  /** Phase label (dawn / day / dusk / night). */
  phase: "dawn" | "day" | "dusk" | "night";
  /** Hero overlay gradient (top → bottom). */
  overlay: readonly [string, string, string, string];
  /** Accent glow tint (warm cast over the portrait). */
  glow: string;
  /** Phase eyebrow shown subtly in hero. */
  caption: string;
};

const palettes: Record<Ambient["phase"], Omit<Ambient, "phase">> = {
  dawn: {
    overlay: [
      "rgba(43,30,20,0.00)",
      "rgba(43,30,20,0.00)",
      "rgba(8,26,21,0.55)",
      "rgba(8,26,21,0.96)",
    ],
    glow: "rgba(212,185,137,0.06)",
    caption: "Morning · the city is just stretching",
  },
  day: {
    overlay: [
      "rgba(8,26,21,0.00)",
      "rgba(8,26,21,0.00)",
      "rgba(8,26,21,0.50)",
      "rgba(8,26,21,0.96)",
    ],
    glow: "rgba(244,239,230,0.00)",
    caption: "Afternoon · open by appointment",
  },
  dusk: {
    overlay: [
      "rgba(89,48,34,0.00)",
      "rgba(89,48,34,0.00)",
      "rgba(8,26,21,0.60)",
      "rgba(8,26,21,0.97)",
    ],
    glow: "rgba(232,171,123,0.06)",
    caption: "Golden hour · my favorite light",
  },
  night: {
    overlay: [
      "rgba(8,16,30,0.10)",
      "rgba(8,16,30,0.10)",
      "rgba(8,26,21,0.65)",
      "rgba(4,12,9,0.97)",
    ],
    glow: "rgba(20,40,60,0.10)",
    caption: "After hours · I still answer",
  },
};

const phaseFor = (h: number): Ambient["phase"] => {
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
};

export function useAmbient(): Ambient {
  const [phase, setPhase] = useState<Ambient["phase"]>(() =>
    phaseFor(new Date().getHours())
  );
  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => {
        const next = phaseFor(new Date().getHours());
        return next === p ? p : next;
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return { phase, ...palettes[phase] };
}
