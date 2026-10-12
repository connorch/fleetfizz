// Above-range Questions, asked in the live Ledger on the Starting Machine and
// grouped by package. Without a terminal the answer is skip; --bump and
// --enforce answer every Question in advance (ADR 0006).
import * as Effect from "effect/Effect";

import { bumpedRange } from "@fleetfizz/config";
import type { Question } from "@fleetfizz/core";

import type { Ledger } from "./ledger.ts";
import type { Live } from "./live.tsx";
import type { ShipFlags } from "./ship.ts";

export type Decision =
  | { readonly kind: "bump"; readonly installed: string }
  | { readonly kind: "skip" }
  | { readonly kind: "downgrade" };

// The newest installed version among the Machines asking, which is what a bump adopts.
const newest = (group: ReadonlyArray<Question>): string =>
  [...group]
    .map((q) => q.installed)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? "";

export const askQuestions = Effect.fn("askQuestions")(function* (
  questions: ReadonlyArray<Question>,
  flags: Pick<ShipFlags, "bump" | "enforce">,
  ledger: Ledger,
  ask: Live["ask"],
) {
  const groups = new Map<string, Question[]>();
  for (const q of questions) groups.set(q.package, [...(groups.get(q.package) ?? []), q]);
  const decided: Record<string, Decision> = {};
  for (const [pkg, group] of groups) {
    const where = group.map((q) => `${q.installed} on ${q.machine}`).join(", ");
    const range = group[0]?.range ?? "";
    const bump = { kind: "bump", installed: newest(group) } as const;
    const bumpTitle = `bump the config to ${bumpedRange(range, newest(group))}`;
    const answer = (decision: Decision) =>
      decision.kind === "bump"
        ? bumpTitle
        : decision.kind === "skip"
          ? "skip on these Machines"
          : "downgrade into the range";
    yield* ledger.note("ask", `${pkg} ${where} is above ${range}`);
    const decision: Decision = flags.bump
      ? bump
      : flags.enforce
        ? { kind: "downgrade" }
        : ask === undefined
          ? // The plan reports each skipped package; there is no one to ask.
            { kind: "skip" }
          : yield* ask<Decision>([
              { title: bumpTitle, value: bump },
              {
                title: "skip on these Machines (leave as is, shown as skipped)",
                value: { kind: "skip" },
              },
              { title: "downgrade into the range", value: { kind: "downgrade" } },
            ]);
    yield* ledger.note("answer", answer(decision));
    decided[pkg] = decision;
  }
  return decided;
});
