// `fleetfizz ship`: one Ship. Load the config, read the Fleet, Gather every
// reachable Machine, Plan, ask Questions, Apply, and print the ledger.
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
  NODE_PACKAGE,
  plan,
  VP_PACKAGE,
  type Answer,
  type MachinePlan,
  type MachineState,
  type Rebuild,
} from "@fleetfizz/core";
import {
  applyScript,
  gatherScript,
  readLentToken,
  readTailnet,
  resolveVersions,
  type Machine,
  type Tailnet,
} from "@fleetfizz/remote";

import { makeLedger } from "./ledger.ts";
import { apply, gather, type Outcome } from "./machine.ts";
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

// A Machine that was gathered, and (after planning) what to do on it.
interface Gathered {
  readonly machine: Machine;
  readonly local: boolean;
  readonly state: MachineState;
}
interface Planned extends Gathered {
  readonly plan: MachinePlan;
}

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
  // The DONE line: one count per outcome, and a non-zero exit when any failed.
  const finish = Effect.fn("finish")(function* (okWord: string) {
    const tally = Object.values(yield* Ref.get(outcomes));
    const n = (kind: Outcome) => tally.filter((o) => o === kind).length;
    yield* ledger.line(
      "fleet",
      "DONE",
      `${okWord} ${n("ok")}  skipped ${n("skipped")}  failed ${n("failed")}`,
    );
    if (n("failed") > 0) process.exitCode = 1;
  });

  const cloneRootOf = (machine: Machine) =>
    config.machines?.[machine.name]?.clones ?? DEFAULT_CLONE_ROOT;
  const gatherRepos = (config.repos ?? []).map((r) => ({
    name: repoName(r),
    outputs: r.outputs ?? [],
  }));

  // Gather, in parallel. Every Machine is gathered before any Question is asked.
  const gathered: Gathered[] = yield* Effect.forEach(
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
      const script = gatherScript({ cloneRoot: cloneRootOf(machine), repos: gatherRepos });
      const result = yield* gather({ name: machine.name, local }, script, ledger);
      if (result.kind !== "gathered") {
        yield* record(machine.name, result.kind);
        return undefined;
      }
      return { machine, local, state: result.state };
    }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((list) => list.filter((g) => g !== undefined)));

  const versions = yield* resolveVersions(packagesToResolve(config));

  const planAll = (cfg: FleetConfig, answers: Readonly<Record<string, Answer>>): Planned[] =>
    gathered.map((g) => ({
      ...g,
      plan: plan({
        config: cfg,
        machine: { name: g.machine.name, platform: g.machine.platform },
        state: g.state,
        versions,
        rebuild: rebuildOf(flags),
        answers,
      }),
    }));
  let planned = planAll(config, {});

  // Questions: every Machine's, before anything changes. A bump edits the
  // config, so the plan is made again from the new Ranges.
  const questions = planned.flatMap((g) => g.plan.questions);
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
    planned = planAll(cfg, answers);
  }

  for (const { machine, plan: p } of planned) {
    yield* ledger.line(machine.name, "PLAN", summarize(p));
    for (const sk of p.skipped)
      yield* ledger.line(machine.name, "SKIP", `${sk.what}: ${sk.reason}`);
    for (const f of p.failures) yield* ledger.line(machine.name, "FAIL", `${f.what}: ${f.reason}`);
    for (const q of p.questions) {
      yield* ledger.line(machine.name, "ASK", `${q.package} ${q.installed} is above ${q.range}`);
    }
    yield* record(machine.name, p.failures.length > 0 ? "failed" : "ok");
  }

  if (flags.dryRun) return yield* finish("planned");

  // The Lent Token, when any repo ships. Without one, private repos fail at
  // fetch and public repos still ship.
  const lent = planned.some((g) => g.plan.repos.length > 0)
    ? yield* readLentToken()
    : { token: undefined };
  if (lent.token === undefined && lent.reason !== undefined) {
    yield* ledger.line("fleet", "INFO", `no gh token (${lent.reason}); private repos will fail`);
  }

  // Apply, in parallel. No Machine changed before this point.
  const machineNames = tailnet.fleet.map((m) => m.name);
  yield* Effect.forEach(
    planned,
    Effect.fn("applyOne")(function* ({ machine, local, plan: p }) {
      if (p.repos.length === 0 && p.vp.length === 0) {
        if (p.failures.length === 0) yield* ledger.line(machine.name, "OK", "up to date");
        return;
      }
      const script = applyScript({
        plan: p,
        cloneRoot: cloneRootOf(machine),
        env: { machine: machine.name, platform: machine.platform, machines: machineNames },
      });
      const result = yield* apply(
        { name: machine.name, local },
        p,
        script,
        [lent.token ?? ""],
        ledger,
      );
      yield* record(machine.name, result);
    }),
    { concurrency: "unbounded" },
  );

  yield* finish("ok");
});
