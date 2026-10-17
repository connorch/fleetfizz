// `fizz ship`: one Ship. Load the config, read the Fleet, Check every
// reachable Machine, Plan, ask Questions, stamp and copy the config, Apply,
// and show it all on the Ledger: live in a terminal, printed once otherwise.
// Picking a newer config found elsewhere starts the Ship over from that one.
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import {
  bumpConfig,
  configPath,
  fleetConfigJsonSchema,
  loadConfig,
  parseConfig,
  stampText,
  staleCopies,
  type Copy,
  type FleetConfig,
  type ProviderName,
} from "@fleetfizz/config";
import {
  dependenciesOf,
  machinesNamed,
  orderProviders,
  parseAddress,
  planMachine,
  targetedItems,
  type Context,
  type MachinePlan,
  type MachineState,
  type Targeted,
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

import { anyFailed, makeLedger, type Ledger } from "./ledger.ts";
import { canRedraw, noLive, startLive } from "./live.tsx";
import { apply, check } from "./machine.ts";
import { askQuestions, parseAnswers, type Asked } from "./questions.ts";
import { saveReport } from "./report.tsx";
import { colorful, ledgerText, noteText } from "./view.tsx";

export interface ShipFlags {
  readonly dryRun: boolean;
  readonly only: ReadonlyArray<string>;
  // Addresses (`provider:item`), or `all`.
  readonly rebuild: ReadonlyArray<string>;
  // `--answer` entries (parseAnswers), the shortcut flags included.
  readonly answers: ReadonlyArray<string>;
  readonly config: string | undefined;
  // The running fleetfizz version, pinned on every Machine (ADR 0008).
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
    ...Object.keys(config.machines),
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
  const fleet = new Set(Object.keys(config.machines));
  if (!fleet.has(tailnet.self.name)) {
    return `this Machine (${tailnet.self.name}) is not in machines in ${source}`;
  }
  const outsideFleet = only.filter((name) => !fleet.has(name));
  if (outsideFleet.length > 0) return `not in machines in ${source}: ${outsideFleet.join(", ")}`;
  return undefined;
};

// A Stale Config: one text of the config, newer than this one, and the
// Machines that hold it (one Ship from elsewhere reaches several).
interface Stale {
  readonly text: string;
  readonly config: FleetConfig;
  readonly machines: ReadonlyArray<string>;
  readonly description: string;
}

// The other copies of the config that this Ship would roll back (staleCopies),
// grouped by text. A copy that does not parse is reported and then
// overwritten; it cannot be newer.
const staleConfigs = Effect.fn("staleConfigs")(function* (
  config: FleetConfig,
  own: string | undefined,
  checked: ReadonlyArray<Checked>,
  ledger: Ledger,
) {
  const copies: Array<Copy & { readonly config: FleetConfig; readonly text: string }> = [];
  for (const { machine, state } of checked) {
    if (state.config === undefined) continue;
    const parsed = yield* Effect.result(parseConfig(machine.name, state.config));
    if (parsed._tag === "Failure") {
      yield* ledger.note(
        "info",
        `the config on ${machine.name} does not parse; it will be overwritten`,
      );
    } else copies.push({ machine: machine.name, config: parsed.success, text: state.config });
  }
  const byText = Map.groupBy(staleCopies(config, copies, own), (c) => c.text);
  return [...byText].flatMap(([text, [first, ...rest]]): Stale[] => {
    if (first === undefined) return [];
    const { config, machine } = first;
    const machines = [machine, ...rest.map((c) => c.machine)];
    return [
      {
        text,
        config,
        machines,
        description: `${machines.join(", ")} (shipped ${config.shippedAt} from ${config.shippedFrom ?? "unknown"})`,
      },
    ];
  });
});

const schemaJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown, { space: 2 }));

// One Ship, started over each time the person picks a newer config found on
// another Machine: that config decides what is checked, so the Check runs again.
export const ship = Effect.fn("ship")(function* (flags: ShipFlags) {
  while ((yield* shipPass(flags)) === "adopted") {}
});

