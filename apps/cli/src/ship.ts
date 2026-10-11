// `fleetfizz ship`: one Ship. Load the config, read the Fleet, Gather every
// reachable Machine, Plan, ask Questions, stamp and copy the config, Apply,
// and print the ledger.
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import { Prompt } from "effect/cli";

import {
  bumpConfig,
  configPath,
  DEFAULT_CLONE_ROOT,
  fleetConfigJsonSchema,
  isNewer,
  loadConfig,
  parseConfig,
  repoName,
  stampText,
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
  applyStdin,
  gatherScript,
  readLentToken,
  readTailnet,
  resolveVersions,
  type Machine,
  type Tailnet,
} from "@fleetfizz/remote";

import { makeLedger, type Ledger } from "./ledger.ts";
import { apply, gather, type Outcome } from "./machine.ts";
import { askQuestions, hasTty } from "./questions.ts";
import { summarize } from "./summary.ts";

export interface ShipFlags {
  readonly dryRun: boolean;
  readonly only: ReadonlyArray<string>;
  readonly rebuild: ReadonlyArray<string>;
  readonly bump: boolean;
  readonly enforce: boolean;
  readonly overwriteConfig: boolean;
  readonly config: string | undefined;
  // The running fleetfizz version, pinned on every Machine (ADR 0008).
  readonly version: string;
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
    ...Object.keys(config.machines),
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

// A Machine that received a config more recently than this config last
// reached it: a Ship from elsewhere missed this Machine, so copying this
// config would roll it back (ADR 0008). The comparison is per Machine
// (`shippedTo`), so a Ship that missed a Machine cannot outdate it. The
// Starting Machine's own file is the input unless --config named another, in
// which case it is checked like any other. A config that does not parse is
// reported and then overwritten; it cannot be newer.
const staleConfigs = Effect.fn("staleConfigs")(function* (
  local: FleetConfig,
  inputIsLocalFile: boolean,
  gathered: ReadonlyArray<Gathered>,
  ledger: Ledger,
) {
  const stale: string[] = [];
  for (const { machine, local: isLocal, state } of gathered) {
    if ((isLocal && inputIsLocalFile) || state.config === undefined) continue;
    const parsed = yield* Effect.result(parseConfig(machine.name, state.config));
    if (parsed._tag === "Failure") {
      yield* ledger.line(machine.name, "INFO", "its config does not parse; it will be overwritten");
      continue;
    }
    const remote = parsed.success;
    if (isNewer(remote.shippedTo?.[machine.name], local.shippedTo?.[machine.name])) {
      stale.push(
        `${machine.name} (shipped ${remote.shippedAt} from ${remote.shippedFrom ?? "unknown"})`,
      );
    }
  }
  return stale;
});

const schemaJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown, { space: 2 }));

