// The Ledger: what a Ship shows. One line per Machine in config order with a
// summary of its Items and, under it, one line per Item that changes, by its
// address (`provider:item`), its status first. The full Ledger lists every
// Item, changed or not, and the config copy.
//
//   connors-mac-studio                                         up to date
//
//   connors-macbook-pro                                5m 07s  2 of 2 done
//   ✓ done         vp:vp                    1.0.0 → 1.1.0       16.6s
//   ✓ installed    repos:t3code  3f1a2b0 → 9e02bb1  4m 50s
//
//   1 updated, 1 up to date  in 5m 12s
//
// The state is plain data, a Schema so `fizz report` can save it. Ship events
// update it through the `Ledger` interface, and view.tsx draws it, live or
// once. Notes (Questions, their answers, and other Fleet lines) are not part
// of that drawing: they print once, above it, as they happen. Every event also
// goes in the Ship Log (log.ts), under its Machine.
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { address, type MachinePlan } from "@fleetfizz/core";
import { CONFIG_STEP } from "@fleetfizz/remote";

export const Note = Schema.Struct({
  kind: Schema.Literals(["ask", "answer", "info"]),
  text: Schema.String,
});
export type Note = typeof Note.Type;

// One Item on one Machine, by address, or the config copy: shown as
// `from -> to`, `+ to` (new), or just `from` (no change). `kind` is its
// Provider's rule.
const Item = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(["range", "record", "config"]),
  from: Schema.optionalKey(Schema.String),
  to: Schema.optionalKey(Schema.String),
  // Why it changes when the version or commit alone does not say
  // ("never installed", "drift: ...", "Node 22 → 24").
  reason: Schema.optionalKey(Schema.String),
  // Planned to change, or failed.
  changes: Schema.Boolean,
  status: Schema.Literals(["idle", "running", "ok", "failed", "skipped"]),
  // What a running item is doing: "fetching", "installing".
  doing: Schema.optionalKey(Schema.String),
  // Why it failed or was skipped.
  detail: Schema.optionalKey(Schema.String),
  // Skipped because it is a Question a dry run does not ask.
  asked: Schema.optionalKey(Schema.Boolean),
  output: Schema.optionalKey(Schema.Array(Schema.String)),
  // The Apply Steps that move this Item, in order, and what each is doing.
  steps: Schema.Array(Schema.Struct({ id: Schema.String, doing: Schema.String })),
  started: Schema.optionalKey(Schema.Number),
  ended: Schema.optionalKey(Schema.Number),
});
export type Item = typeof Item.Type;

const MachineEntry = Schema.Struct({
  name: Schema.String,
  status: Schema.Literals(["checking", "waiting", "planned", "running", "ok", "skipped", "failed"]),
  // Why the Machine was skipped or failed as a whole (ssh, Check, Apply).
  detail: Schema.optionalKey(Schema.String),
  output: Schema.optionalKey(Schema.Array(Schema.String)),
  items: Schema.Array(Item),
  // Its running script has printed its first line: ssh is up. Until then a
  // Check or Apply is still connecting.
  connected: Schema.optionalKey(Schema.Boolean),
  // When its Check ended. The Check starts with the Ship.
  checked: Schema.optionalKey(Schema.Number),
  // Apply's start and end.
  started: Schema.optionalKey(Schema.Number),
  ended: Schema.optionalKey(Schema.Number),
});
export type MachineEntry = typeof MachineEntry.Type;

export const LedgerState = Schema.Struct({
  from: Schema.String,
  dryRun: Schema.Boolean,
  notes: Schema.Array(Note),
  machines: Schema.Array(MachineEntry),
  // While every Provider resolves its versions and commits: when it started,
  // and how many Items.
  resolving: Schema.optionalKey(Schema.Struct({ started: Schema.Number, items: Schema.Number })),
  started: Schema.Number,
  ended: Schema.optionalKey(Schema.Number),
});
export type LedgerState = typeof LedgerState.Type;