// One pass of a Ship from the config at hand. "adopted" means it stopped
// before any change because the person picked a Stale Config, now written here.
const shipPass = Effect.fn("shipPass")(function* (flags: ShipFlags) {
  const fs = yield* FileSystem.FileSystem;
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
      new ShipError(`--rebuild ${notAddress}: expected a record Item (repos:<name>) or all`),
    );
  const path = flags.config ?? configPath(process.env);
  const config = yield* loadConfig(path);
  const ordered = orderProviders(PROVIDERS, (p) => dependenciesOf(p, config));
  if ("cycle" in ordered)
    return yield* Effect.fail(new ShipError(`dependsOn cycle: ${ordered.cycle.join(" → ")}`));
  const providers = ordered.order;
  const tailnet = yield* readTailnet();

  const problem = unshippable(config, tailnet, flags.only, path);
  if (problem !== undefined) return yield* Effect.fail(new ShipError(problem));
  const fleet = new Set(Object.keys(config.machines));
  // The Machine whose copy of the config this is: the Starting Machine's own
  // file, unless --config named another (staleCopies).
  const own = flags.config === undefined ? tailnet.self.name : undefined;
  // Config order, so the Ledger lists Machines the way the config does.
  const order = Object.keys(config.machines);
  const targetsList = tailnet.fleet
    .filter((m) => fleet.has(m.name) && (flags.only.length === 0 || flags.only.includes(m.name)))
    .toSorted((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const count = `${targetsList.length} machine${targetsList.length === 1 ? "" : "s"}`;
  yield* Console.log(`${flags.dryRun ? "dry run, " : ""}${count} from ${tailnet.self.name}`);
  const color = colorful();
  const { ledger, store } = yield* makeLedger({
    from: tailnet.self.name,
    dryRun: flags.dryRun,
    machines: targetsList.map((m) => m.name),
    print: (note) => Console.log(noteText(note, color)),
  });
  const redraw = canRedraw();

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
  const checked: Checked[] = yield* Effect.forEach(
    targetsList,
    Effect.fn("checkOne")(function* (machine) {
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
    }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((list) => list.filter((g) => g !== undefined)));

  // A newer config elsewhere stops the Ship unless the person overrides it or
  // picks it, which writes it here and starts the Ship over from it.
  const stale = yield* staleConfigs(config, own, checked, ledger);
  if (stale.length > 0) {
    const what = `newer config on ${stale.map((s) => s.description).join(", ")}`;
    const answers = stale.flatMap((s) => s.machines).map((m) => given("config", m));
    if (flags.dryRun) {
      yield* ledger.note("info", `${what}; a Ship would ask before overwriting it`);
    } else if (answers.every((a) => a === "overwrite")) {
      yield* ledger.note("info", `${what}; overwriting it, as answered`);
    } else if (answers.includes("stop")) {
      return yield* Effect.fail(new ShipError("aborted: the config here is older"));
    } else if (live.ask === undefined) {
      return yield* Effect.fail(
        new ShipError(`${what}; copy it here first, or pass --overwrite-config`),
      );
    } else {
      // Only a config this Machine can ship is offered; the others say why not.
      const usable: Stale[] = [];
      for (const s of stale) {
        const why = unshippable(s.config, tailnet, flags.only, `the config on ${s.machines[0]}`);
        if (why === undefined) usable.push(s);
        else yield* ledger.note("info", `cannot ship from here: ${why}`);
      }
      yield* ledger.note("ask", what);
      const choice = yield* live.ask<Stale | "overwrite" | "stop">([
        ...usable.map((s) => ({
          title: `use the config on ${s.machines[0]} (replaces this one)`,
          value: s,
        })),
        { title: "overwrite it with this Machine's config", value: "overwrite" },
        { title: "stop", value: "stop" },
      ]);
      if (choice === "stop") {
        yield* ledger.note("answer", "stop");
        return yield* Effect.fail(new ShipError("aborted: the config here is older"));
      }
      if (choice === "overwrite") yield* ledger.note("answer", "overwrite it");
      else {
        yield* ledger.note("answer", `use the config on ${choice.machines[0]}`);
        yield* fs.writeFileString(path, choice.text);
        adopted = true;
        return "adopted" as const;
      }
    }
  }

  // Every checked Machine's targeted Items, per Provider.
  const targeted = providers.map((provider) => {
    const items = new Map<string, Targeted>();
    for (const { machine } of checked)
      for (const item of targetedItems(provider, config, machine)) items.set(item.name, item);
    return { provider, items: [...items.values()] };
  });

  // The Lent Token, only when a repo is targeted, read before resolving so
  // private repos resolve too. Without one, private repos fail and public
  // repos still ship.
  const lent: LentToken = targeted.some(
    ({ provider, items }) => provider.name === "repos" && items.length > 0,
  )
    ? yield* readLentToken()
    : { token: undefined };
  if (lent.token === undefined && lent.reason !== undefined) {
    yield* ledger.note("info", `no gh token (${lent.reason}); private repos will fail`);
  }

  // Each Provider resolves once, for every checked Machine's Items, so every
  // Machine gets the same version or commit.
  const resolved: Partial<Record<ProviderName, unknown>> = Object.fromEntries(
    yield* Effect.forEach(
      targeted,
      ({ provider, items }) =>
        provider
          .resolve(items, lent.token === undefined ? {} : { token: lent.token })
          .pipe(Effect.map((r) => [provider.name, r] as const)),
      { concurrency: "unbounded" },
    ),
  );

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
          self: flags.version,
          rebuild: (address) => flags.rebuild.includes("all") || flags.rebuild.includes(address),
          answer,
        },
      }),
    }));
  let planned = planAll(config, given);

  // Questions: every Machine's, before anything changes. A bump edits the
  // config, so the plan is made again from the new Ranges. An answer can
  // reveal new Questions (managed mode exposes the defaults' Ranges), so
  // this repeats until a plan asks nothing new.
  let cfg = config;
  const decided = new Map<string, string>();
  for (;;) {
    const asked: Asked[] = planned.flatMap((g) =>
      g.plan.providers.flatMap((pp) =>
        pp.decisions.flatMap((d) =>
          d.kind === "ask" && !decided.has(`${d.question.kind}:${d.question.subject}`)
            ? [{ machine: g.machine.name, question: d.question }]
            : [],
        ),
      ),
    );
    const answered = yield* askQuestions({
      asked,
      answer: given,
      ledger,
      ask: live.ask,
      dryRun: flags.dryRun,
    });
    if (answered.length === 0) break;
    for (const { question, newest, answer } of answered) {
      decided.set(`${question.kind}:${question.subject}`, answer);
      if (answer !== "bump" || question.bump === undefined) continue;
      changing = true;
      yield* bumpConfig(path, question.bump.path, newest);
      cfg = yield* loadConfig(path);
    }
    planned = planAll(
      cfg,
      (kind, subject) => decided.get(`${kind}:${subject}`) ?? given(kind, subject),
    );
  }

  for (const { machine, plan: p } of planned) yield* ledger.plan(machine.name, p);

  if (flags.dryRun) return;

  // Stamp the config here, then every Machine gets this exact text (ADR 0008).
  const shippedAt = DateTime.formatIso(yield* DateTime.now);
  // The copy each Machine receives says this Ship reached it. The local file
  // is written again after Apply with only the Machines whose config step
  // completed, so a failed delivery does not claim a copy that never landed.
  changing = true;
  const original = yield* fs.readFileString(path);
  const stampWith = (reached: ReadonlyArray<string>) =>
    stampText(original, { shippedAt, shippedFrom: tailnet.self.name, reached, own });
  const stamped = stampWith(planned.map((g) => g.machine.name));
  yield* fs.writeFileString(path, stamped);
  const schema = `${schemaJson(fleetConfigJsonSchema())}\n`;

  // Apply, in parallel. No Machine changed before this point.
  const stdin = applyStdin(lent.token, stamped, schema);
  const delivered: string[] = yield* Effect.forEach(
    planned,
    Effect.fn("applyOne")(function* ({ machine, local, plan: p }) {
      const applied = yield* apply({ name: machine.name, local }, p, applyScript(p), stdin, ledger);
      return applied.done.includes(CONFIG_STEP) ? machine.name : undefined;
    }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((list) => list.filter((name) => name !== undefined)));
  yield* fs.writeFileString(path, stampWith(delivered));
}, Effect.scoped);
