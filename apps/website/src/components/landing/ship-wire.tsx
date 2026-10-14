import { cn } from "@fleetfizz/ui/lib/utils";
import { motion, type Transition } from "motion/react";
import { useRef } from "react";
import { TERMINAL } from "./ledger";
import { Device, DEVICES, useDeviceIcons, usePlayOnLand } from "./ship-devices";
import { APPLY, DONE, IDLE, SHIP, useShipLoop } from "./ship-loop";

// The devices on a wire. The others have drifted off it; the Ship runs a
// charge down the wire from the Starting Machine, and each device drops
// back onto it, lights up, and plays as the charge reaches it.

const ICON = 36;
// Each device's place across the wire, in percent, and how far off it it
// has drifted (mostly up: the labels are below).
const X = [12.5, 37.5, 62.5, 87.5] as const;
const DRIFT = [0, -14, 10, -18] as const;
// Seconds the charge takes to run the wire, and so when it reaches device i.
const SWEEP = 1.6;
const land = (i: number) => (SWEEP * i) / (X.length - 1);

const DURATIONS = { [IDLE]: 1500, [SHIP]: 900, [APPLY]: 2400, [DONE]: 3500 };

export function ShipWire({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useShipLoop(ref, DURATIONS);
  const applied = phase >= APPLY;
  const icons = useDeviceIcons();
  usePlayOnLand(phase, icons, land);
  const settle = (i: number): Transition =>
    applied ? { delay: land(i), type: "spring", stiffness: 260, damping: 18 } : { duration: 0.6 };
  return (
    <div ref={ref} className={cn(TERMINAL, className)}>
      <p>
        <span className="text-fizz">$</span> {phase === IDLE ? "" : "fizz ship"}
      </p>
      <div className="relative mt-8 mb-2">
        {/* The wire, and the charge running down it. */}
        <div
          className="absolute h-px bg-white/10"
          style={{ top: ICON / 2, left: `${X[0]}%`, right: `${100 - X[3]}%` }}
        />
        <motion.div
          className="absolute h-px bg-fizz shadow-[0_0_8px_var(--color-fizz)]"
          style={{ top: ICON / 2, left: `${X[0]}%` }}
          animate={{ width: applied ? `${X[3] - X[0]}%` : "0%" }}
          transition={phase === APPLY ? { duration: SWEEP, ease: "linear" } : { duration: 0 }}
        />
        {/* The Check: a ring out from the Starting Machine. */}
        <motion.div
          className="absolute size-10 rounded-full border border-fizz"
          style={{ top: ICON / 2, left: `${X[0]}%`, x: "-50%", y: "-50%" }}
          animate={phase === SHIP ? { scale: [1, 5], opacity: [0.7, 0] } : { scale: 1, opacity: 0 }}
          transition={phase === SHIP ? { duration: 0.9, ease: "easeOut" } : { duration: 0 }}
        />
        <div className="relative grid grid-cols-4">
          {DEVICES.map((device, i) => {
            const lit = i === 0 || applied;
            return (
              <motion.div
                key={device.name}
                animate={{ y: lit ? 0 : (DRIFT[i] ?? 0) }}
                transition={settle(i)}
              >
                <Device
                  device={device}
                  lit={lit}
                  delay={applied ? land(i) : 0}
                  icon={icons[i] ?? null}
                  size={ICON}
                  className="[&>div:first-child]:bg-[#0B0F05] [&>div:first-child]:px-1"
                />
              </motion.div>
            );
          })}
        </div>
      </div>
      <p className="mt-4 min-h-[1.625em]">
        {phase === DONE && (
          <>
            <span className="font-bold text-fizz">3 updated</span>
            <span className="text-white/40">{"  in 5m 12s"}</span>
          </>
        )}
      </p>
    </div>
  );
}
