import * as Schema from "effect/Schema";
import * as semver from "semver";

// A Machine's OS family. Every other OS on the tailnet is not part of the Fleet.
export const Platform = Schema.Literals(["darwin", "linux"]);
export type Platform = typeof Platform.Type;

// Where a config entry applies. Fields combine with AND; an unset field means every one.
const Targeting = {
  platforms: Schema.optionalKey(Schema.NonEmptyArray(Platform)),
  machines: Schema.optionalKey(Schema.NonEmptyArray(Schema.NonEmptyString)),
};

// "owner/repo" on GitHub.
export const Origin = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, {
    title: "GitHub origin",
    description: 'a GitHub "owner/repo"',
  }),
);

// A branch name, or a full 40-character commit SHA (a Pin).
export const Ref = Schema.NonEmptyString;
export const isPin = (ref: string): boolean => /^[0-9a-f]{40}$/.test(ref);

// A package.json semver spec: "^59.25.4", "1.2.3", "*", "latest".
export const Range = Schema.NonEmptyString.check(
  Schema.makeFilter((range) => range === "latest" || semver.validRange(range) !== null, {
    title: "Range",
    description: 'a semver range, "*", or "latest"',
  }),
);

export const TrackedRepo = Schema.Struct({
  ...Targeting,
  origin: Origin,
  ref: Ref,
  // The Install Command, run in a login shell with cwd = the Managed Clone.
  install: Schema.NonEmptyString,
  // Default: "<owner>-<repo>". Names the Managed Clone directory and the repo in output.
  name: Schema.optionalKey(Schema.NonEmptyString),
  // Paths outside the Managed Clone that the Install Command produces. Their
  // fingerprints are recorded; a change (a hand install) reinstalls.
  outputs: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
  // Gitignored files written into the Managed Clone before every install,
  // keyed by path relative to the clone. Public config, never secrets.
  files: Schema.optionalKey(Schema.Record(Schema.NonEmptyString, Schema.String)),
});
export type TrackedRepo = typeof TrackedRepo.Type;

export const VpSection = Schema.Struct({
  ...Targeting,
  // Exact pins are recommended for vp and Node: a change affects every tool.
  version: Schema.optionalKey(Range),
  node: Schema.optionalKey(Range),
  // Global package name -> Range.
  globals: Schema.optionalKey(Schema.Record(Schema.NonEmptyString, Range)),
});
export type VpSection = typeof VpSection.Type;

export const MachineSettings = Schema.Struct({
  // The Clone Root. "~" expands on that Machine. Default: ~/.local/share/fleetfizz/clones.
  clones: Schema.optionalKey(Schema.NonEmptyString),
});

// The whole config.jsonc, exactly as a user writes it.
export const FleetConfig = Schema.Struct({
  $schema: Schema.optionalKey(Schema.String),
  // Written by every Ship, never by hand: when and from which Machine this
  // copy was last shipped, and per Machine, when a Ship of this config last
  // reached it. A Ship refuses to overwrite a copy that was shipped to its
  // Machine more recently than this config reached it (ADR 0008).
  shippedAt: Schema.optionalKey(Schema.String),
  shippedFrom: Schema.optionalKey(Schema.NonEmptyString),
  shippedTo: Schema.optionalKey(Schema.Record(Schema.NonEmptyString, Schema.String)),
  // The Fleet: keyed by Machine name, every name must exist on the tailnet,
  // and the Starting Machine must be one of them.
  machines: Schema.Record(Schema.NonEmptyString, MachineSettings).check(
    Schema.makeFilter((machines) => Object.keys(machines).length > 0, {
      title: "Fleet",
      description: "at least one Machine",
    }),
  ),
  repos: Schema.optionalKey(Schema.Array(TrackedRepo)),
  vp: Schema.optionalKey(VpSection),
});
export type FleetConfig = typeof FleetConfig.Type;

// The default Tracked Repo name: "<owner>-<repo>".
export const repoName = (repo: Pick<TrackedRepo, "origin" | "name">): string =>
  repo.name ?? repo.origin.replace("/", "-");

export const DEFAULT_CLONE_ROOT = "~/.local/share/fleetfizz/clones";

// The npm package name of this tool, which a Ship pins implicitly (ADR 0008).
export const SELF_PACKAGE = "fleetfizz";
