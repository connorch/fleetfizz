// The Ledger: what a Ship shows. One line per Machine in config order and,
// under it, one line per item that changes (vp, Node, a Global, a Tracked
// Repo). The full Ledger lists every item, changed or not, and the config copy.
//
//   connors-mac-studio   OK    up to date
//   connors-macbook-pro  OK    5m 07s
//       vp               1.0.0 -> 1.1.0      done          16.6s
//       connorch-t3code  3f1a2b0 -> 9e02bb1  installed   4m 50s
//
//   ok 2  skipped 0  failed 0  in 5m 12s
//
// The state is plain data, a Schema so `fizz report` can save it. Ship events
// update it through the `Ledger` interface, and view.tsx draws it, live or
// once. Notes (Questions, their answers, and other Fleet lines) are not part
// of that drawing: they print once, above it, as they happen.
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { MachinePlan, MachineState } from "@fleetfizz/core";
import { CONFIG_STEP, stepId, vpStepId } from "@fleetfizz/remote";

export const Note = Schema.Struct({
  kind: Schema.Literals(["ask", "answer", "info"]),
  text: Schema.String,
});
export type Note = typeof Note.Type;

// One thing on one Machine: shown as `from -> to`, `+ to` (new), or just
// `from` (no change). Repo commits are short SHAs.
const Item = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(["version", "repo", "config"]),
  from: Schema.optionalKey(Schema.String),
  to: Schema.optionalKey(Schema.String),
  // Why it changes when the version or commit alone does not say
  // ("never installed", "drift: ...", "reinstall").
  reason: Schema.optionalKey(Schema.String),
  // Planned to change, or changed during Apply (a fetch that moved a commit).
  changes: Schema.Boolean,
  status: Schema.Literals(["idle", "running", "ok", "failed", "skipped"]),
  // What a running item is doing: "fetching", "installing".
  doing: Schema.optionalKey(Schema.String),
  // Why it failed or was skipped.
  detail: Schema.optionalKey(Schema.String),
  output: Schema.optionalKey(Schema.Array(Schema.String)),
  // The Apply step ids that move this item.
  steps: Schema.Array(Schema.String),
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
  started: Schema.optionalKey(Schema.Number),
  ended: Schema.optionalKey(Schema.Number),
});
export type MachineEntry = typeof MachineEntry.Type;

