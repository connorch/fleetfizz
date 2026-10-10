// Above-range Questions, asked on the Starting Machine's TTY and grouped by
// package. Without a TTY the answer is skip; --bump and --enforce answer
// every Question in advance (ADR 0006).
import * as Effect from "effect/Effect";
import { Prompt } from "effect/cli";

import type { Question } from "@fleetfizz/core";

import type { Ledger } from "./ledger.ts";
import type { ShipFlags } from "./ship.ts";

export type Decision =
  | { readonly kind: "bump"; readonly installed: string }
  | { readonly kind: "skip" }
  | { readonly kind: "downgrade" };

const hasTty = (): boolean => Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);

// The newest installed version among the Machines asking, which is what a bump adopts.
const newest = (group: ReadonlyArray<Question>): string =>
  [...group]
    .map((q) => q.installed)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? "";

export const askQuestions = Effect.fn("askQuestions")(function* (
  questions: ReadonlyArray<Question>,
  flags: Pick<ShipFlags, "bump" | "enforce">,
  ledger: Ledger,
) {
  const groups = new Map<string, Question[]>();
  for (const q of questions) groups.set(q.package, [...(groups.get(q.package) ?? []), q]);
  const decided: Record<string, Decision> = {};
  for (const [pkg, group] of groups) {
    const where = group.map((q) => `${q.installed} on ${q.machine}`).join(", ");
    const range = group[0]?.range ?? "";
    if (flags.bump) {
      decided[pkg] = { kind: "bump", installed: newest(group) };
    } else if (flags.enforce) {
      decided[pkg] = { kind: "downgrade" };
    } else if (!hasTty()) {
      // The plan reports each skipped package; there is no one to ask.
      decided[pkg] = { kind: "skip" };
    } else {
      yield* ledger.line("fleet", "ASK", `${pkg} ${where} is above ${range}`);
      const choice = yield* Prompt.run(
        Prompt.Select<Decision>({
          message: `${pkg}: ${where} is above ${range}`,
          choices: [
            {
              title: `bump config to ${newest(group) === "" ? "" : `^${newest(group)}`}`,
              value: { kind: "bump", installed: newest(group) },
            },
            { title: "skip on these Machines (leave as is, report SKIP)", value: { kind: "skip" } },
            { title: "downgrade into the range", value: { kind: "downgrade" } },
          ],
        }),
      );
      decided[pkg] = choice;
    }
  }
  return decided;
});
