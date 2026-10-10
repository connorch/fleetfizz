// The event ledger a Ship prints: one line per event, append-only.
//
//    2.0s  connors-macbook-pro  PLAN  vp 1.0.0-rc.0 -> 1.1.0 · vercel 58.0.0 -> 59.25.4
//  312s  connors-macbook-pro  OK    vp · connorch-t3code installed 9e02bb1
//
// Only the tag and the time are styled, and styling is dropped when stdout
// is not a terminal or NO_COLOR is set, so a saved log stays grep-able.
import * as Clock from "effect/Clock";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

export type Tag = "INFO" | "PLAN" | "RUN" | "ASK" | "SKIP" | "OK" | "FAIL" | "DONE";

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
};

const TAG_STYLE: Record<Tag, string> = {
  INFO: ANSI.bold,
  PLAN: ANSI.dim,
  RUN: ANSI.blue,
  ASK: ANSI.magenta,
  SKIP: ANSI.yellow,
  OK: ANSI.green,
  FAIL: ANSI.red + ANSI.bold,
  DONE: ANSI.bold,
};

export interface Ledger {
  readonly line: (who: string, tag: Tag, message: string) => Effect.Effect<void>;
  // A FAIL line for the first line of `details`, with the rest as a block
  // under it, aligned with the message column.
  readonly fail: (who: string, details: ReadonlyArray<string>) => Effect.Effect<void>;
}

export const styled = (): boolean =>
  Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

// `width` is the widest name that will appear in the second column.
export const makeLedger = Effect.fn("makeLedger")(function* (
  width: number,
  color: boolean = styled(),
) {
  const start = yield* Clock.currentTimeMillis;
  const paint = (style: string, text: string) => (color ? `${style}${text}${ANSI.reset}` : text);
  const indent = " ".repeat(5 + 2 + width + 2 + 4 + 2);
  const line = Effect.fn("ledger.line")(function* (who: string, tag: Tag, message: string) {
    const now = yield* Clock.currentTimeMillis;
    const seconds = (now - start) / 1000;
    const elapsed = `${seconds >= 100 ? seconds.toFixed(0) : seconds.toFixed(1)}s`.padStart(5);
    yield* Console.log(
      `${paint(ANSI.dim, elapsed)}  ${who.padEnd(width)}  ${paint(TAG_STYLE[tag], tag.padEnd(4))}  ${message}`,
    );
  });
  const ledger: Ledger = {
    line,
    fail: Effect.fn("ledger.fail")(function* (who, [reason = "failed", ...rest]) {
      yield* line(who, "FAIL", reason);
      for (const text of rest) yield* Console.log(`${indent}${text}`);
    }),
  };
  return ledger;
});
