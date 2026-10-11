// `fizz ship`: one Ship. Load the config, read the Fleet, Gather every
// reachable Machine, Plan, ask Questions, stamp and copy the config, Apply,
// and show it all on the Ledger: live in a terminal, printed once otherwise.
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

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
  CONFIG_STEP,
  gatherScript,
  readLentToken,
  readTailnet,
  resolveVersions,
  type Machine,
  type Tailnet,
} from "@fleetfizz/remote";

import { makeLedger, printRows, rows, styled, tally, type Ledger } from "./ledger.ts";
import { canRedraw, noLive, startLive } from "./live.tsx";
import { apply, gather } from "./machine.ts";
import { askQuestions } from "./questions.ts";
import { saveReport } from "./report.ts";

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
      yield* ledger.note(
        "info",
        `the config on ${machine.name} does not parse; it will be overwritten`,
      );
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
  const outsideFleet = flags.only.filter((name) => !fleet.has(name));
  if (outsideFleet.length > 0) {
    return yield* Effect.fail(
      new ShipError(`not in machines in ${path}: ${outsideFleet.join(", ")}`),
    );
  }
  // Config order, so the Ledger lists Machines the way the config does.
  const order = Object.keys(config.machines);
  const targetsList = tailnet.fleet
    .filter((m) => fleet.has(m.name) && (flags.only.length === 0 || flags.only.includes(m.name)))
    .toSorted((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const count = `${targetsList.length} machine${targetsList.length === 1 ? "" : "s"}`;
  yield* Console.log(`${flags.dryRun ? "dry run, " : ""}${count} from ${tailnet.self.name}`);
  const { ledger, store } = yield* makeLedger({
    from: tailnet.self.name,
    dryRun: flags.dryRun,
    machines: targetsList.map((m) => m.name),
  });
  const live = canRedraw() ? yield* startLive(store, styled()) : noLive;

  // Runs however the Ship ends (done, failed, or interrupted): saves the report
  // once anything may have changed, prints the Ledger where nothing drew it
  // live, and exits non-zero when any Machine failed. Added after startLive,
  // so it runs before the live view's last frame is drawn.
  let changing = false;
  const finish = Effect.fn("finish")(function* () {
    const state = yield* ledger.end;
    if (changing) {
      yield* saveReport(state).pipe(
        Effect.catch((e) =>
          Console.error(`could not save the report for fizz report: ${e.message}`),
        ),
      );
    }
    if (live === noLive) {
      // A saved log cannot be expanded later, so it gets every item.
      yield* printRows(rows(state, { full: true, now: state.ended ?? 0, live: false }));
    }
    if (tally(state).failed > 0) process.exitCode = 1;
  });
  yield* Effect.addFinalizer(() => finish());

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
        yield* ledger.skip(machine.name, "offline");
        return undefined;
      }
      if (!local && !machine.ssh) {
        yield* ledger.skip(machine.name, "no Tailscale SSH server");
        return undefined;
      }
      const script = gatherScript({ cloneRoot: cloneRootOf(machine), repos: gatherRepos });
      const result = yield* gather({ name: machine.name, local }, script, ledger);
      if (result.kind !== "gathered") return undefined;
      yield* ledger.gathered(machine.name);
      return { machine, local, state: result.state };
    }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((list) => list.filter((g) => g !== undefined)));

  // A newer config elsewhere stops the Ship unless the person overrides.
  const stale = yield* staleConfigs(config, flags.config === undefined, gathered, ledger);
  if (stale.length > 0) {
    const what = `newer config on ${stale.join(", ")}`;
    if (flags.dryRun) {
      yield* ledger.note("info", `${what}; a Ship would ask before overwriting it`);
    } else if (flags.overwriteConfig) {
      yield* ledger.note("info", `${what}; overwriting it (--overwrite-config)`);
    } else if (live.ask === undefined) {
      return yield* Effect.fail(
        new ShipError(`${what}; copy it here first, or pass --overwrite-config`),
      );
    } else {
      yield* ledger.note("ask", what);
      const overwrite = yield* live.ask([
        { title: "overwrite it with this Machine's config", value: true },
        { title: "stop", value: false },
      ]);
      yield* ledger.note("answer", overwrite ? "overwrite it" : "stop");
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
  if (questions.length > 0 && flags.dryRun) {
    for (const q of questions) {
      yield* ledger.note("ask", `${q.package} ${q.installed} on ${q.machine} is above ${q.range}`);
      yield* ledger.note("answer", "not asked (dry run)");
    }
  }
  if (questions.length > 0 && !flags.dryRun) {
    const decided = yield* askQuestions(questions, flags, ledger, live.ask);
    for (const [pkg, decision] of Object.entries(decided)) {
      if (decision.kind !== "bump") continue;
      changing = true;
      yield* bumpConfig(path, pkg, decision.installed);
    }
    if (Object.values(decided).some((d) => d.kind === "bump")) cfg = yield* loadConfig(path);
    const answers = Object.fromEntries(
      Object.entries(decided).flatMap(([pkg, d]) =>
        d.kind === "bump" ? [] : [[pkg, d.kind] as const],
      ),
    );
    planned = planAll(cfg, answers);
  }

  for (const { machine, plan: p, state } of planned) yield* ledger.plan(machine.name, p, state);

  if (flags.dryRun) return;

  // Stamp the config here, then every Machine gets this exact text (ADR 0008).
  const shippedAt = DateTime.formatIso(yield* DateTime.now);
  // The copy each Machine receives says this Ship reached it. The local file
  // is written again after Apply with only the Machines whose config step
  // completed, so a failed delivery does not claim a copy that never landed.
  // The file being stamped is the Starting Machine's own config unless
  // --config named another, so that Machine counts as reached even when
  // --only left it out of this Ship.
  changing = true;
  const original = yield* fs.readFileString(path);
  const stampWith = (reached: ReadonlyArray<string>) =>
    stampText(original, {
      shippedAt,
      shippedFrom: tailnet.self.name,
      reached: [...reached, ...(flags.config === undefined ? [tailnet.self.name] : [])],
    });
  const stamped = stampWith(planned.map((g) => g.machine.name));
  yield* fs.writeFileString(path, stamped);
  const schema = `${schemaJson(fleetConfigJsonSchema())}\n`;

  // The Lent Token, when any repo ships. Without one, private repos fail at
  // fetch and public repos still ship.
  const lent = planned.some((g) => g.plan.repos.length > 0)
    ? yield* readLentToken()
    : { token: undefined };
  if (lent.token === undefined && lent.reason !== undefined) {
    yield* ledger.note("info", `no gh token (${lent.reason}); private repos will fail`);
  }

  // Apply, in parallel. No Machine changed before this point. Install
  // Commands see the whole Fleet, not just this Ship's targets.
  const machineNames = [...fleet];
  const stdin = applyStdin(lent.token, stamped, schema);
  const delivered: string[] = yield* Effect.forEach(
    planned,
    Effect.fn("applyOne")(function* ({ machine, local, plan: p }) {
      const script = applyScript({
        plan: p,
        cloneRoot: cloneRootOf(machine),
        env: { machine: machine.name, platform: machine.platform, machines: machineNames },
      });
      const applied = yield* apply({ name: machine.name, local }, p, script, stdin, ledger);
      return applied.done.includes(CONFIG_STEP) ? machine.name : undefined;
    }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((list) => list.filter((name) => name !== undefined)));
  yield* fs.writeFileString(path, stampWith(delivered));
}, Effect.scoped);
