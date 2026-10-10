// `fleetfizz ship`: one Ship. Load the config, read the Fleet, Gather every
// reachable Machine, Plan, ask Questions, Apply, and print the ledger.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import {
  bumpConfig,
  DEFAULT_CLONE_ROOT,
  findConfig,
  loadConfig,
  repoName,
  type FleetConfig,
} from "@fleetfizz/config";
import {
  assembleState,
  NODE_PACKAGE,
  plan,
  VP_PACKAGE,
  type Answer,
  type Fact,
  type MachinePlan,
  type Question,
  type Rebuild,
} from "@fleetfizz/core";
import {
  applyScript,
  END_STEP,
  gatherScript,
  parseLine,
  readLentToken,
  readTailnet,
  resolveVersions,
  runScript,
  SSH_UNREACHABLE,
  stepId,
  vpStepId,
  type Machine,
  type Tailnet,
} from "@fleetfizz/remote";

import { makeLedger, type Ledger } from "./ledger.ts";
import { askQuestions } from "./questions.ts";
import { summarize } from "./summary.ts";

export interface ShipFlags {
  readonly dryRun: boolean;
  readonly only: ReadonlyArray<string>;
  readonly rebuild: ReadonlyArray<string>;
  readonly bump: boolean;
  readonly enforce: boolean;
  readonly config: string | undefined;
}

// A problem the person shipping must fix. Printed without a stack trace.
export class ShipError extends Error {
  override readonly name = "ShipError";
}

type Outcome = "ok" | "skipped" | "failed";

// Machine names the config refers to must exist on the tailnet, so a typo
// cannot silently target nothing.
const unknownMachines = (config: FleetConfig, tailnet: Tailnet, only: ReadonlyArray<string>) => {
  const known = new Set(tailnet.fleet.map((m) => m.name));
  const referenced = [
    ...Object.keys(config.machines ?? {}),
    ...(config.repos ?? []).flatMap((r) => r.machines ?? []),
    ...(config.vp?.machines ?? []),
    ...only,
  ];
  return [...new Set(referenced.filter((name) => !known.has(name)))];
};

const packagesToResolve = (config: FleetConfig): string[] => {
  const vp = config.vp;
  if (vp === undefined) return [];
  return [
    ...(vp.version === undefined ? [] : [VP_PACKAGE]),
    ...(vp.node === undefined ? [] : [NODE_PACKAGE]),
    ...Object.keys(vp.globals ?? {}),
  ];
};

const rebuildOf = (flags: ShipFlags): Rebuild =>
  flags.rebuild.length === 0 ? "none" : flags.rebuild.includes("all") ? "all" : flags.rebuild;

// Gather on one Machine. Returns its facts, or the reason it was skipped or failed.
const gather = Effect.fn("gather")(function* (
  machine: Machine,
  local: boolean,
  config: FleetConfig,
  ledger: Ledger,
) {
  const cloneRoot = config.machines?.[machine.name]?.clones ?? DEFAULT_CLONE_ROOT;
  const repos = (config.repos ?? []).map((r) => ({ name: repoName(r), outputs: r.outputs ?? [] }));
  const facts: Fact[] = [];
  const output: string[] = [];
  const exitCode = yield* runScript(
    { name: machine.name, local },
    gatherScript({ cloneRoot, repos }),
    [],
    (line) =>
      Effect.sync(() => {
        const parsed = parseLine(line);
        if (parsed.kind === "state") facts.push(parsed.fact);
        else if (parsed.kind === "text" && line.trim() !== "") output.push(line.trimEnd());
      }),
  ).pipe(
    Effect.catch((e) => Effect.succeed(e.message.includes("tailscale") ? SSH_UNREACHABLE : -1)),
  );
  if (exitCode === SSH_UNREACHABLE) {
    yield* ledger.line(
      machine.name,
      "SKIP",
      `ssh: ${output[0]?.replace(/^tailscale: /, "") ?? "connection failed"}`,
    );
    return { kind: "skipped" as const };
  }
  const state = assembleState(facts);
  if (!state.complete) {
    yield* ledger.fail(machine.name, ["gather did not finish", ...output]);
    return { kind: "failed" as const };
  }
  return { kind: "gathered" as const, state };
});

