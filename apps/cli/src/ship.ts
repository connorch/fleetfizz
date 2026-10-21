// `fizz ship`: one Ship. Load the config, read the Fleet, Check every
// reachable Machine, Plan, ask Questions, copy the config with its Install
// Record, Apply, and show it all on the Ledger: live in a terminal, printed
// once otherwise.
// Picking a newer config found elsewhere starts the Ship over from that one.
// The Ship Log records all of it (log.ts).
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as References from "effect/References";

import {
  bumpConfig,
  type ConfigRecord,
  configPath,
  decodeConfigRecord,
  encodeConfigRecord,
  fleetConfigSchemaText,
  loadConfig,
  mergeReached,
  parseConfig,
  type ProviderName,
  type Reached,
  reachedAfter,
  readVersion,
  SCHEMA_FILE,
  shaOf,
  staleWhy,
  type FleetConfig,
} from "@fleetfizz/config";
import {
  dependenciesOf,
  machineNames,
  machinesNamed,
  orderProviders,
  parseAddress,
  planMachine,
  shellInitFor,
  targetedItems,
  type Context,
  type MachinePlan,
  type MachineState,
  type Question,
} from "@fleetfizz/core";
import { PROVIDERS } from "@fleetfizz/providers";
import {
  applyScript,
  applyStdin,
  CONFIG_STEP,
  checkScript,
  readLentToken,
  readTailnet,
  type LentToken,
  type Machine,
  type Tailnet,
} from "@fleetfizz/remote";

import { readConfigRecord, writeConfigRecord } from "./configRecord.ts";
import { showDiff } from "./diff.ts";
import { anyFailed, type LedgerState, makeLedger, type Ledger } from "./ledger.ts";
import { canRedraw, noLive, startLive } from "./live.tsx";
import { openShipLog, parseShipId, shipId } from "./log.ts";
import { apply, check } from "./machine.ts";
import { askQuestions, parseAnswers, type Asked } from "./questions.ts";
import { saveReport } from "./report.tsx";
import { colorful, hintText, ledgerText, noteText } from "./view.tsx";

export interface ShipFlags {
  readonly dryRun: boolean;
  readonly only: ReadonlyArray<string>;
  // Addresses (`provider:item`), or `all`.
  readonly rebuild: ReadonlyArray<string>;
  // `--answer` entries (parseAnswers), the shortcut flags included.
  readonly answers: ReadonlyArray<string>;
  readonly config: string | undefined;
  // The running fleetfizz version, which is the config's (ADR 0019).
  readonly version: string;
}

// A problem the person shipping must fix. Printed without a stack trace.
export class ShipError extends Error {
  override readonly name = "ShipError";
}

// A Machine that was checked, and (after planning) what to do on it.
interface Checked {
  readonly machine: Machine;
  readonly local: boolean;
  readonly state: MachineState;
}
interface Planned extends Checked {
  readonly plan: MachinePlan;
}

// Machine names the config refers to must exist on the tailnet, so a typo
// cannot silently target nothing.
const unknownMachines = (config: FleetConfig, tailnet: Tailnet, only: ReadonlyArray<string>) => {
  const known = new Set(tailnet.fleet.map((m) => m.name));
  const referenced = [
    ...config.machines,
    ...machineNames(config.shell),
    ...PROVIDERS.flatMap((p) => machinesNamed(p, config)),
    ...only,
  ];
  return [...new Set(referenced.filter((name) => !known.has(name)))];
};

// Why this Machine cannot ship `config` (named by `source`) with these flags,
// or undefined when it can. Checked for the config at hand and for every
// Stale Config before it is offered.
const unshippable = (
  config: FleetConfig,
  tailnet: Tailnet,
  only: ReadonlyArray<string>,
  source: string,
): string | undefined => {
  const unknown = unknownMachines(config, tailnet, only);
  if (unknown.length > 0) {
    return `unknown Machine: ${unknown.join(", ")} (the tailnet has: ${tailnet.fleet.map((m) => m.name).join(", ")})`;
  }
  // The Fleet is what the config lists; the Starting Machine must be in it.
  const fleet = new Set(config.machines);
  if (!fleet.has(tailnet.self.name)) {
    return `this Machine (${tailnet.self.name}) is not in machines in ${source}`;
  }
  const outsideFleet = only.filter((name) => !fleet.has(name));
  if (outsideFleet.length > 0) return `not in machines in ${source}: ${outsideFleet.join(", ")}`;
  return undefined;
};