export const LedgerState = Schema.Struct({
  from: Schema.String,
  dryRun: Schema.Boolean,
  notes: Schema.Array(Note),
  machines: Schema.Array(MachineEntry),
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
  readonly checked: (name: string) => Effect.Effect<void>;
  readonly skip: (name: string, reason: string) => Effect.Effect<void>;
  // The Machine failed as a whole: the first line is why, the rest is output.
  readonly fail: (name: string, lines: ReadonlyArray<string>) => Effect.Effect<void>;
  readonly plan: (name: string, plan: MachinePlan, state: MachineState) => Effect.Effect<void>;
  readonly start: (name: string) => Effect.Effect<void>;
  readonly stepStarted: (name: string, id: string) => Effect.Effect<void>;
  readonly stepDone: (name: string, id: string, result: StepResult) => Effect.Effect<void>;
  // A Tracked Repo's commit after its fetch.
  readonly fetched: (name: string, repo: string, head: string) => Effect.Effect<void>;
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

const short = (sha: string | undefined) => (sha === undefined ? undefined : sha.slice(0, 7));

const FETCH = ":fetch";
const doingOf = (id: string) =>
  id === CONFIG_STEP ? "copying" : id.endsWith(FETCH) ? "fetching" : "installing";

// Every item on one Machine: what it has now (from the Check), with the plan's
// changes, skips, and failures laid over it.
export const itemsOf = (p: MachinePlan, state: MachineState): Item[] => {
  // Keyed by kind too: a Tracked Repo may share a name with a Global.
  const items = new Map<string, Item>();
  const key = (kind: Item["kind"], name: string) => `${kind}:${name}`;
  const base = (name: string, from?: string, kind: Item["kind"] = "version"): Item => ({
    name,
    kind,
    ...(from === undefined ? {} : { from }),
    changes: false,
    status: "idle",
    steps: [],
  });
  const set = (name: string, change: (item: Item) => Item, kind: Item["kind"] = "version") =>
    items.set(key(kind, name), change(items.get(key(kind, name)) ?? base(name, undefined, kind)));
  // `from` null means nothing is installed now; undefined keeps the checked one.
  const plans =
    (id: string, to: string, from?: string | null, reason?: string) =>
    ({ from: checked, ...item }: Item): Item => {
      const now = from === undefined ? checked : (from ?? undefined);
      return {
        ...item,
        ...(now === undefined ? {} : { from: now }),
        to,
        ...(reason === undefined ? {} : { reason }),
        changes: true,
        steps: [...item.steps, id],
      };
    };

  const vp = state.vp?.version ?? undefined;
  items.set(key("version", "vp"), base("vp", vp));
  if (state.node != null) items.set(key("version", "node"), base("node", state.node));
  for (const g of state.globals) items.set(key("version", g.name), base(g.name, g.version));

  for (const step of p.vp) {
    const id = vpStepId(step);
    switch (step.kind) {
      case "bootstrap":
        set("vp", plans(id, "latest", null));
        break;
      case "vp":
      case "node":
        set(step.kind, plans(id, step.version, step.from));
        break;
      case "reinstall":
        set(step.name, plans(id, step.version, step.version, "reinstall"));
        break;
      case "globals":
        for (const pkg of step.packages) set(pkg.name, plans(id, pkg.version, pkg.from ?? null));
        break;
    }
  }
  for (const repo of p.repos) {
    const from = short(state.records[repo.name]?.commit);
    const to = short(repo.head);
    items.set(key("repo", repo.name), {
      name: repo.name,
      kind: "repo",
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
      ...(repo.decision.run ? { reason: repo.decision.reason } : {}),
      changes: repo.decision.run,
      status: "idle",
      steps: [stepId(repo.name, "fetch"), stepId(repo.name, "install")],
    });
  }
  for (const s of p.skipped) set(s.what, (i) => ({ ...i, status: "skipped", detail: s.reason }));
  // A repo that failed planning has no item yet and gets one of its own.
  for (const f of p.failures) {
    const kind = f.section === "repos" ? "repo" : "version";
    set(f.what, (i) => ({ ...i, changes: true, status: "failed", detail: f.reason }), kind);
  }
  items.set(key("config", CONFIG_STEP), {
    name: CONFIG_STEP,
    kind: "config",
    changes: false,
    status: "idle",
    steps: [CONFIG_STEP],
  });
  return [...items.values()];
};

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

export const tally = (state: LedgerState) => {
  const outcomes = state.machines.map((m) => outcomeOf(m, state.dryRun));
  const n = (o: Outcome) => outcomes.filter((x) => x === o).length;
  return { ok: n("ok"), skipped: n("skipped"), failed: n("failed") };
};

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
      items: m.items.map((i) => (i.steps.includes(id) ? change(i, now) : i)),
    }));

  const store: LedgerStore = {
    get: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tick: update((state) => state),
  };
  const ledger: Ledger = {
    note: Effect.fn("ledger.note")(function* (kind, text) {
      yield* update((state) => ({ ...state, notes: [...state.notes, { kind, text }] }));
      yield* input.print({ kind, text });
    }),
    checked: (name) => machine(name, (m) => ({ ...m, status: "waiting" })),
    skip: (name, reason) => machine(name, (m) => ({ ...m, status: "skipped", detail: reason })),
    fail: (name, [reason = "failed", ...output]) =>
      machine(name, (m, now) => ({
        ...m,
        status: "failed",
        detail: reason,
        ...(output.length === 0 ? {} : { output }),
        ended: now,
      })),
    plan: (name, p, state) =>
      machine(name, (m) => ({ ...m, status: "planned", items: itemsOf(p, state) })),
    start: (name) => machine(name, (m, now) => ({ ...m, status: "running", started: now })),
    // An item keeps its first failure: a later Step for the same item (vp's
    // upgrade after its installer) must not hide it.
    stepStarted: (name, id) =>
      items(name, id, (item, now) =>
        item.status === "failed"
          ? item
          : {
              ...item,
              // Every Ship copies the config and fetches every repo; neither is a
              // change on its own.
              changes: item.changes || !(id === CONFIG_STEP || id.endsWith(FETCH)),
              status: "running",
              doing: doingOf(id),
              started: item.started ?? now,
            },
      ),
    stepDone: (name, id, result) =>
      items(name, id, (item, now) => {
        if (item.status === "failed") return item;
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
        const { doing: _, ...rest } = item;
        // A fetch is the first half of an install, which runs on.
        if (id.endsWith(FETCH))
          return item.changes ? item : { ...rest, status: "idle", ended: now };
        return { ...rest, status: "ok", ended: now };
      }),
    fetched: (name, repo, head) =>
      machine(name, (m) => ({
        ...m,
        items: m.items.map((i) =>
          i.kind === "repo" && i.name === repo
            ? // The fetch already moved the checkout, even if the install never runs.
              { ...i, to: head.slice(0, 7), changes: i.changes || head.slice(0, 7) !== i.from }
            : i,
        ),
      })),
    finish: (name, outcome) =>
      machine(name, (m, now) => ({
        ...m,
        status: m.status === "failed" ? "failed" : outcome,
        ended: m.ended ?? now,
      })),
    // A Check or Apply still going when the Ship ends was stopped (Ctrl-C or
    // an error). Machines waiting between them keep their state.
    end: Effect.gen(function* () {
      yield* update((state, now) => ({
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
