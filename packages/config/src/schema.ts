import * as Schema from "effect/Schema";

// A Machine's OS family. Every other OS on the tailnet is not part of the Fleet.
export const Platform = Schema.Literals(["darwin", "linux"]);

// Where a config entry applies. Fields combine with AND; an unset field means every one.
const Targeting = {
  platforms: Schema.optionalKey(Schema.Array(Platform)),
  machines: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
};

const TrackedRepo = Schema.Struct({
  ...Targeting,
  // "owner/repo" on GitHub.
  origin: Schema.NonEmptyString,
  // A branch name, or a full 40-character commit SHA (a Pin).
  ref: Schema.NonEmptyString,
  // The Install Command, run in a login shell with cwd = the Managed Clone.
  install: Schema.NonEmptyString,
  // Default: "<owner>-<repo>". Used for the Managed Clone directory and in output.
  name: Schema.optionalKey(Schema.NonEmptyString),
});

const VpSection = Schema.Struct({
  ...Targeting,
  // Ranges. Exact pins are recommended for vp and Node.
  version: Schema.optionalKey(Schema.NonEmptyString),
  node: Schema.optionalKey(Schema.NonEmptyString),
  globals: Schema.optionalKey(Schema.Record(Schema.String, Schema.NonEmptyString)),
});

const MachineSettings = Schema.Struct({
  // The Clone Root. "~" expands on that Machine. Default: ~/.local/share/fleetfizz/clones.
  clones: Schema.optionalKey(Schema.NonEmptyString),
});

// The whole fleet.config.jsonc. The schema's Encoded type is what a user writes.
export const FleetConfig = Schema.Struct({
  $schema: Schema.optionalKey(Schema.String),
  machines: Schema.optionalKey(Schema.Record(Schema.String, MachineSettings)),
  repos: Schema.optionalKey(Schema.Array(TrackedRepo)),
  vp: Schema.optionalKey(VpSection),
});

export type FleetConfig = typeof FleetConfig.Type;
