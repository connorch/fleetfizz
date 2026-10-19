// What the Check learns about one Machine. The remote script prints one
// `ff-state <json>` line per Fact; `assembleState` folds them into a
// MachineState. Facts with a "provider" belong to that Provider, which
// parses them itself.
import * as Schema from "effect/Schema";

const EngineFact = Schema.Union([
  Schema.Struct({ fact: Schema.Literal("home"), path: Schema.String }),
  // Printed last, so a Check cut off midway is detected.
  Schema.Struct({ fact: Schema.Literal("end") }),
  // The Machine's copy of the config, base64 so one line carries it, with
  // its sha256 (ADR 0008).
  Schema.Struct({
    fact: Schema.Literal("config"),
    present: Schema.Boolean,
    sha: Schema.optionalKey(Schema.String),
    base64: Schema.optionalKey(Schema.String),
  }),
  // The config's own Install Record, as stored on the Machine.
  Schema.Struct({ fact: Schema.Literal("configRecord"), record: Schema.Unknown }),
  // One Item's Install Record, as stored on the Machine.
  Schema.Struct({
    fact: Schema.Literal("record"),
    provider: Schema.String,
    item: Schema.String,
    record: Schema.Unknown,
  }),
]);
const ProviderFact = Schema.Struct({ provider: Schema.String });

// The version an Item is at now, printed by `ff_at` during a Check and after
// an Apply Step, so the Ledger shows what a Step reached ("latest" -> 1.8.1).
// A Provider Fact: the Check routes it to its Provider like any other.
export const AtFact = Schema.Struct({
  provider: Schema.String,
  fact: Schema.Literal("at"),
  item: Schema.String,
  at: Schema.String,
});

const decodeEngineFact = Schema.decodeUnknownOption(EngineFact);
const decodeProviderFact = Schema.decodeUnknownOption(ProviderFact);

export interface MachineState {
  // True only when the Check script ran to its end.
  readonly complete: boolean;
  readonly home?: string;
  // The Machine's config and its sha256, or undefined when it has none.
  readonly config?: { readonly text: string; readonly sha: string };
  // The config's Install Record, undecoded.
  readonly configRecord?: unknown;
  // Install Records by Provider, then Item, undecoded.
  readonly records: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  // Each Provider's Facts, in the order printed.
  readonly facts: Readonly<Record<string, ReadonlyArray<unknown>>>;
}

export const emptyState: MachineState = { complete: false, records: {}, facts: {} };

const decodeBase64 = (base64: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));

export const assembleState = (facts: ReadonlyArray<unknown>): MachineState => {
  let state: MachineState = emptyState;
  for (const raw of facts) {
    const fact = decodeEngineFact(raw);
    if (fact._tag === "Some") {
      const f = fact.value;
      switch (f.fact) {
        case "home":
          state = { ...state, home: f.path };
          break;
        case "end":
          state = { ...state, complete: true };
          break;
        case "config":
          if (f.present && f.base64 !== undefined && f.sha !== undefined)
            state = { ...state, config: { text: decodeBase64(f.base64), sha: f.sha } };
          break;
        case "configRecord":
          state = { ...state, configRecord: f.record };
          break;
        case "record":
          state = {
            ...state,
            records: {
              ...state.records,
              [f.provider]: { ...state.records[f.provider], [f.item]: f.record },
            },
          };
          break;
      }
      continue;
    }
    const owned = decodeProviderFact(raw);
    if (owned._tag === "Some") {
      const { provider } = owned.value;
      state = {
        ...state,
        facts: { ...state.facts, [provider]: [...(state.facts[provider] ?? []), raw] },
      };
    }
  }
  return state;
};
