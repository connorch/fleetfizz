import { useInView, useReducedMotion } from "motion/react";
import { type RefObject, useEffect, useState } from "react";

// A Ship as the motion graphics tell it, in four beats: the Fleet drifted,
// the command on the Starting Machine, the Steps landing on each Machine,
// and the Fleet in line.
export const IDLE = 0;
export const SHIP = 1;
export const APPLY = 2;
export const DONE = 3;
export type Phase = typeof IDLE | typeof SHIP | typeof APPLY | typeof DONE;

// The Fleet. The first is the Starting Machine.
export const FLEET = [
  "connors-mac-studio",
  "connors-macbook-pro",
  "connors-mac-mini",
  "homelab",
] as const;

// Cycles the beats while the graphic is on screen, holding each for its
// duration in ms. Reduced motion holds on the Fleet in line.
export function useShipLoop(
  ref: RefObject<Element | null>,
  durations: Readonly<Record<Phase, number>>,
): Phase {
  const inView = useInView(ref, { amount: 0.4 });
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(IDLE);
  useEffect(() => {
    if (reduced || !inView) return;
    const t = setTimeout(() => setPhase((p) => ((p + 1) % 4) as Phase), durations[phase]);
    return () => clearTimeout(t);
  }, [inView, phase, reduced, durations]);
  return reduced ? DONE : phase;
}
