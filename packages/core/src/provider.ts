// Providers (ADR 0010): one kind of thing a Ship keeps in line on a Machine,
// with its own config section. A Provider lists its Items, says how to observe
// them, decides each one, and turns the decisions into Steps. The engine
// (engine.ts) does everything that is the same for every Provider: Targeting,
// dependsOn, Questions, and holding back dependents.
import type * as Effect from "effect/Effect";
import type { ChildProcessSpawner } from "effect/process";

import type { FleetConfig, ProviderName } from "@fleetfizz/config";

import { decideRange } from "./range.ts";
import type { MachineIdentity, Targeting } from "./targeting.ts";

// An Item: a name, unique within its Provider, and its own Targeting.
export interface Targeted extends Targeting {
  readonly name: string;
}

// `provider:item`, how Items are written in the Ledger, --rebuild, and --answer.
export const address = (provider: string, item: string): string => `${provider}:${item}`;
// Splits on the first ":", so Item names may contain one.
export const parseAddress = (
  text: string,
): { readonly provider: string; readonly item: string } | undefined => {
  const at = text.indexOf(":");
  return at <= 0 || at === text.length - 1
    ? undefined
    : { provider: text.slice(0, at), item: text.slice(at + 1) };
};

export interface Scope {
  readonly machine: MachineIdentity;
  readonly config: FleetConfig;
}

// What every decide and act sees about the Ship and the Machine.
export interface Context extends Scope {
  // The running fleetfizz version, which every Machine is pinned to (ADR 0008).
  readonly self: string;
  // The Machine's $HOME, or "~" when the Check did not report it.
  readonly home: string;
  // Whether --rebuild names this address (or `all`).
  readonly rebuild: (address: string) => boolean;
  // The answer to a Question asked of this subject, if it has one yet.
  readonly answer: (kind: QuestionKind, subject: string) => string | undefined;
}

// Every Question kind and its choices, so `--answer kind=choice` is checked
// before anything runs. A "range" Question is an Item above its Range; a
// "config" Question is a Stale Config (ADR 0008).
export const QUESTION_CHOICES = {
  range: ["bump", "skip", "downgrade"],
  config: ["overwrite", "stop"],
} as const;
export type QuestionKind = keyof typeof QUESTION_CHOICES;
export const isQuestionKind = (kind: string): kind is QuestionKind => kind in QUESTION_CHOICES;

// A choice the Plan cannot make alone. Questions with the same kind and
// subject on several Machines are asked once.
export interface Question {
  readonly kind: QuestionKind;
  // An address, or the Machine for a "config" Question.
  readonly subject: string;
  // What the Machine has: an installed version, a config's age.
  readonly found: string;
  // What is wrong with it, read after it: "is above ^24".
  readonly problem: string;
  readonly choices: ReadonlyArray<{ readonly value: string; readonly title: string }>;
  // The choice taken when nobody can be asked (no terminal).
  readonly default: string;
  // Where a "bump" answer edits the config: the key path and its Range.
  readonly bump?: { readonly path: ReadonlyArray<string>; readonly range: string };
}

// What a Ship does about one Item on one Machine. `at` is what the Machine
// has now (a version, a commit), for the Ledger. A "leave" may still carry
// `upkeep` for `act`: work that keeps the Item as it is, such as a Managed
// Clone's reset on every Ship, which the Ledger does not count as a change.
// Decisions without upkeep (the default) fit any Provider.
export type Decision<Change, Upkeep = never> =
  | {
      readonly kind: "leave";
      readonly item: string;
      readonly at?: string;
      readonly upkeep?: Upkeep;
    }
  | {
      readonly kind: "change";
      readonly item: string;
      readonly from?: string;
      readonly to: string;
      readonly reason?: string;
      readonly change: Change;
    }
  | {
      readonly kind: "ask";
      readonly item: string;
      readonly at?: string;
      readonly question: Question;
    }
  | { readonly kind: "skip"; readonly item: string; readonly at?: string; readonly reason: string }
  | { readonly kind: "fail"; readonly item: string; readonly at?: string; readonly reason: string };

// One unit of change on one Machine, reported on its own. `run` is shell; its
// last command's exit code is the Step's result.
export interface Step {
  // `provider:item:what`, unique on the Machine.
  readonly id: string;
  // The Items it changes. A later Step sharing an Item with a failed one is skipped.
  readonly items: ReadonlyArray<string>;
  // Shown while it runs: "installing", "fetching".
  readonly doing: string;
  readonly run: ReadonlyArray<string>;
}

// A Provider. Methods (not function properties) so a Provider with its own
// Item, Observed, Resolved, and Change types is still an AnyProvider: method
// parameters are compared bivariantly.
export interface Provider<
  Name extends ProviderName,
  Item extends Targeted,
  Observed,
  Resolved,
  Change,
