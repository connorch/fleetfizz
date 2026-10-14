import { cn } from "@fleetfizz/ui/lib/utils";
import { motion, type Transition } from "motion/react";
import { useRef } from "react";
import { TERMINAL } from "./ledger";
import { APPLY, DONE, FLEET, IDLE, SHIP, useShipLoop } from "./ship-loop";

// The Fleet as bubbles on a line. The others have drifted off it; a Ship
// from the Starting Machine sends a Step down the line to each, and each
// settles back onto it as the Step lands.

const W = 640;
const H = 150;
const LINE = 64;
const R = 11;
const ORIGIN = 80;
// Each Machine's place on the line, how far off it it has drifted (mostly
// up: the labels are below), and what drifted. The Starting Machine is first
// and never drifts.
const MACHINES = [
  { name: FLEET[0], x: ORIGIN, drift: 0, before: "starting machine", after: "starting machine" },
  { name: FLEET[1], x: 240, drift: -28, before: "vp 1.0.0", after: "vp 1.1.0" },
  { name: FLEET[2], x: 400, drift: 16, before: "t3code 3f1a2b0", after: "t3code 9e02bb1" },
  { name: FLEET[3], x: 560, drift: -42, before: "wrangler missing", after: "wrangler 4.141.0" },
];

// Seconds into APPLY that the Step leaves for Machine i, how long it travels,
// and so when it lands.
const leave = (i: number) => 0.25 * (i - 1);
const travel = (i: number) => 0.45 + 0.15 * (i - 1);
const land = (i: number) => leave(i) + travel(i);

const DURATIONS = { [IDLE]: 1500, [SHIP]: 900, [APPLY]: 2200, [DONE]: 3500 };

export function ShipInLine({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useShipLoop(ref, DURATIONS);
  const applied = phase >= APPLY;
  const settle = (i: number): Transition =>
    applied ? { delay: land(i), type: "spring", stiffness: 260, damping: 18 } : { duration: 0.6 };
  return (
    <div ref={ref} className={cn(TERMINAL, className)}>
      <p>
        <span className="text-fizz">$</span> {phase === IDLE ? "" : "fizz ship"}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" aria-hidden>
        <line x1={0} x2={W} y1={LINE} y2={LINE} className="stroke-white/10" />
        {/* The Check: a ring out from the Starting Machine. */}
        <motion.circle
          cx={ORIGIN}
          cy={LINE}
          fill="none"
          className="stroke-fizz"
          animate={phase === SHIP ? { r: [R, 90], opacity: [0.8, 0] } : { r: R, opacity: 0 }}
          transition={phase === SHIP ? { duration: 0.9, ease: "easeOut" } : { duration: 0 }}
        />
        {MACHINES.map(({ name, x, drift, before, after }, i) => {
          const origin = i === 0;
          const inLine = origin || applied;
          return (
            <g key={name}>
              {/* The Step, down the line from the Starting Machine. */}
              {!origin && (
                <motion.circle
                  r={4}
                  cy={LINE}
                  className="fill-fizz"
                  animate={
                    phase === APPLY
                      ? { cx: [ORIGIN, x, x], opacity: [1, 1, 0] }
                      : { cx: ORIGIN, opacity: 0 }
                  }
                  transition={
                    phase === APPLY
                      ? {
                          delay: leave(i),
                          duration: travel(i) + 0.1,
                          times: [0, 0.93, 1],
                          ease: "easeInOut",
                        }
                      : { duration: 0 }
                  }
                />
              )}
              <motion.circle
                cx={x}
                r={R}
                fill="none"
                strokeWidth={1.5}
                className={inLine ? "stroke-fizz" : "stroke-white/30"}
                animate={{ cy: inLine ? LINE : LINE + drift }}
                transition={settle(i)}
              />
              <motion.circle
                cx={x}
                r={R}
                className="fill-fizz"
                animate={{ cy: inLine ? LINE : LINE + drift, opacity: inLine ? 1 : 0 }}
                transition={settle(i)}
              />
              <text
                x={x}
                y={LINE + 40}
                textAnchor="middle"
                className="fill-white text-[11px] font-bold"
              >
                {name}
              </text>
              <motion.text
                x={x}
                y={LINE + 56}
                textAnchor="middle"
                className="fill-white/40 text-[10px]"
                animate={{ opacity: origin || !applied ? 1 : 0 }}
                transition={{ delay: applied ? land(i) : 0, duration: 0.2 }}
              >
                {before}
              </motion.text>
              {!origin && (
                <motion.text
                  x={x}
                  y={LINE + 56}
                  textAnchor="middle"
                  className="fill-fizz text-[10px]"
                  animate={{ opacity: applied ? 1 : 0 }}
                  transition={{ delay: applied ? land(i) + 0.2 : 0, duration: 0.2 }}
                >
                  {after}
                </motion.text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="min-h-[1.625em]">
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
