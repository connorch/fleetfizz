import { cn } from "@fleetfizz/ui/lib/utils";
import { motion } from "motion/react";
import { useRef } from "react";
import { TERMINAL } from "./ledger";
import { APPLY, DONE, FLEET, IDLE, SHIP, useShipLoop } from "./ship-loop";

// Every Machine's versions in a grid, one row each, the Starting Machine
// first. A Ship sweeps the rows top to bottom and every cell that differs
// from the first row flips to match it.

const ITEMS = ["vp", "node", "wrangler", "t3code", "dotfiles"] as const;

// What each Machine has, in FLEET order, one value per item. The first row
// is what the config asks for, so a cell that differs from it has drifted.
const HAVE = [
  ["1.1.0", "24.18.1", "4.141.0", "9e02bb1", "c7d9e02"],
  ["1.0.0", "24.18.1", "4.141.0", "3f1a2b0", "c7d9e02"],
  ["1.1.0", "24.17.0", "4.141.0", "9e02bb1", "b41e9aa"],
  ["1.0.0", "24.18.1", "none", "9e02bb1", "c7d9e02"],
] as const;
const WANT = HAVE[0];

// Seconds into APPLY that row j's cell c flips, and that the row is done.
const flip = (j: number, c: number) => 0.3 * (j - 1) + 0.08 * c;
const settled = (j: number) => flip(j, ITEMS.length) + 0.2;

const DURATIONS = { [IDLE]: 1500, [SHIP]: 900, [APPLY]: 2000, [DONE]: 3500 };

export function ShipGrid({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useShipLoop(ref, DURATIONS);
  const applied = phase >= APPLY;
  return (
    <div ref={ref} className={cn(TERMINAL, className)}>
      <p>
        <span className="text-fizz">$</span> {phase === IDLE ? "" : "fizz ship"}
      </p>
      <p className="min-h-[1.625em]">
        {phase !== IDLE && `${FLEET.length} machines from ${FLEET[0]}`}
      </p>
      <div className="mt-4 grid w-fit grid-cols-[auto_repeat(5,auto)] gap-x-6 gap-y-1 whitespace-nowrap">
        <span />
        {ITEMS.map((item) => (
          <span key={item} className="text-white/40">
            {item}
          </span>
        ))}
        {HAVE.map((have, j) => (
          <div key={j} className="contents">
            <span className="font-bold text-white">
              <motion.span
                className="text-fizz"
                animate={{ opacity: j > 0 && applied ? 1 : 0 }}
                transition={{ delay: applied ? settled(j) : 0, duration: 0.2 }}
              >
                {"✓ "}
              </motion.span>
              {FLEET[j]}
            </span>
            {have.map((value, c) => {
              const drifted = value !== WANT[c];
              const flipped = drifted && applied;
              const t = { delay: flipped ? flip(j, c) : 0, duration: flipped ? 0.3 : 0.5 };
              return (
                <span key={c} className="relative block">
                  <motion.span
                    className={cn("block", drifted && "text-white/40", j === 0 && "font-bold")}
                    animate={{ opacity: flipped ? 0 : 1, y: flipped ? -8 : 0 }}
                    transition={t}
                  >
                    {value}
                  </motion.span>
                  {drifted && (
                    <motion.span
                      className="absolute inset-0 text-fizz"
                      animate={{ opacity: flipped ? 1 : 0, y: flipped ? 0 : 8 }}
                      transition={t}
                    >
                      {WANT[c]}
                    </motion.span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
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