export type Outcome = "ok" | "skipped" | "failed";

export type StepResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly detail: string; readonly output: ReadonlyArray<string> };

// The events a Ship reports. `name` is always a Machine.
export interface Ledger {
  // Prints above the Machines now, and goes in the saved report.
  readonly note: (kind: Note["kind"], text: string) => Effect.Effect<void>;
  // The Machine's running script printed its first line.
  readonly connected: (name: string) => Effect.Effect<void>;
  readonly checked: (name: string) => Effect.Effect<void>;
  readonly skip: (name: string, reason: string) => Effect.Effect<void>;
  // The Machine failed as a whole: the first line is why, the rest is output.
  readonly fail: (name: string, lines: ReadonlyArray<string>) => Effect.Effect<void>;
  // Resolving `items` Items for every Machine, between Check and Plan.
  readonly resolving: (items: number) => Effect.Effect<void>;
  readonly resolved: Effect.Effect<void>;
  readonly plan: (name: string, plan: MachinePlan, config: ConfigChange) => Effect.Effect<void>;
  readonly start: (name: string) => Effect.Effect<void>;
  readonly stepStarted: (name: string, id: string) => Effect.Effect<void>;
  readonly stepDone: (name: string, id: string, result: StepResult) => Effect.Effect<void>;
  // A Step the script skipped: an earlier Step failed, or a dependency did.
  readonly stepSkipped: (name: string, id: string, reason: string) => Effect.Effect<void>;
  // An Apply Step reported the version an Item reached (core's AtFact).
  readonly reached: (name: string, item: string, at: string) => Effect.Effect<void>;
  readonly finish: (name: string, outcome: Outcome) => Effect.Effect<void>;
  readonly end: Effect.Effect<LedgerState>;
}

// The current state plus the time the live view counts running items from.
export interface Snapshot {
  readonly state: LedgerState;
  readonly now: number;
}

// Holds the state for the Ledger's events and the live view's subscription.
export interface LedgerStore {
  readonly get: () => Snapshot;
  readonly subscribe: (listener: () => void) => () => void;
  // Moves `now` forward so running items count up.
  readonly tick: Effect.Effect<void>;
}

// What the config copy changes on one Machine: the short sha of its copy
// there (none when it has none) and of the copy this Ship writes.
export interface ConfigChange {
  readonly from?: string;
  readonly to: string;
}

// Every Item on one Machine, one per Decision, and the config copy. A
// Question in a dry run, never asked, shows as skipped.
export const itemsOf = (p: MachinePlan, config: ConfigChange): Item[] => [
  ...p.providers.flatMap((pp) =>
    pp.decisions.map((d): Item => {
      const base = {
        name: address(pp.name, d.item),
        kind: pp.rule,
        steps: pp.steps
          .filter((step) => step.items.includes(d.item))
          .map(({ id, doing }) => ({ id, doing })),
      };
      switch (d.kind) {
        case "change":
          return {
            ...base,
            ...(d.from === undefined ? {} : { from: d.from }),
            to: d.to,
            ...(d.reason === undefined ? {} : { reason: d.reason }),
            changes: true,
            status: "idle",
          };
        case "leave":
          return {
            ...base,
            ...(d.at === undefined ? {} : { from: d.at }),
            changes: false,
            status: "idle",
          };
        case "skip":
        case "fail":
          return {
            ...base,
            ...(d.at === undefined ? {} : { from: d.at }),
            changes: d.kind === "fail",
            status: d.kind === "fail" ? "failed" : "skipped",
            detail: d.reason,
          };
        case "ask":
          return {
            ...base,
            ...(d.at === undefined ? {} : { from: d.at }),
            changes: false,
            status: "skipped",
            detail: d.question.problem,
            asked: true,
          };
      }
    }),
  ),
  {
    name: CONFIG_STEP,
    kind: "config",
    ...config,
    changes: config.from !== config.to,
    status: "idle",
    steps: [{ id: CONFIG_STEP, doing: "copying" }],
  },
];

