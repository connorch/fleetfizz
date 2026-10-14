import { motion, type Transition } from "motion/react";
import { useRef } from "react";
import { Device, DEVICES, useDeviceIcons, usePlayOnLand } from "./ship-devices";
import { APPLY, DONE, FLEET, IDLE, SHIP, useShipLoop } from "./ship-loop";

// The Fleet on a rail across the whole page, no box. The others have drifted
// off the rail; the Ship sends a beam down it from the Starting Machine, and
// each device settles onto the rail and lights as the beam passes.

const ICON = 48;
// Each device's place across the rail, in percent, and how far off it it
// has drifted (mostly up: the labels are below).
const X = [14, 38, 62, 86] as const;
const DRIFT = [0, -22, 14, -28] as const;
// Seconds the beam takes to cross the rail, and so when it passes device i.
const SWEEP = 2;
const land = (i: number) => (SWEEP * ((X[i] ?? X[0]) - X[0])) / (100 - X[0]);

const DURATIONS = { [IDLE]: 1500, [SHIP]: 900, [APPLY]: 2600, [DONE]: 3500 };

export function ShipRail() {
  const ref = useRef<HTMLElement>(null);
  const phase = useShipLoop(ref, DURATIONS);
  const applied = phase >= APPLY;
  const icons = useDeviceIcons();
  usePlayOnLand(phase, icons, land);
  const settle = (i: number): Transition =>
    applied ? { delay: land(i), type: "spring", stiffness: 200, damping: 18 } : { duration: 0.6 };
  return (
    <section ref={ref} className="relative overflow-hidden py-16 font-mono">
      <div className="mx-auto w-full max-w-6xl px-6">
        <p className="text-xl">
          <span className="text-fizz-foreground dark:text-fizz">$</span>{" "}
          {phase === IDLE ? <span className="text-foreground/30">▍</span> : "fizz ship"}
        </p>
        <p className="min-h-[1.5em] text-sm text-foreground/60">
          {phase !== IDLE && `${FLEET.length} machines from ${FLEET[0]}`}
        </p>
      </div>
      <div className="relative mt-12 h-36">
        {/* The rail at the icons' center line. */}
        <div className="absolute inset-x-0 bg-foreground/10" style={{ top: ICON / 2, height: 1 }} />
        {/* The beam, down the rail from the Starting Machine. */}
        <motion.div
          className="absolute inset-y-0 w-px bg-fizz shadow-[0_0_48px_12px_var(--color-fizz)]"
          animate={{
            left: phase === APPLY ? ["14%", "100%"] : "14%",
            opacity: phase === APPLY ? [0, 1, 1, 0] : 0,
          }}
          transition={
            phase === APPLY
              ? {
                  duration: SWEEP,
                  ease: "linear",
                  opacity: { duration: SWEEP, times: [0, 0.05, 0.95, 1] },
                }
              : { duration: 0 }
          }
        />
        {/* The Check: a ring out from the Starting Machine. */}
        <motion.div
          className="absolute size-12 rounded-full border border-fizz-foreground dark:border-fizz"
          style={{ top: ICON / 2, left: `${X[0]}%`, x: "-50%", y: "-50%" }}
          animate={phase === SHIP ? { scale: [1, 6], opacity: [0.7, 0] } : { scale: 1, opacity: 0 }}
          transition={phase === SHIP ? { duration: 0.9, ease: "easeOut" } : { duration: 0 }}
        />
        {DEVICES.map((device, i) => {
          const lit = i === 0 || applied;
          return (
            <motion.div
              key={device.name}
              className="absolute"
              style={{ left: `${X[i]}%`, x: "-50%" }}
              animate={{ y: lit ? 0 : (DRIFT[i] ?? 0) }}
              transition={settle(i)}
            >
              <Device
                device={device}
                lit={lit}
                delay={applied ? land(i) : 0}
                icon={icons[i] ?? null}
                size={ICON}
                onPage
                className="[&>div:first-child]:bg-background [&>div:first-child]:px-1"
              />
            </motion.div>
          );
        })}
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 text-right">
        <p className="min-h-[1.5em] text-sm">
          {phase === DONE && (
            <>
              <span className="font-bold text-fizz-foreground dark:text-fizz">3 updated</span>
              <span className="text-foreground/50">{"  in 5m 12s"}</span>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