// A Stale Config: one text of the config that this Ship must ask before
// overwriting, the Machines that hold it (one Ship from elsewhere reaches
// several), and, merged across them, when a Ship of it reached each Machine.
interface Stale {
  readonly text: string;
  readonly sha: string;
  // Undefined for a config another fleetfizz version wrote that this one
  // cannot read: the next run, at its version, does.
  readonly config: FleetConfig | undefined;
  readonly machines: ReadonlyArray<string>;
  readonly reached: Reached;
  readonly description: string;
}

const minute = (iso: string | undefined) =>
  iso?.slice(0, 16).replace("T", " ") ?? "an unknown time";

// The other copies of the config that differ from `text` and that this Ship
// must ask about (staleWhy), grouped by text. `base` is when this config last
// reached each Machine. `own` is the Machine whose file `text` is, never
// asked about: the Starting Machine, unless --config named another file. A
// copy that does not parse is reported and then overwritten, unless it names
// another fleetfizz version, whose schema may differ: that one is asked about.
const staleConfigs = Effect.fn("staleConfigs")(function* (
  text: string,
  base: Reached,
  own: string | undefined,
  checked: ReadonlyArray<Checked>,
  ledger: Ledger,
) {
  const copies: Array<{
    readonly machine: string;
    readonly text: string;
    readonly sha: string;
    readonly config: FleetConfig | undefined;
    readonly record: ConfigRecord | undefined;
    readonly why: string;
  }> = [];
  const version = readVersion(text);
  for (const { machine, state } of checked) {
    if (machine.name === own || state.config === undefined || state.config.text === text) continue;
    const parsed = yield* Effect.result(parseConfig(machine.name, state.config.text));
    const theirs = readVersion(state.config.text);
    if (parsed._tag === "Failure" && (theirs === undefined || theirs === version)) {
      yield* ledger.note(
        "info",
        `the config on ${machine.name} does not parse; it will be overwritten`,
      );
      continue;
    }
    const record = Option.getOrUndefined(decodeConfigRecord(state.configRecord));
    const why = staleWhy({ machine: machine.name, sha: state.config.sha, record }, base);
    if (why === undefined) continue;
    copies.push({
      machine: machine.name,
      text: state.config.text,
      sha: state.config.sha,
      config: parsed._tag === "Success" ? parsed.success : undefined,
      record,
      why:
        why === "unrecorded"
          ? "differs, and no Ship wrote it"
          : why === "edited"
            ? "was edited there"
            : `got a Ship from ${parseShipId(record?.ship ?? "")?.from ?? "another Machine"} at ${minute(record?.reached[machine.name])} that missed this Machine`,
    });
  }
  return [...Map.groupBy(copies, (c) => c.text)].flatMap(([text, group]): Stale[] => {
    const [first] = group;
    if (first === undefined) return [];
    const machines = group.map((c) => c.machine);
    return [
      {
        text,
        sha: first.sha,
        config: first.config,
        machines,
        reached: mergeReached(
          group.flatMap((c) => (c.record === undefined ? [] : [c.record.reached])),
        ),
        description: `the config on ${machines.join(", ")} ${first.why}`,
      },
    ];
  });
});

// One Ship, started over each time the person picks a newer config found on
// another Machine: that config decides what is checked, so the Check runs again.
// The Starting Machine names the Ship Log, so the tailnet is read before it
// opens; a failure there prints as usual and leaves no log. A log that cannot
// be opened does not stop the Ship.
export const ship = Effect.fn("ship")(function* (flags: ShipFlags) {
  const tailnet = yield* readTailnet();
  const id = shipId(yield* DateTime.now, tailnet.self.name);
  // Secrets the log must not contain, added as they are read.
  const hidden = new Set<string>();
  const logger = yield* openShipLog(id, hidden).pipe(
    Effect.catch((e) =>
      Console.error(`could not open the Ship Log: ${e.message}`).pipe(Effect.as(undefined)),
    ),
  );
  // Printed last, after the Ledger, however the Ship ends.
  if (logger !== undefined)
    yield* Effect.addFinalizer(() => Console.log(hintText(`log: fizz logs ${id}`)));
  yield* Effect.gen(function* () {
    yield* Effect.logInfo(
      `Ship ${id}: fleetfizz ${flags.version}, node ${process.version} on ${process.platform}`,
    );
    yield* Effect.logInfo(`fizz ${process.argv.slice(2).join(" ")}`);
    for (const m of tailnet.fleet)
      yield* Effect.logInfo(
        `tailnet: ${m.name} ${m.platform}${m.online ? "" : " offline"}${m.ssh ? "" : " no-ssh"}${m.name === tailnet.self.name ? " (this Machine)" : ""}`,
      );
    while ((yield* shipPass(flags, tailnet, hidden, id)) === "adopted") {}
  }).pipe(
    Effect.onExit((exit) =>
      Exit.isSuccess(exit)
        ? Effect.logInfo("the Ship ended")
        : Effect.logError("the Ship stopped", exit.cause),
    ),
    Effect.provide(Logger.layer(logger === undefined ? [] : [logger])),
    Effect.provideService(References.MinimumLogLevel, "Debug"),
  );
}, Effect.scoped);