export const ship = Effect.fn("ship")(function* (flags: ShipFlags) {
  const fs = yield* FileSystem.FileSystem;
  const path = flags.config ?? configPath(process.env);
  const config = yield* loadConfig(path);
  const tailnet = yield* readTailnet();

  const unknown = unknownMachines(config, tailnet, flags.only);
  if (unknown.length > 0) {
    return yield* Effect.fail(
      new ShipError(
        `unknown Machine: ${unknown.join(", ")} (the tailnet has: ${tailnet.fleet.map((m) => m.name).join(", ")})`,
      ),
    );
  }
  // The Fleet is what the config lists; the Starting Machine must be in it.
  const fleet = new Set(Object.keys(config.machines));
  if (!fleet.has(tailnet.self.name)) {
    return yield* Effect.fail(
      new ShipError(`this Machine (${tailnet.self.name}) is not in machines in ${path}`),
    );
  }
  const targetsList = tailnet.fleet.filter(
    (m) => fleet.has(m.name) && (flags.only.length === 0 || flags.only.includes(m.name)),
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
    config.machines[machine.name]?.clones ?? DEFAULT_CLONE_ROOT;
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

  // A newer config elsewhere stops the Ship unless the person overrides.
  const stale = yield* staleConfigs(config, flags.config === undefined, gathered, ledger);
  if (stale.length > 0) {
    const what = `newer config on ${stale.join(", ")}`;
    if (flags.dryRun) {
      yield* ledger.line("fleet", "INFO", `${what}; a Ship would ask before overwriting it`);
    } else if (flags.overwriteConfig) {
      yield* ledger.line("fleet", "INFO", `${what}; overwriting it (--overwrite-config)`);
    } else if (!hasTty()) {
      return yield* Effect.fail(
        new ShipError(`${what}; copy it here first, or pass --overwrite-config`),
      );
    } else {
      yield* ledger.line("fleet", "ASK", what);
      const overwrite = yield* Prompt.run(
        Prompt.Confirm({ message: "Overwrite it with this Machine's config?" }),
      );
      if (!overwrite) return yield* Effect.fail(new ShipError("aborted: the config here is older"));
    }
  }

  const versions = yield* resolveVersions(packagesToResolve(config));

  const planAll = (cfg: FleetConfig, answers: Readonly<Record<string, Answer>>): Planned[] =>
    gathered.map((g) => ({
      ...g,
      plan: plan({
        config: cfg,
        machine: { name: g.machine.name, platform: g.machine.platform },
        state: g.state,
        self: flags.version,
        versions,
        rebuild: rebuildOf(flags),
        answers,
      }),
    }));
  let cfg = config;
  let planned = planAll(cfg, {});

  // Questions: every Machine's, before anything changes. A bump edits the
  // config, so the plan is made again from the new Ranges.
  const questions = planned.flatMap((g) => g.plan.questions);
  if (questions.length > 0 && !flags.dryRun) {
    const decided = yield* askQuestions(questions, flags, ledger);
    for (const [pkg, decision] of Object.entries(decided)) {
      if (decision.kind === "bump") {
        const range = yield* bumpConfig(path, pkg, decision.installed);
        yield* ledger.line("fleet", "INFO", `bumped ${pkg} to ${range} in ${path}`);
      }
    }
    if (Object.values(decided).some((d) => d.kind === "bump")) cfg = yield* loadConfig(path);
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

  // Stamp the config here, then every Machine gets this exact text (ADR 0008).
  const shippedAt = DateTime.formatIso(yield* DateTime.now);
  const stamped = stampText(yield* fs.readFileString(path), {
    shippedAt,
    shippedFrom: tailnet.self.name,
    reached: planned.map((g) => g.machine.name),
  });
  yield* fs.writeFileString(path, stamped);
  const schema = `${schemaJson(fleetConfigJsonSchema())}\n`;

  // The Lent Token, when any repo ships. Without one, private repos fail at
  // fetch and public repos still ship.
  const lent = planned.some((g) => g.plan.repos.length > 0)
    ? yield* readLentToken()
    : { token: undefined };
  if (lent.token === undefined && lent.reason !== undefined) {
    yield* ledger.line("fleet", "INFO", `no gh token (${lent.reason}); private repos will fail`);
  }

  // Apply, in parallel. No Machine changed before this point. Install
  // Commands see the whole Fleet, not just this Ship's targets.
  const machineNames = [...fleet];
  const stdin = applyStdin(lent.token, stamped, schema);
  yield* Effect.forEach(
    planned,
    Effect.fn("applyOne")(function* ({ machine, local, plan: p }) {
      const script = applyScript({
        plan: p,
        cloneRoot: cloneRootOf(machine),
        env: { machine: machine.name, platform: machine.platform, machines: machineNames },
      });
      const result = yield* apply({ name: machine.name, local }, p, script, stdin, ledger);
      yield* record(machine.name, result);
    }),
    { concurrency: "unbounded" },
  );

  yield* finish("ok");
});
