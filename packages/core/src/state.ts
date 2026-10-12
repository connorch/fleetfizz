// What the Check learns about one Machine. The remote script prints one
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
  // Printed last, so a Check cut off midway is detected.
  Schema.Struct({ fact: Schema.Literal("end") }),
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
    fact: Schema.Literal("record"),
    name: Schema.String,
    record: InstallRecordSchema,
  }),
  // The Machine's copy of the config, base64 so one line carries it (ADR 0008).
  Schema.Struct({
    fact: Schema.Literal("config"),
    present: Schema.Boolean,
    base64: Schema.optionalKey(Schema.String),
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
  // True only when the Check script ran to its end.
  readonly complete: boolean;
  readonly home?: string;
  readonly vp?: { readonly version: string | null; readonly path?: string };
  readonly node?: string | null;
  readonly globals: ReadonlyArray<GlobalEntry>;
  readonly cloneRoot?: { readonly path: string; readonly present: boolean };
  readonly repos: Readonly<Record<string, RepoState>>;
  readonly records: Readonly<Record<string, InstallRecord>>;
  // Keyed by repo name, then Output path.
  readonly outputs: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
  // The text of the Machine's config, or undefined when it has none.
  readonly config?: string;
}

export const emptyState: MachineState = {
  complete: false,
  globals: [],
  repos: {},
  records: {},
  outputs: {},
};

const decodeBase64 = (base64: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));

export const assembleState = (facts: ReadonlyArray<Fact>): MachineState => {
  let state: MachineState = emptyState;
  for (const fact of facts) {
    switch (fact.fact) {
      case "home":
        state = { ...state, home: fact.path };
        break;
      case "end":
        state = { ...state, complete: true };
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
      case "record":
        state = { ...state, records: { ...state.records, [fact.name]: fact.record } };
        break;
      case "config":
        if (fact.present && fact.base64 !== undefined) {
          state = { ...state, config: decodeBase64(fact.base64) };
        }
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