// Apply on one Machine: stream the script's markers into ledger lines. A step
// counts as done only when its ff-done says so; its output is shown on failure.
// What each step's RUN line says.
const runLabels = (p: MachinePlan): Readonly<Record<string, string>> =>
  Object.fromEntries([
    ...p.vp.map((step) => {
      switch (step.kind) {
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

const apply = Effect.fn("apply")(function* (
  machine: Machine,
  local: boolean,
  script: string,
  secrets: ReadonlyArray<string>,
  labels: Readonly<Record<string, string>>,
  ledger: Ledger,
) {
  let current: { id: string; output: string[] } | undefined;
  const done: string[] = [];
  const failed: string[] = [];
  const head: string[] = [];
  const exitCode = yield* runScript({ name: machine.name, local }, script, secrets, (line) =>
    Effect.gen(function* () {
      const parsed = parseLine(line);
      switch (parsed.kind) {
        case "step":
          current = { id: parsed.id, output: [] };
          if (parsed.id.endsWith(":install")) {
            yield* ledger.line(machine.name, "RUN", `${parsed.id.split(":")[1]} install`);
          } else if (parsed.id.startsWith("vp:")) {
            yield* ledger.line(
              machine.name,
              "RUN",
              parsed.id.replace(/^vp:/, "vp ").replaceAll(":", " "),
            );
          }
          break;
        case "done": {
          const output = current?.id === parsed.done.id ? current.output : [];
          current = undefined;
          if (parsed.done.ok) done.push(parsed.done.id);
          else {
            failed.push(parsed.done.id);
            const code = parsed.done.code === undefined ? "" : ` (exit ${parsed.done.code})`;
            yield* ledger.fail(machine.name, [`${parsed.done.id} failed${code}`, ...output]);
          }
          break;
        }
        case "text":
          if (line.trim() !== "") (current?.output ?? head).push(line.trimEnd());
          break;
        case "state":
          break;
      }
    }),
  ).pipe(
    Effect.catch((e) => Effect.succeed(e.message.includes("tailscale") ? SSH_UNREACHABLE : -1)),
  );
  if (exitCode === SSH_UNREACHABLE) {
    yield* ledger.line(
      machine.name,
      "SKIP",
      `ssh: ${head[0]?.replace(/^tailscale: /, "") ?? "connection failed"}`,
    );
    return "skipped" as const;
  }
  if (current !== undefined) {
    yield* ledger.fail(machine.name, [`${current.id} did not finish`, ...current.output]);
    return "failed" as const;
  }
  if (!done.includes(END_STEP)) {
    yield* ledger.fail(machine.name, ["apply did not finish", ...head]);
    return "failed" as const;
  }
  if (failed.length > 0) return "failed" as const;
  const vpDone = done.filter((id) => id.startsWith("vp:")).length;
  const installed = done.filter((id) => id.endsWith(":install")).map((id) => id.split(":")[1]);
  const repos = done.filter((id) => id.endsWith(":fetch")).length;
  const parts = [
    ...(vpDone > 0 ? ["vp"] : []),
    ...installed.map((r) => `${r} installed`),
    ...(repos > installed.length
      ? [`${repos - installed.length} repo${repos - installed.length === 1 ? "" : "s"} up to date`]
      : []),
  ];
  yield* ledger.line(machine.name, "OK", parts.length === 0 ? "up to date" : parts.join(" · "));
  return "ok" as const;
});

export const ship = Effect.fn("ship")(function* (flags: ShipFlags) {
  const path = yield* Path.Path;
  const configPath = flags.config ?? (yield* findConfig(path.resolve(".")));
  const config = yield* loadConfig(configPath);
  const tailnet = yield* readTailnet();

  const unknown = unknownMachines(config, tailnet, flags.only);
  if (unknown.length > 0) {
    return yield* Effect.fail(
      new ShipError(
        `unknown Machine: ${unknown.join(", ")} (the tailnet has: ${tailnet.fleet.map((m) => m.name).join(", ")})`,
      ),
    );
  }

  const targetsList = tailnet.fleet.filter(
    (m) => flags.only.length === 0 || flags.only.includes(m.name),
  );
  const ledger = yield* makeLedger(
    Math.max("fleet".length, ...targetsList.map((m) => m.name.length)),
  );
  const count = `${targetsList.length} machine${targetsList.length === 1 ? "" : "s"}`;
  yield* ledger.line(
    "fleet",
    "INFO",
    [flags.dryRun ? "dry run" : "", count, `local ${tailnet.self.name}`].filter(Boolean).join(", "),
  );

  const outcomes = yield* Ref.make<Record<string, Outcome>>({});
  const record = (name: string, outcome: Outcome) =>
    Ref.update(outcomes, (o) => ({ ...o, [name]: outcome }));

  // Gather, in parallel. Every Machine is gathered before any Question is asked.
  const gathered = yield* Effect.forEach(
    targetsList,
    Effect.fn("gatherOne")(function* (machine) {
      const local = machine.name === tailnet.self.name;
      if (!machine.online) {
        yield* ledger.line(machine.name, "SKIP", "offline");
        yield* record(machine.name, "skipped");
        return undefined;
      }
      if (!local && !machine.ssh) {
        yield* ledger.line(machine.name, "SKIP", "no Tailscale SSH server");
        yield* record(machine.name, "skipped");
        return undefined;
      }
      const result = yield* gather(machine, local, config, ledger);
      if (result.kind !== "gathered") {
        yield* record(machine.name, result.kind);
        return undefined;
      }
      return { machine, state: result.state };
    }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((list) => list.filter((g) => g !== undefined)));

  const versions = yield* resolveVersions(packagesToResolve(config));

  const planAll = (cfg: FleetConfig, answers: Readonly<Record<string, Answer>>): MachinePlan[] =>
    gathered.map(({ machine, state }) =>
      plan({
        config: cfg,
        machine: { name: machine.name, platform: machine.platform },
        state,
        versions,
        rebuild: rebuildOf(flags),
        answers,
      }),
    );
  let plans = planAll(config, {});

  // Questions: every Machine's, before anything changes. A bump edits the
  // config, so the plan is made again from the new Ranges.
  const questions = plans.flatMap((p) => p.questions);
  if (questions.length > 0 && !flags.dryRun) {
    const decided = yield* askQuestions(questions, flags, ledger);
    let cfg = config;
    for (const [pkg, decision] of Object.entries(decided)) {
      if (decision.kind === "bump") {
        const range = yield* bumpConfig(configPath, pkg, decision.installed);
        yield* ledger.line("fleet", "INFO", `bumped ${pkg} to ${range} in ${configPath}`);
      }
    }
    if (Object.values(decided).some((d) => d.kind === "bump")) cfg = yield* loadConfig(configPath);
    const answers = Object.fromEntries(
      Object.entries(decided).flatMap(([pkg, d]) =>
        d.kind === "bump" ? [] : [[pkg, d.kind] as const],
      ),
    );
    plans = planAll(cfg, answers);
  }

  for (const p of plans) {
    yield* ledger.line(p.machine.name, "PLAN", summarize(p));
    for (const sk of p.skipped)
      yield* ledger.line(p.machine.name, "SKIP", `${sk.what}: ${sk.reason}`);
    for (const f of p.failures)
      yield* ledger.line(p.machine.name, "FAIL", `${f.what}: ${f.reason}`);
    for (const q of p.questions) {
      yield* ledger.line(p.machine.name, "ASK", `${q.package} ${q.installed} is above ${q.range}`);
    }
    yield* record(p.machine.name, p.failures.length > 0 ? "failed" : "ok");
  }

  if (flags.dryRun) {
    const tally = Object.values(yield* Ref.get(outcomes));
    const n = (kind: Outcome) => tally.filter((o) => o === kind).length;
    yield* ledger.line(
      "fleet",
      "DONE",
      `planned ${n("ok")}  skipped ${n("skipped")}  failed ${n("failed")}`,
    );
    if (n("failed") > 0) process.exitCode = 1;
    return;
  }

  // The Lent Token, when any repo ships. Without one, private repos fail at
  // fetch and public repos still ship.
  const lent = plans.some((p) => p.repos.length > 0)
    ? yield* readLentToken()
    : { token: undefined };
  if (lent.token === undefined && lent.reason !== undefined) {
    yield* ledger.line("fleet", "INFO", `no gh token (${lent.reason}); private repos will fail`);
  }

  // Apply, in parallel. No Machine changed before this point.
  const machineNames = tailnet.fleet.map((m) => m.name);
  yield* Effect.forEach(
    gathered.map(({ machine }, i) => ({ machine, plan: plans[i] })),
    Effect.fn("applyOne")(function* ({ machine, plan: p }) {
      if (p === undefined) return;
      if (p.repos.length === 0 && p.vp.length === 0) {
        yield* ledger.line(machine.name, "OK", "up to date");
        return;
      }
      const cloneRoot = config.machines?.[machine.name]?.clones ?? DEFAULT_CLONE_ROOT;
      const script = applyScript({
        plan: p,
        cloneRoot,
        env: { machine: machine.name, platform: machine.platform, machines: machineNames },
      });
      const result = yield* apply(
        machine,
        machine.name === tailnet.self.name,
        script,
        [lent.token ?? ""],
        runLabels(p),
        ledger,
      );
      yield* record(machine.name, result);
    }),
    { concurrency: "unbounded" },
  );

  const tally = Object.values(yield* Ref.get(outcomes));
  const n = (kind: Outcome) => tally.filter((o) => o === kind).length;
  yield* ledger.line(
    "fleet",
    "DONE",
    `ok ${n("ok")}  skipped ${n("skipped")}  failed ${n("failed")}`,
  );
  if (n("failed") > 0) process.exitCode = 1;
});
