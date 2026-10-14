import { cn } from "@fleetfizz/ui/lib/utils";
import { motion, type Transition } from "motion/react";
import { useRef } from "react";
import { TERMINAL } from "./ledger";
import { Device, DEVICES, useDeviceIcons, usePlayOnLand } from "./ship-devices";
import { APPLY, DONE, IDLE, SHIP, useShipLoop } from "./ship-loop";

// The tailnet as a map: the devices scattered, each wired to the Starting
// Machine. The Ship lights each wire in turn and the device at its end, and
// once every Step has landed the Fleet glides into a line.

const W = 640;
const H = 240;
const ICON = 36;
// Where each device sits on the map, and where it ends up in line.
const SCATTER = [
  [90, 120],
  [300, 52],
  [430, 182],
  [560, 84],
] as const;
const ROW = [
  [90, 120],
  [250, 120],
  [410, 120],
  [570, 120],
] as const;
// Seconds into APPLY that the wire to device i lights, how long that takes,
// and so when the Step lands.
const WIRE = 0.5;
const leave = (i: number) => 0.3 * (i - 1);
const land = (i: number) => leave(i) + WIRE;

const DURATIONS = { [IDLE]: 1500, [SHIP]: 900, [APPLY]: 2300, [DONE]: 4000 };

const pct = ([x, y]: readonly [number, number]) => ({
  left: `${(x / W) * 100}%`,
  top: `${(y / H) * 100}%`,
});

export function ShipMap({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useShipLoop(ref, DURATIONS);
  const applied = phase >= APPLY;
  const icons = useDeviceIcons();
  usePlayOnLand(phase, icons, land);
  const at = (i: number) => (phase === DONE ? ROW[i] : SCATTER[i]) ?? SCATTER[0];
  const glide: Transition =
    phase === DONE ? { type: "spring", stiffness: 90, damping: 18 } : { duration: 0.6 };
  const origin = at(0);
  return (
    <div ref={ref} className={cn(TERMINAL, className)}>
      <p>
        <span className="text-fizz">$</span> {phase === IDLE ? "" : "fizz ship"}
      </p>
      <div className="relative mt-4" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden>
          {DEVICES.map((device, i) => {
            if (i === 0) return null;
            const [x, y] = at(i);
            const line = { x1: origin[0], y1: origin[1], x2: x, y2: y };
            return (
              <g key={device.name}>
                <motion.line className="stroke-white/10" animate={line} transition={glide} />
                <motion.line
                  className="stroke-fizz"
                  animate={{ ...line, pathLength: applied ? 1 : 0, opacity: applied ? 1 : 0 }}
                  transition={{
                    ...glide,
                    pathLength:
                      phase === APPLY
                        ? { delay: leave(i), duration: WIRE, ease: "easeInOut" }
                        : { duration: 0 },
                    opacity: { duration: 0 },
                  }}
                />
              </g>
            );
          })}
          {/* The Check: a ring out from the Starting Machine. */}
          <motion.circle
            cx={origin[0]}
            cy={origin[1]}
            fill="none"
            className="stroke-fizz"
            animate={phase === SHIP ? { r: [20, 110], opacity: [0.8, 0] } : { r: 20, opacity: 0 }}
            transition={phase === SHIP ? { duration: 0.9, ease: "easeOut" } : { duration: 0 }}
          />
        </svg>
        {DEVICES.map((device, i) => {
          const lit = i === 0 || applied;
          return (
            <motion.div
              key={device.name}
              className="absolute"
              style={{ x: "-50%", y: -ICON / 2 }}
              animate={pct(at(i))}
              transition={glide}
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
      <p className="mt-2 min-h-[1.625em]">
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