// A Machine's outcome, counting failures the plan already knew about. A
// planned Machine is a dry run's ok; in a stopped Ship it never ran, and a
// Machine stopped before its plan has no outcome either.
export const outcomeOf = (m: MachineEntry, dryRun: boolean): Outcome | undefined =>
  m.status === "skipped"
    ? "skipped"
    : m.status === "failed" || m.items.some((i) => i.status === "failed")
      ? "failed"
      : m.status === "ok" || (m.status === "planned" && dryRun)
        ? "ok"
        : undefined;

// Whether any Machine failed: the Ship then exits non-zero.
export const anyFailed = (state: LedgerState): boolean =>
  state.machines.some((m) => outcomeOf(m, state.dryRun) === "failed");

// `machines` is the Ship's targets in config order; `print` shows a note.
export const makeLedger = Effect.fn("makeLedger")(function* (input: {
  readonly from: string;
  readonly dryRun: boolean;
  readonly machines: ReadonlyArray<string>;
  readonly print: (note: Note) => Effect.Effect<void>;
}) {
  const started = yield* Clock.currentTimeMillis;
  let snapshot: Snapshot = {
    state: {
      from: input.from,
      dryRun: input.dryRun,
      notes: [],
      machines: input.machines.map((name) => ({ name, status: "checking", items: [] })),
      started,
    },
    now: started,
  };
  const listeners = new Set<() => void>();
  const update = (change: (state: LedgerState, now: number) => LedgerState) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      snapshot = { state: change(snapshot.state, now), now };
      for (const listener of listeners) listener();
    });
  const machine = (name: string, change: (m: MachineEntry, now: number) => MachineEntry) =>
    update((state, now) => ({
      ...state,
      machines: state.machines.map((m) => (m.name === name ? change(m, now) : m)),
    }));
  const items = (name: string, id: string, change: (item: Item, now: number) => Item) =>
    machine(name, (m, now) => ({
      ...m,
      items: m.items.map((i) => (i.steps.some((step) => step.id === id) ? change(i, now) : i)),
    }));

  const store: LedgerStore = {
    get: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tick: update((state) => state),
  };
  // Writes a Machine's event to the Ship Log.
  const log = (name: string, entry: Effect.Effect<void>) =>
    Effect.annotateLogs(entry, { machine: name });
  const ledger: Ledger = {
    note: Effect.fn("ledger.note")(function* (kind, text) {
      yield* update((state) => ({ ...state, notes: [...state.notes, { kind, text }] }));
      yield* input.print({ kind, text });
      yield* Effect.logInfo(`${kind}: ${text}`);
    }),
    connected: (name) =>
      machine(name, (m) => ({ ...m, connected: true })).pipe(
        Effect.andThen(log(name, Effect.logInfo("connected"))),
      ),
    checked: (name) =>
      machine(name, (m, now) => ({ ...m, status: "waiting", checked: now })).pipe(
        Effect.andThen(log(name, Effect.logInfo("checked"))),
      ),
    skip: (name, reason) =>
      machine(name, (m) => ({ ...m, status: "skipped", detail: reason })).pipe(
        Effect.andThen(log(name, Effect.logWarning(`skipped: ${reason}`))),
      ),
    fail: (name, [reason = "failed", ...output]) =>
      machine(name, (m, now) => ({
        ...m,
        status: "failed",
        detail: reason,
        ...(output.length === 0 ? {} : { output }),
        ended: now,
      })).pipe(Effect.andThen(log(name, Effect.logError(`failed: ${reason}`)))),
    resolving: (n) =>
      update((state, now) => ({ ...state, resolving: { started: now, items: n } })).pipe(
        Effect.andThen(Effect.logInfo(`resolving ${n} items`)),
      ),
    resolved: update(({ resolving: _, ...state }) => state).pipe(
      Effect.andThen(Effect.logInfo("resolved")),
    ),
    plan: (name, p, config) =>
      machine(name, (m) => ({ ...m, status: "planned", items: itemsOf(p, config) })).pipe(
        Effect.andThen(
          Effect.forEach(
            p.providers.flatMap((pp) => pp.decisions.map((d) => ({ pp, d }))),
            ({ pp, d }) => log(name, Effect.logInfo(`plan ${address(pp.name, d.item)}:`, d)),
            { discard: true },
          ),
        ),
      ),
    // Apply connects anew.
    start: (name) =>
      machine(name, (m, now) => ({ ...m, status: "running", connected: false, started: now })).pipe(
        Effect.andThen(log(name, Effect.logInfo("applying"))),
      ),
    // An Item keeps its first failure: a later Step for the same Item must
    // not hide it.
    stepStarted: (name, id) =>
      items(name, id, (item, now) =>
        item.status === "failed" || item.status === "skipped"
          ? item
          : {
              ...item,
              status: "running",
              doing: item.steps.find((step) => step.id === id)?.doing ?? "running",
              started: item.started ?? now,
            },
      ).pipe(Effect.andThen(log(name, Effect.logInfo(`step ${id}`)))),
    stepDone: (name, id, result) =>
      items(name, id, (item, now) => {
        if (item.status === "failed" || item.status === "skipped") return item;
        if (!result.ok) {
          return {
            ...item,
            changes: true,
            status: "failed",
            detail: result.detail,
            ...(result.output.length === 0 ? {} : { output: result.output }),
            ended: now,
          };
        }
        // An Item with more Steps to go (a repo's fetch, then its install) runs on.
        if (item.steps.at(-1)?.id !== id) return item;
        const { doing: _, ...rest } = item;
        return { ...rest, status: "ok", ended: now };
      }).pipe(
        Effect.andThen(
          log(
            name,
            result.ok
              ? Effect.logInfo(`step ${id}: done`)
              : Effect.logWarning(`step ${id}: ${result.detail}`),
          ),
        ),
      ),
    stepSkipped: (name, id, reason) =>
      items(name, id, (item, now) => {
        if (item.status === "failed") return item;
        const { doing: _, ...rest } = item;
        return { ...rest, status: "skipped", detail: reason, ended: now };
      }).pipe(Effect.andThen(log(name, Effect.logInfo(`step ${id}: skipped, ${reason}`)))),
    // "latest" becomes the version reached. An Item already there did not change.
    reached: (name, item, at) =>
      machine(name, (m) => ({
        ...m,
        items: m.items.map((i) =>
          i.name !== item ? i : { ...i, to: at, changes: i.status === "failed" || i.from !== at },
        ),
      })).pipe(Effect.andThen(log(name, Effect.logInfo(`${item} reached ${at}`)))),
    finish: (name, outcome) =>
      machine(name, (m, now) => ({
        ...m,
        status: m.status === "failed" ? "failed" : outcome,
        ended: m.ended ?? now,
      })).pipe(Effect.andThen(log(name, Effect.logInfo(`finished: ${outcome}`)))),
    // A Check or Apply still going when the Ship ends was stopped (Ctrl-C or
    // an error). Machines waiting between them keep their state.
    end: Effect.gen(function* () {
      yield* update(({ resolving: _, ...state }, now) => ({
        ...state,
        ended: now,
        machines: state.machines.map((m) =>
          m.status === "running" || m.status === "checking"
            ? {
                ...m,
                status: "failed",
                detail: "stopped",
                ended: now,
                items: m.items.map((i) =>
                  i.status === "running"
                    ? { ...i, status: "failed", detail: "stopped", ended: now }
                    : i,
                ),
              }
            : m,
        ),
      }));
      return snapshot.state;
    }),
  };
  return { ledger, store };
});

// 4.2s, 48.2s, 5m 07s, 1h 02m.
export const duration = (ms: number): string => {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