> {
  readonly name: Name;
  // "range": Items are versions kept inside a Range. "record": Items are
  // installs kept matching an Install Record on the Machine.
  readonly rule: "range" | "record";
  // Providers that always come first, whatever the config says.
  readonly dependsOn: ReadonlyArray<ProviderName>;
  // Every Item of the section, before Targeting. `undefined` when the section
  // is missing or does not target the Machine (only implicit Items remain).
  items(section: FleetConfig[Name] | undefined): ReadonlyArray<Item>;
  // Shell for the Check: prints `ff-state` Facts with `"provider": name`.
  observe(items: ReadonlyArray<Item>, scope: Scope): string;
  // Folds this Provider's Facts and Install Records (keyed by Item) into what decide reads.
  parse(facts: ReadonlyArray<unknown>, records: Readonly<Record<string, unknown>>): Observed;
  // Runs once on the Starting Machine for every Machine's targeted Items,
  // so every Machine gets the same version or commit during one Ship.
  resolve(
    items: ReadonlyArray<Item>,
    ctx: { readonly token?: string },
  ): Effect.Effect<Resolved, never, ChildProcessSpawner.ChildProcessSpawner>;
  // One Decision per targeted Item, in config order.
  decide(input: {
    readonly items: ReadonlyArray<Item>;
    readonly observed: Observed;
    readonly resolved: Resolved;
    readonly ctx: Context;
  }): ReadonlyArray<Decision<Change, Change>>;
  // The Steps for the decisions, in order. Never sees a held Provider.
  act(decisions: ReadonlyArray<Decision<Change, Change>>, ctx: Context): ReadonlyArray<Step>;
}

export type AnyProvider = Provider<ProviderName, Targeted, unknown, unknown, unknown>;

// A "range" Question for an Item above its Range. Skipping is the default:
// it changes nothing.
export const rangeQuestion = (
  subject: string,
  installed: string,
  range: string,
  bumpPath: ReadonlyArray<string>,
): Question => ({
  kind: "range",
  subject,
  found: installed,
  problem: `is above ${range}`,
  choices: [
    { value: "bump", title: "bump the config" },
    { value: "skip", title: "skip on these Machines (leave as is, shown as skipped)" },
    { value: "downgrade", title: "downgrade into the range" },
  ],
  default: "skip",
  bump: { path: bumpPath, range },
});

// The Decision for a "range" Item: keep `installed` inside `range` using the
// published versions, asking (or using the answer) when it is above.
export const decideRangeItem = (input: {
  readonly provider: string;
  readonly item: string;
  readonly range: string;
  readonly installed: string | undefined;
  readonly available: ReadonlyArray<string>;
  readonly bumpPath: ReadonlyArray<string>;
  readonly ctx: Context;
}): Decision<string> => {
  const { item, range, installed, available } = input;
  const at = installed === undefined ? {} : { at: installed };
  const unavailable = {
    kind: "fail",
    item,
    ...at,
    reason: `no published version satisfies ${range}`,
  } as const;
  const install = (version: string): Decision<string> => ({
    kind: "change",
    item,
    ...(installed === undefined ? {} : { from: installed }),
    to: version,
    change: version,
  });
  const decision = decideRange(range, installed, available);
  switch (decision.kind) {
    case "leave":
      return { kind: "leave", item, ...at };
    case "install":
      return install(decision.version);
    case "unavailable":
      return unavailable;
    case "ask": {
      const subject = address(input.provider, item);
      const answer = input.ctx.answer("range", subject);
      if (answer === "skip") return { kind: "skip", item, ...at, reason: `is above ${range}` };
      if (answer === "downgrade") {
        const target = decideRange(range, undefined, available);
        return target.kind === "install" ? install(target.version) : unavailable;
      }
      return {
        kind: "ask",
        item,
        ...at,
        question: rangeQuestion(subject, decision.installed, range, input.bumpPath),
      };
    }
  }
};

// Providers in run order: each after the Providers it depends on (its own
// dependsOn plus the config's), the order of `all` breaking ties. A cycle is
// a config error, named in full.
export const orderProviders = <P extends AnyProvider>(
  all: ReadonlyArray<P>,
  dependsOn: (provider: P) => ReadonlyArray<ProviderName>,
): { readonly order: ReadonlyArray<P> } | { readonly cycle: ReadonlyArray<ProviderName> } => {
  const byName = new Map(all.map((p) => [p.name, p]));
  const order: P[] = [];
  const done = new Set<ProviderName>();
  const visit = (
    p: P,
    path: ReadonlyArray<ProviderName>,
  ): ReadonlyArray<ProviderName> | undefined => {
    if (done.has(p.name)) return undefined;
    if (path.includes(p.name)) return [...path.slice(path.indexOf(p.name)), p.name];
    for (const name of dependsOn(p)) {
      const dep = byName.get(name);
      const cycle = dep === undefined ? undefined : visit(dep, [...path, p.name]);
      if (cycle !== undefined) return cycle;
    }
    done.add(p.name);
    order.push(p);
    return undefined;
  };
  for (const p of all) {
    const cycle = visit(p, []);
    if (cycle !== undefined) return { cycle };
  }
  return { order };
};
