// Running one generated script on one Machine and folding its marker lines
// into Ledger events. Check and Apply differ only in what they fold.
import * as Effect from "effect/Effect";

import { assembleState, type Fact, type MachinePlan, type MachineState } from "@fleetfizz/core";
import {
  END_STEP,
  parseLine,
  runScript,
  SSH_UNREACHABLE,
  type Line,
  type Target,
} from "@fleetfizz/remote";

import type { Ledger, Outcome } from "./ledger.ts";

type Run =
  | { readonly kind: "ran"; readonly exitCode: number }
  | { readonly kind: "skipped" | "failed" };

// Runs `script` on `target`, handing every parsed line to `onLine`. An
// unreachable Machine is skipped and a script that could not start fails;
// both are reported here, so callers only deal with a script that ran.
const runOn = Effect.fn("runOn")(function* (
  target: Target,
  script: string,
  secrets: ReadonlyArray<string>,
  onLine: (line: Line) => Effect.Effect<void>,
  ledger: Ledger,
) {
  // The first plain line, which is tailscale's reason when ssh fails.
  let first: string | undefined;
  const run: Run = yield* runScript(target, script, secrets, (line) => {
    const parsed = parseLine(line);
    if (parsed.kind === "text" && first === undefined && line.trim() !== "") first = line.trim();
    return onLine(parsed);
  }).pipe(
    Effect.map((exitCode) => ({ kind: "ran", exitCode }) as const),
    Effect.catch((e) =>
      ledger.fail(target.name, [e.message]).pipe(Effect.as({ kind: "failed" } as const)),
    ),
  );
  if (!target.local && run.kind === "ran" && run.exitCode === SSH_UNREACHABLE) {
    yield* ledger.skip(
      target.name,
      `ssh: ${first?.replace(/^tailscale: /, "") ?? "connection failed"}`,
    );
    return { kind: "skipped" } as const;
  }
  return run;
});

export type CheckResult =
  | { readonly kind: "checked"; readonly state: MachineState }
  | { readonly kind: "skipped" | "failed" };

// The Check reads a few files and runs vp; anything longer means something on
// that Machine is blocking (seen: macOS holding a `git` on an external SSD
// until tailscaled's privacy prompt is answered). The Ship must not hang.
const CHECK_TIMEOUT = "2 minutes";

// The Check on one Machine: the script's Facts become its MachineState.
export const check = Effect.fn("check")(function* (target: Target, script: string, ledger: Ledger) {
  const facts: Fact[] = [];
  const output: string[] = [];
  const run = yield* runOn(
    target,
    script,
    [],
    (line) =>
      Effect.sync(() => {
        if (line.kind === "state") facts.push(line.fact);
        else if (line.kind === "text" && line.text.trim() !== "") output.push(line.text.trimEnd());
      }),
    ledger,
  ).pipe(
    Effect.timeoutOrElse({
      duration: CHECK_TIMEOUT,
      orElse: () =>
        ledger
          .fail(target.name, [
            `checking took more than ${CHECK_TIMEOUT}; something on that Machine is blocking`,
            ...output,
          ])
          .pipe(Effect.as({ kind: "failed" } as const)),
    }),
  );
  if (run.kind !== "ran") return { kind: run.kind } as CheckResult;
  const state = assembleState(facts);
  if (!state.complete) {
    yield* ledger.fail(target.name, ["checking did not finish", ...output]);
    return { kind: "failed" } as CheckResult;
  }
  return { kind: "checked", state } as CheckResult;
});

export interface Applied {
  readonly outcome: Outcome;
  // Step ids whose ff-done said ok, whatever happened after them.
  readonly done: ReadonlyArray<string>;
}

// Apply on one Machine. A step counts as done only when its ff-done says so,
// and its output is kept only when it fails. The Machine's outcome is ok
// only when every step passed, the script reached its end, and the plan
// itself had no failures (those are already on the Ledger).
export const apply = Effect.fn("apply")(function* (
  target: Target,
  p: MachinePlan,
  script: string,
  secrets: ReadonlyArray<string>,
  ledger: Ledger,
) {
  let current: { id: string; output: string[] } | undefined;
  // Any step marker: the Machine has started changing.
  let started = false;
  const done: string[] = [];
  const failed: string[] = [];
  const head: string[] = [];
  yield* ledger.start(target.name);
  const run = yield* runOn(
    target,
    script,
    secrets,
    (line) =>
      Effect.gen(function* () {
        switch (line.kind) {
          case "step":
            started = true;
            current = { id: line.id, output: [] };
            yield* ledger.stepStarted(target.name, line.id);
            break;
          case "done": {
            const { id, ok, code } = line.done;
            const output = current?.id === id ? current.output : [];
            current = undefined;
            if (ok) done.push(id);
            else failed.push(id);
            if (id === END_STEP) break;
            yield* ledger.stepDone(
              target.name,
              id,
              ok ? { ok } : { ok, detail: code === undefined ? "failed" : `exit ${code}`, output },
            );
            break;
          }
          case "text":
            if (line.text.trim() !== "") (current?.output ?? head).push(line.text.trimEnd());
            break;
          case "state":
            // A fetch reports the commit it reached.
            if (line.fact.fact === "repo" && line.fact.head !== undefined) {
              yield* ledger.fetched(target.name, line.fact.name, line.fact.head);
            }
            break;
        }
      }),
    ledger,
  );
  const finish = Effect.fn("finish")(function* (outcome: Outcome) {
    yield* ledger.finish(target.name, outcome);
    return { outcome, done } satisfies Applied;
  });
  // A step cut off before its marker, by the script or by a dropped connection.
  if (current !== undefined) {
    yield* ledger.stepDone(target.name, current.id, {
      ok: false,
      detail: "did not finish",
      output: current.output,
    });
  }
  // ssh's exit 255 after a step started is a dropped connection on a Machine
  // that is partly changed: a failure, not a skip.
  if (run.kind !== "ran")
    return yield* finish(run.kind === "skipped" && started ? "failed" : run.kind);
  if (current !== undefined) return yield* finish("failed");
  if (!done.includes(END_STEP)) {
    yield* ledger.fail(target.name, ["apply did not finish", ...head]);
    return yield* finish("failed");
  }
  return yield* finish(failed.length > 0 || p.failures.length > 0 ? "failed" : "ok");
});