// Where a pass's end state goes: printed as the Ledger, live while it runs
// (a Ship), or handed to `fizz status`, which shows nothing while it runs and
// draws the state itself.
export type Show = "ledger" | ((state: LedgerState) => void);

// One pass of a Ship from the config at hand. "adopted" means it stopped
// before any change because the person picked a Stale Config, now written here.
export const shipPass = Effect.fn("shipPass")(function* (
  flags: ShipFlags,
  tailnet: Tailnet,
  hidden: Set<string>,
  id: string,
  show: Show = "ledger",
) {
  const fs = yield* FileSystem.FileSystem;
  const paths = yield* Path.Path;
  const parsed = parseAnswers(flags.answers);
  if ("invalid" in parsed) return yield* Effect.fail(new ShipError(parsed.invalid));
  const given = parsed.answer;
  // Only record Items rebuild; anything else, like a bare repo name (the form
  // before ADR 0010), would quietly match nothing.
  const notAddress = flags.rebuild.find(
    (r) =>
      r !== "all" &&
      !PROVIDERS.some((p) => p.rule === "record" && p.name === parseAddress(r)?.provider),
  );
  if (notAddress !== undefined)
    return yield* Effect.fail(
      new ShipError(
        `--rebuild ${notAddress}: expected a record Item (repos:<name>, skills:<name>) or all`,
      ),
    );
  const path = flags.config ?? configPath(process.env);
  const config = yield* loadConfig(path);
  yield* Effect.logInfo(`config ${path}`);
  yield* Effect.logDebug(yield* fs.readFileString(path));
  const ordered = orderProviders(PROVIDERS, (p) => dependenciesOf(p, config));
  if ("cycle" in ordered)
    return yield* Effect.fail(new ShipError(`dependsOn cycle: ${ordered.cycle.join(" → ")}`));
  const providers = ordered.order;

  const problem = unshippable(config, tailnet, flags.only, path);
  if (problem !== undefined) return yield* Effect.fail(new ShipError(problem));
  const fleet = new Set(config.machines);
  // The Machine whose copy of the config this is: the Starting Machine's own
  // file, unless --config named another, which has no record and so no
  // history: when this config last reached each Machine (ADR 0008).
  const own = flags.config === undefined ? tailnet.self.name : undefined;
  const ownRecord = own === undefined ? undefined : yield* readConfigRecord;
  const base = ownRecord?.reached ?? {};
  // Config order, so the Ledger lists Machines the way the config does.
  const order = config.machines;
  const targetsList = tailnet.fleet
    .filter((m) => fleet.has(m.name) && (flags.only.length === 0 || flags.only.includes(m.name)))
    .toSorted((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const count = `${targetsList.length} machine${targetsList.length === 1 ? "" : "s"}`;
  yield* Effect.logInfo(
    `${flags.dryRun ? "dry run, " : ""}targets: ${targetsList.map((m) => m.name).join(", ")}`,
  );
  const quiet = show !== "ledger";
  if (!quiet)
    yield* Console.log(`${flags.dryRun ? "dry run, " : ""}${count} from ${tailnet.self.name}`);
  const color = colorful();
  const { ledger, store } = yield* makeLedger({
    from: tailnet.self.name,
    dryRun: flags.dryRun,
    machines: targetsList.map((m) => m.name),
    print: (note) => (quiet ? Effect.void : Console.log(noteText(note, color))),
  });
  const redraw = !quiet && canRedraw();

  // Runs however the Ship ends (done, failed, or interrupted), after the live
  // view is erased (finalizers run in reverse): saves the report once anything
  // may have changed, prints the Ledger once, and exits non-zero when any
  // Machine failed.
  let changing = false;
  // Set when the person picks a Stale Config: the Ship starts over, so this
  // pass prints no Ledger (its notes already printed).
  let adopted = false;
  const finish = Effect.fn("finish")(function* () {
    const state = yield* ledger.end;
    if (adopted) return;
    if (show !== "ledger") return show(state);
    const saved =
      changing &&
      (yield* saveReport(state).pipe(
        Effect.as(true),
        Effect.catch((e) =>
          Console.error(`could not save the report for fizz report: ${e.message}`).pipe(
            Effect.as(false),
          ),
        ),
      ));
    // A terminal gets the changes and points at the full report, once it is
    // saved; a saved log cannot be expanded later, so it gets every item.
    yield* Console.log(
      ledgerText(
        state,
        redraw
          ? {
              full: false,
              now: state.ended ?? 0,
              ...(saved ? { hint: "full report: fizz report" } : {}),
            }
          : { full: true, now: state.ended ?? 0 },
        color,
      ),
    );
    if (anyFailed(state)) process.exitCode = 1;
  });
  yield* Effect.addFinalizer(() => finish());
  const live = redraw ? yield* startLive(store, color) : noLive;

  // Check, in parallel. Every Machine is checked before any Question is asked.
  // Each Machine's Ship Log entries are marked with it and the phase.
  const checked: Checked[] = yield* Effect.forEach(
    targetsList,
    Effect.fn("checkOne")(
      function* (machine) {
        const local = machine.name === tailnet.self.name;
        if (!machine.online) {
          yield* ledger.skip(machine.name, "offline");
          return undefined;
        }
        if (!local && !machine.ssh) {
          yield* ledger.skip(machine.name, "no Tailscale SSH server");
          return undefined;
        }
        const identity = { name: machine.name, platform: machine.platform };
        const script = checkScript({
          scope: { machine: identity, config },
          providers: providers.map((provider) => ({
            provider,
            items: targetedItems(provider, config, identity),
          })),
        });
        const result = yield* check({ name: machine.name, local }, script, ledger);
        if (result.kind !== "checked") return undefined;
        yield* ledger.checked(machine.name);
        return { machine, local, state: result.state };
      },
      (effect, machine) => Effect.annotateLogs(effect, { machine: machine.name, phase: "check" }),
    ),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((list) => list.filter((g) => g !== undefined)));

  // Shows the diff from a Stale Config to the config here: both texts go into
  // an owner-only temporary directory, removed after, and git shows them with
  // the Ledger set aside. Only failures are noted, never contents.
  const showConfigDiff = (s: Stale) =>
    Effect.scoped(
      Effect.gen(function* () {
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "fleetfizz-diff-" });
        const name = paths.basename(path);
        // Named for the Machines that hold them; --config's file has none.
        const sides = { old: `${s.machines[0]}/${name}`, new: `${own ?? "--config"}/${name}` };
        for (const [side, text] of [
          [sides.old, s.text],
          [sides.new, yield* fs.readFileString(path)],
        ] as const) {
          yield* fs.makeDirectory(paths.join(dir, paths.dirname(side)), { recursive: true });
          yield* fs.writeFileString(paths.join(dir, side), text);
        }
        const code = yield* live.aside(showDiff(dir, sides));
        if (code > 1) yield* ledger.note("info", `the config: git diff exited with ${code}`);
      }),
    ).pipe(
      Effect.catch((e) => ledger.note("info", `could not show the config's diff: ${e.message}`)),
    );

  // A config elsewhere that a Ship from here must not overwrite unasked stops
  // the Ship unless the person overrides it or picks it, which writes it
  // (and what its record knows) here and starts the Ship over from it.
  const stale = yield* staleConfigs(yield* fs.readFileString(path), base, own, checked, ledger);
  // In a dry run, the Machines whose copy a Ship would ask about, and why.
  const asking = new Map(
    flags.dryRun
      ? stale.flatMap((s) =>
          s.machines
            .filter((m) => given("config", m) !== "overwrite")
            .map((m) => [m, s.description] as const),
        )
      : [],
  );
  if (stale.length > 0) {
    const what = stale.map((s) => s.description).join("; ");
    const answers = stale.flatMap((s) => s.machines).map((m) => given("config", m));
    if (flags.dryRun) {
      yield* ledger.note("info", `${what}; a Ship would ask before overwriting it`);
    } else if (answers.every((a) => a === "overwrite")) {
      yield* ledger.note("info", `${what}; overwriting it, as answered`);
    } else if (answers.includes("stop")) {
      return yield* Effect.fail(new ShipError("stopped before overwriting the config there"));
    } else if (live.ask === undefined) {
      return yield* Effect.fail(
        new ShipError(`${what}; copy it here first, or pass --overwrite-config`),
      );
    } else {
      // Only a config this Machine can ship is offered; the others say why not.
      const usable: Stale[] = [];
      for (const s of stale) {
        const why =
          s.config === undefined
            ? undefined
            : unshippable(s.config, tailnet, flags.only, `the config on ${s.machines[0]}`);
        if (why === undefined) usable.push(s);
        else yield* ledger.note("info", `cannot ship from here: ${why}`);
      }
      yield* ledger.note("ask", what);
      // A diff choice shows what differs, as a Shared File's does, and the
      // Question is asked again. Diff choices come last, so the cursor starts
      // on an answer.
      const ask = live.ask;
      let choice: Stale | "overwrite" | "stop" | undefined;
      while (choice === undefined) {
        const picked = yield* ask<Stale | "overwrite" | "stop" | { readonly diff: Stale }>([
          ...usable.map((s) => ({
            title: `use the config on ${s.machines[0]} (replaces this one, and its commands run on every Machine, this one too)`,
            value: s,
          })),
          { title: "overwrite it with this Machine's config", value: "overwrite" },
          { title: "stop", value: "stop" },
          ...stale.map((s) => ({
            title: `view the diff from the config on ${s.machines[0]} to this Machine's`,
            value: { diff: s },
          })),
        ]);
        if (typeof picked === "object" && "diff" in picked) yield* showConfigDiff(picked.diff);
        else choice = picked;
      }
      if (choice === "stop") {
        yield* ledger.note("answer", "stop");
        return yield* Effect.fail(new ShipError("stopped before overwriting the config there"));
      }
      if (choice === "overwrite") yield* ledger.note("answer", "overwrite it");
      else {
        yield* ledger.note("answer", `use the config on ${choice.machines[0]}`);
        yield* fs.writeFileString(path, choice.text);
        // This fizz only ships the version it is (ADR 0019): the next run
        // switches to the adopted config's, checks it, and ships it. Until
        // then it has no record here, so a Ship from elsewhere asks first.
        const wanted = readVersion(choice.text);
        if (wanted !== flags.version || choice.config === undefined)
          return yield* Effect.fail(
            new ShipError(
              `the config here now names fleetfizz ${wanted ?? "no version"}, not ${flags.version}; run fizz ship again to switch to it`,
            ),
          );
        // Adopting it here is when it reached this Machine, so a later Ship
        // from elsewhere asks before overwriting it.
        if (own !== undefined)
          yield* writeConfigRecord(
            encodeConfigRecord({
              ship: id,
              sha: choice.sha,
              reached: reachedAfter(
                mergeReached([base, choice.reached]),
                DateTime.formatIso(yield* DateTime.now),
                [own],
              ),
            }),
          );
        adopted = true;
        return "adopted" as const;
      }
    }
  }

  // Every checked Machine's targeted Items, per Provider. Machines can get
  // different Variants of one Item, so each Provider's resolve dedupes.
  const targeted = providers.map((provider) => ({
    provider,
    items: checked.flatMap(({ machine }) => targetedItems(provider, config, machine)),
  }));

  // Shown live until every Provider has resolved; Items counted once, however
  // many Machines they target.
  yield* ledger.resolving(
    new Set(
      targeted.flatMap(({ provider, items }) => items.map((i) => `${provider.name}:${i.name}`)),
    ).size,
  );

  // The Lent Token, only when a repo or a skill is targeted, read before
  // resolving so private sources resolve too. Without one, private sources
  // fail and public ones still ship.
  const lent: LentToken = targeted.some(
    ({ provider, items }) =>
      (provider.name === "repos" || provider.name === "skills") && items.length > 0,
  )
    ? yield* readLentToken()
    : { token: undefined };
  if (lent.token !== undefined) hidden.add(lent.token);
  yield* Effect.logInfo(
    lent.token !== undefined
      ? "gh token: lent"
      : `gh token: none (${lent.reason ?? "no repos or skills"})`,
  );
  if (lent.token === undefined && lent.reason !== undefined) {
    yield* ledger.note("info", `no gh token (${lent.reason}); private repos and skills will fail`);
  }

  // Each Provider resolves once, for every checked Machine's Items, so every
  // Machine gets the same version or commit. The Starting Machine's own
  // Items go too: Shared Files are read from them, checked or not.
  const self = { name: tailnet.self.name, platform: tailnet.self.platform };
  const resolved: Partial<Record<ProviderName, unknown>> = Object.fromEntries(
    yield* Effect.forEach(
      targeted,
      ({ provider, items }) =>
        provider
          .resolve(items, {
            ...(lent.token === undefined ? {} : { token: lent.token }),
            starting: {
              machine: self,
              config,
              items: targetedItems(provider, config, self),
            },
            checked: checked.map(({ machine, state }) => {
              const identity = { name: machine.name, platform: machine.platform };
              return {
                machine: identity,
                items: targetedItems(provider, config, identity),
                facts: state.facts[provider.name] ?? [],
                records: state.records[provider.name] ?? {},
              };
            }),
          })
          .pipe(Effect.map((r) => [provider.name, r] as const)),
      { concurrency: "unbounded" },
    ),
  );
  yield* ledger.resolved;

  const planAll = (cfg: FleetConfig, answer: Context["answer"]): Planned[] =>
    checked.map((g) => ({
      ...g,
      plan: planMachine({
        providers,
        state: g.state,
        resolved,
        ctx: {
          machine: { name: g.machine.name, platform: g.machine.platform },
          config: cfg,
          rebuild: (address) => flags.rebuild.includes("all") || flags.rebuild.includes(address),
          answer,
        },
      }),
    }));

  // Questions: every Machine's, before anything changes. A bump edits the
  // config, so the plan is made again from the new Ranges. An answer can
  // reveal new Questions, so this repeats until a round decides nothing
  // new. An answered Question that still asks is answered the same way again.
  let cfg = config;
  const decided = new Map<string, string>();
  const answer: Context["answer"] = (kind, subject) =>
    decided.get(`${kind}:${subject}`) ?? given(kind, subject);
  // A diff choice: its Provider writes the two sides into an owner-only
  // temporary directory, removed after, and git shows them with the Ledger
  // set aside. Only failures and what git cannot show (paths and modes) are
  // noted, never contents.
  const diff = (question: Question, choice: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const at = parseAddress(question.subject);
        const provider = providers.find((p) => p.name === at?.provider);
        if (at === undefined || provider === undefined) return;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "fleetfizz-diff-" });
        const sides = yield* (
          provider.diff?.(at.item, choice, resolved[provider.name], dir) ??
            Effect.succeed(undefined)
        );
        if (sides === undefined) return;
        if ("error" in sides)
          return yield* ledger.note("info", `${question.subject}: ${sides.error}`);
        const code = yield* live.aside(showDiff(dir, sides));
        if (code > 1)
          yield* ledger.note("info", `${question.subject}: git diff exited with ${code}`);
        if (sides.notShown.length > 0)
          yield* ledger.note(
            "info",
            `${question.subject}: also differs, not shown by git: ${sides.notShown.join(", ")}`,
          );
      }),
    ).pipe(
      Effect.catch((e) =>
        ledger.note("info", `${question.subject}: could not show the diff: ${e.message}`),
      ),
    );
  let planned = planAll(cfg, answer);
  for (;;) {
    const asked: Asked[] = planned.flatMap((g) =>
      g.plan.providers.flatMap((pp) =>
        pp.decisions.flatMap((d) =>
          d.kind === "ask" ? [{ machine: g.machine.name, question: d.question }] : [],
        ),
      ),
    );
    const answered = yield* askQuestions({
      asked,
      answer,
      ledger,
      ask: live.ask,
      diff,
      dryRun: flags.dryRun,
    });
    let progressed = false;
    for (const { question, bumps, answer: choice } of answered) {
      const key = `${question.kind}:${question.subject}`;
      progressed ||= !decided.has(key);
      decided.set(key, choice);
      if (choice !== "bump") continue;
      for (const bump of bumps) {
        changing = true;
        const range = yield* bumpConfig(path, bump.path, bump.newest);
        progressed ||= range !== bump.range;
      }
      if (bumps.length > 0) cfg = yield* loadConfig(path);
    }
    if (!progressed) break;
    planned = planAll(cfg, answer);
  }

  // An answer that changes this Machine first (pulling a Shared File's copy
  // here) runs now, and the Ship starts over from it, as when a Stale Config
  // is adopted. A dry run only notes the answer, never asked anyway.
  const adopting = [...decided].flatMap(([key, choice]) => {
    const subject = key.slice(key.indexOf(":") + 1);
    const at = parseAddress(subject);
    const provider = providers.find((p) => p.name === at?.provider);
    const run =
      at === undefined || provider === undefined
        ? undefined
        : provider.adopt?.(at.item, choice, resolved[provider.name]);
    return run === undefined ? [] : [{ subject, run }];
  });
  if (adopting.length > 0 && !flags.dryRun) {
    for (const { subject, run } of adopting) {
      changing = true;
      const result = yield* run;
      if ("error" in result)
        return yield* Effect.fail(new ShipError(`${subject}: ${result.error}`));
      yield* ledger.note("info", `${subject}: ${result.done}; starting over`);
    }
    adopted = true;
    return "adopted" as const;
  }

  // Every Machine gets this exact text (ADR 0008), shown as changed where its
  // copy differs.
  const text = yield* fs.readFileString(path);
  const sha = yield* shaOf(text);
  for (const { machine, state, plan: p } of planned) {
    const asked = asking.get(machine.name);
    yield* ledger.plan(machine.name, p, {
      ...(state.config === undefined ? {} : { from: state.config.sha.slice(0, 7) }),
      to: sha.slice(0, 7),
      ...(asked === undefined ? {} : { asked }),
    });
  }

  if (flags.dryRun) return;

  // The record each Machine gets says this Ship reached every planned
  // Machine, and the Starting Machine itself. The Starting Machine's own
  // record says so before Apply too, so an interrupted Ship still knows what
  // it shipped; after Apply it claims only the Machines whose config Step
  // completed, so a failed delivery does not claim a copy that never landed.
  const at = DateTime.formatIso(yield* DateTime.now);
  const recordFor = (reached: ReadonlyArray<string>) =>
    encodeConfigRecord({
      ship: id,
      sha,
      reached: reachedAfter(base, at, [...reached, ...(own === undefined ? [] : [own])]),
    });
  changing = true;
  const record = recordFor(planned.map((g) => g.machine.name));
  if (own !== undefined) yield* writeConfigRecord(record);
  yield* Effect.logInfo(`the config's record: ${record}`);
  const schema = fleetConfigSchemaText();
  // This version's schema beside the config here too, even when no Step
  // writes this Machine's config, as after `fizz self-update`. Only for the
  // editor, so a directory it cannot write to does not stop the Ship.
  const schemaHere = paths.join(paths.dirname(path), SCHEMA_FILE);
  if ((yield* fs.readFileString(schemaHere).pipe(Effect.orElseSucceed(() => ""))) !== schema)
    yield* fs
      .writeFileString(schemaHere, schema)
      .pipe(Effect.catch((e) => Effect.logWarning(`could not write ${schemaHere}: ${e.message}`)));

  // Apply, in parallel. No Machine changed before this point. Each Machine's
  // stdin carries the secrets its own Steps need (a Shared File's contents).
  const delivered: string[] = yield* Effect.forEach(
    planned,
    Effect.fn("applyOne")(
      function* ({ machine, local, plan: p }) {
        const applied = yield* apply(
          { name: machine.name, local },
          p,
          applyScript(p, record, shellInitFor(cfg, p.machine)),
          applyStdin(lent.token, text, schema, p),
          ledger,
        );
        return applied.done.includes(CONFIG_STEP) ? machine.name : undefined;
      },
      (effect, { machine }) =>
        Effect.annotateLogs(effect, { machine: machine.name, phase: "apply" }),
    ),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((list) => list.filter((name) => name !== undefined)));
  yield* Effect.logInfo(`the config reached: ${delivered.join(", ")}`);
  if (own !== undefined) yield* writeConfigRecord(recordFor(delivered));
}, Effect.scoped);
