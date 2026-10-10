// `fleetfizz ship`: one Ship. Load the config, read the Fleet, Gather every
// reachable Machine, Plan, ask Questions, Apply, and print the ledger.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { findConfig, loadConfig, repoName, type FleetConfig } from "@fleetfizz/config";
import {
  assembleState,
  NODE_PACKAGE,
  plan,
  VP_PACKAGE,
  type Fact,
  type MachinePlan,
  type Rebuild,
} from "@fleetfizz/core";
import {
  gatherScript,
  parseLine,
  readTailnet,
  resolveVersions,
  runScript,
  SSH_UNREACHABLE,
  type Machine,
  type Tailnet,
} from "@fleetfizz/remote";

import { makeLedger, type Ledger } from "./ledger.ts";
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
  const cloneRoot = config.machines?.[machine.name]?.clones ?? "~/.local/share/fleetfizz/clones";
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
  if (facts.length === 0) {
    yield* ledger.fail(machine.name, ["gather returned no state", ...output]);
    return { kind: "failed" as const };
  }
  return { kind: "gathered" as const, state: assembleState(facts) };
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

  const plans: MachinePlan[] = gathered.map(({ machine, state }) =>
    plan({
      config,
      machine: { name: machine.name, platform: machine.platform },
      state,
      versions,
      rebuild: rebuildOf(flags),
      answers: {},
    }),
  );

  for (const p of plans) {
    yield* ledger.line(p.machine.name, "PLAN", summarize(p));
    for (const s of p.skipped) yield* ledger.line(p.machine.name, "SKIP", `${s.what}: ${s.reason}`);
    for (const f of p.failures)
      yield* ledger.line(p.machine.name, "FAIL", `${f.what}: ${f.reason}`);
    for (const q of p.questions) {
      yield* ledger.line(p.machine.name, "ASK", `${q.package} ${q.installed} is above ${q.range}`);
    }
    yield* record(p.machine.name, p.failures.length > 0 ? "failed" : "ok");
  }

  if (!flags.dryRun) {
    yield* Console.error("apply is not implemented yet; run with --dry-run");
    process.exitCode = 1;
    return;
  }

  const tally = Object.values(yield* Ref.get(outcomes));
  const n = (kind: Outcome) => tally.filter((o) => o === kind).length;
  yield* ledger.line(
    "fleet",
    "DONE",
    `planned ${n("ok")}  skipped ${n("skipped")}  failed ${n("failed")}`,
  );
  if (n("failed") > 0) process.exitCode = 1;
});
