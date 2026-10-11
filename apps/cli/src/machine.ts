// Running one generated script on one Machine and folding its marker lines
// into ledger lines. Gather and Apply differ only in what they fold.
import * as Effect from "effect/Effect";

import { assembleState, type Fact, type MachinePlan, type MachineState } from "@fleetfizz/core";
import {
  CONFIG_STEP,
  END_STEP,
  parseLine,
  runScript,
  SSH_UNREACHABLE,
  stepId,
  vpStepId,
  type Line,
  type Target,
} from "@fleetfizz/remote";

import type { Ledger } from "./ledger.ts";

export type Outcome = "ok" | "skipped" | "failed";

type Run =
  | { readonly kind: "ran"; readonly exitCode: number }
  | { readonly kind: "skipped" | "failed" };

// Runs `script` on `target`, handing every parsed line to `onLine`. An
// unreachable Machine is a SKIP and a script that could not start is a FAIL;
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
    yield* ledger.line(
      target.name,
      "SKIP",
      `ssh: ${first?.replace(/^tailscale: /, "") ?? "connection failed"}`,
    );
    return { kind: "skipped" } as const;
  }
  return run;
});

export type GatherResult =
  | { readonly kind: "gathered"; readonly state: MachineState }
  | { readonly kind: "skipped" | "failed" };

// Gather reads a few files and runs vp; anything longer means something on
// that Machine is blocking (seen: macOS holding a `git` on an external SSD
// until tailscaled's privacy prompt is answered). The Ship must not hang.
const GATHER_TIMEOUT = "2 minutes";

// Gather on one Machine: the script's Facts become its MachineState.
export const gather = Effect.fn("gather")(function* (
  target: Target,
  script: string,
  ledger: Ledger,
) {
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
      duration: GATHER_TIMEOUT,
      orElse: () =>
        ledger
          .fail(target.name, [
            `gather took more than ${GATHER_TIMEOUT}; something on that Machine is blocking`,
            ...output,
          ])
          .pipe(Effect.as({ kind: "failed" } as const)),
    }),
  );
  if (run.kind !== "ran") return { kind: run.kind } as GatherResult;
  const state = assembleState(facts);
  if (!state.complete) {
    yield* ledger.fail(target.name, ["gather did not finish", ...output]);
    return { kind: "failed" } as GatherResult;
  }
  return { kind: "gathered", state } as GatherResult;
});

// What each step's RUN line says. A fetch has no line of its own.
const runLabels = (p: MachinePlan): Readonly<Record<string, string>> =>
  Object.fromEntries([
    [CONFIG_STEP, "config"],
    ...p.vp.map((step) => {
      switch (step.kind) {
        case "bootstrap":
          return [vpStepId(step), "install vp"];
        case "vp":
          return [vpStepId(step), `vp upgrade ${step.version}`];
        case "node":
          return [vpStepId(step), `node default ${step.version}`];
        case "reinstall":
          return [vpStepId(step), `${step.name} reinstall`];
        case "globals":
          return [
            vpStepId(step),
            `install ${step.packages.map((g) => `${g.name}@${g.version}`).join(" ")}`,
          ];
      }
    }),
    ...p.repos.map((r) => [stepId(r.name, "install"), `${r.name} install`]),
  ]);

export interface Applied {
  readonly outcome: Outcome;
  // Step ids whose ff-done said ok, whatever happened after them.
  readonly done: ReadonlyArray<string>;
}

// Apply on one Machine. A step counts as done only when its ff-done says so,
// and its output is shown only when it fails. The Machine's outcome is ok
// only when every step passed, the script reached its end, and the plan
// itself had no failures (those were reported with the plan).
export const apply = Effect.fn("apply")(function* (
  target: Target,
  p: MachinePlan,
  script: string,
  secrets: ReadonlyArray<string>,
  ledger: Ledger,
) {
  const labels = runLabels(p);
  let current: { id: string; output: string[] } | undefined;
  const done: string[] = [];
  const failed: string[] = [];
  const head: string[] = [];
  const run = yield* runOn(
    target,
    script,
    secrets,
    (line) =>
      Effect.gen(function* () {
        switch (line.kind) {
          case "step": {
            current = { id: line.id, output: [] };
            const label = labels[line.id];
            if (label !== undefined) yield* ledger.line(target.name, "RUN", label);
            break;
          }
          case "done": {
            const output = current?.id === line.done.id ? current.output : [];
            current = undefined;
            if (line.done.ok) done.push(line.done.id);
            else {
              failed.push(line.done.id);
              const code = line.done.code === undefined ? "" : ` (exit ${line.done.code})`;
              yield* ledger.fail(target.name, [`${line.done.id} failed${code}`, ...output]);
            }
            break;
          }
          case "text":
            if (line.text.trim() !== "") (current?.output ?? head).push(line.text.trimEnd());
            break;
          case "state":
            break;
        }
      }),
    ledger,
  );
  const applied = (outcome: Outcome): Applied => ({ outcome, done });
  if (run.kind !== "ran") return applied(run.kind);
  if (current !== undefined) {
    yield* ledger.fail(target.name, [`${current.id} did not finish`, ...current.output]);
    return applied("failed");
  }
  if (!done.includes(END_STEP)) {
    yield* ledger.fail(target.name, ["apply did not finish", ...head]);
    return applied("failed");
  }
  if (failed.length > 0 || p.failures.length > 0) return applied("failed");
  const installed = p.repos.filter((r) => done.includes(stepId(r.name, "install")));
  const upToDate = p.repos.length - installed.length;
  const parts = [
    ...(p.vp.length > 0 ? ["vp"] : []),
    ...installed.map((r) => `${r.name} installed`),
    ...(upToDate > 0 ? [`${upToDate} repo${upToDate === 1 ? "" : "s"} up to date`] : []),
  ];
  yield* ledger.line(target.name, "OK", parts.length === 0 ? "up to date" : parts.join(" · "));
  return applied("ok");
});
