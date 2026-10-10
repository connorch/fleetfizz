// What Gather learns about one Machine. The remote script prints one
// `ff-state <json>` line per Fact; `assembleState` folds them into a
// MachineState for the planner.
import * as Schema from "effect/Schema";

import type { InstallRecord } from "./record.ts";

// `vp list --global --json`, the fields fleetfizz reads.
export const GlobalEntry = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  platform: Schema.optionalKey(Schema.Struct({ node: Schema.optionalKey(Schema.String) })),
});
export type GlobalEntry = typeof GlobalEntry.Type;

export const InstallRecordSchema = Schema.Struct({
  commit: Schema.String,
  path: Schema.String,
  install: Schema.String,
  files: Schema.Record(Schema.String, Schema.String),
  outputs: Schema.Record(Schema.String, Schema.String),
});

export const Fact = Schema.Union([
  Schema.Struct({ fact: Schema.Literal("home"), path: Schema.String }),
  // version is null when `vp` is not on PATH.
  Schema.Struct({
    fact: Schema.Literal("vp"),
    version: Schema.NullOr(Schema.String),
    path: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ fact: Schema.Literal("node"), version: Schema.NullOr(Schema.String) }),
  Schema.Struct({ fact: Schema.Literal("globals"), list: Schema.Array(GlobalEntry) }),
  Schema.Struct({
    fact: Schema.Literal("cloneRoot"),
    path: Schema.String,
    present: Schema.Boolean,
  }),
  Schema.Struct({
    fact: Schema.Literal("repo"),
    name: Schema.String,
    present: Schema.Boolean,
    head: Schema.optionalKey(Schema.String),
    origin: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    fact: Schema.Literal("records"),
    records: Schema.Record(Schema.String, InstallRecordSchema),
  }),
  // fingerprint is null when the Output path does not exist.
  Schema.Struct({
    fact: Schema.Literal("output"),
    repo: Schema.String,
    path: Schema.String,
    fingerprint: Schema.NullOr(Schema.String),
  }),
]);
export type Fact = typeof Fact.Type;

export interface RepoState {
  readonly present: boolean;
  readonly head?: string;
  readonly origin?: string;
}

export interface MachineState {
  readonly home?: string;
  readonly vp?: { readonly version: string | null; readonly path?: string };
  readonly node?: string | null;
  readonly globals: ReadonlyArray<GlobalEntry>;
  readonly cloneRoot?: { readonly path: string; readonly present: boolean };
  readonly repos: Readonly<Record<string, RepoState>>;
  readonly records: Readonly<Record<string, InstallRecord>>;
  // Keyed by repo name, then Output path.
  readonly outputs: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
}

export const emptyState: MachineState = { globals: [], repos: {}, records: {}, outputs: {} };

export const assembleState = (facts: ReadonlyArray<Fact>): MachineState => {
  let state: MachineState = emptyState;
  for (const fact of facts) {
    switch (fact.fact) {
      case "home":
        state = { ...state, home: fact.path };
        break;
      case "vp":
        state = {
          ...state,
          vp:
            fact.path === undefined
              ? { version: fact.version }
              : { version: fact.version, path: fact.path },
        };
        break;
      case "node":
        state = { ...state, node: fact.version };
        break;
      case "globals":
        state = { ...state, globals: fact.list };
        break;
      case "cloneRoot":
        state = { ...state, cloneRoot: { path: fact.path, present: fact.present } };
        break;
      case "repo": {
        const repo: RepoState = {
          present: fact.present,
          ...(fact.head === undefined ? {} : { head: fact.head }),
          ...(fact.origin === undefined ? {} : { origin: fact.origin }),
        };
        state = { ...state, repos: { ...state.repos, [fact.name]: repo } };
        break;
      }
      case "records":
        state = { ...state, records: fact.records };
        break;
      case "output":
        state = {
          ...state,
          outputs: {
            ...state.outputs,
            [fact.repo]: { ...state.outputs[fact.repo], [fact.path]: fact.fingerprint },
          },
        };
        break;
    }
  }
  return state;
};
