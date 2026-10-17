// What the Check learns about one Machine. The remote script prints one
// `ff-state <json>` line per Fact; `assembleState` folds them into a
// MachineState. Facts with a "provider" belong to that Provider, which
// parses them itself.
import * as Schema from "effect/Schema";

const EngineFact = Schema.Union([
  Schema.Struct({ fact: Schema.Literal("home"), path: Schema.String }),
  // Printed last, so a Check cut off midway is detected.
  Schema.Struct({ fact: Schema.Literal("end") }),
  // The Machine's copy of the config, base64 so one line carries it (ADR 0008).
  Schema.Struct({
    fact: Schema.Literal("config"),
    present: Schema.Boolean,
    base64: Schema.optionalKey(Schema.String),
  }),
  // One Item's Install Record, as stored on the Machine.
  Schema.Struct({
    fact: Schema.Literal("record"),
    provider: Schema.String,
    item: Schema.String,
    record: Schema.Unknown,
  }),
]);
const ProviderFact = Schema.Struct({ provider: Schema.String });

const decodeEngineFact = Schema.decodeUnknownOption(EngineFact);
const decodeProviderFact = Schema.decodeUnknownOption(ProviderFact);

export interface MachineState {
  // True only when the Check script ran to its end.
  readonly complete: boolean;
  readonly home?: string;
  // The text of the Machine's config, or undefined when it has none.
  readonly config?: string;
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
          if (f.present && f.base64 !== undefined)
            state = { ...state, config: decodeBase64(f.base64) };
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
