import * as Schema from "effect/Schema";
import * as semver from "semver";

// A Machine's OS family. Every other OS on the tailnet is not part of the Fleet.
export const Platform = Schema.Literals(["darwin", "linux"]);
export type Platform = typeof Platform.Type;

// Where a config entry applies. Fields combine with AND; an unset field means every one.
// Field descriptions are key annotations, so they reach editors through
// schema.json and the docs' generated reference (apps/cli/src/reference.ts)
// without replacing a value's own description, which its errors print.
export const Targeting = {
  platforms: Schema.optionalKey(Schema.NonEmptyArray(Platform)).annotateKey({
    description: "`darwin`, `linux`, or both.",
  }),
  machines: Schema.optionalKey(Schema.NonEmptyArray(Schema.NonEmptyString)).annotateKey({
    description: "Machine names from `machines`.",
  }),
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

// The built-in Providers, each a top-level config key. Their order is only
// the tie-break when dependsOn leaves two Providers unordered.
export const PROVIDER_NAMES = ["vp", "repos"] as const;
export const ProviderName = Schema.Literals(PROVIDER_NAMES);
export type ProviderName = typeof ProviderName.Type;

// A package.json semver spec (ADR 0006):
// - "*": install when missing, never upgrade.
// - "latest": install or upgrade to the newest version on every Ship.
// - a semver Range ("^59.25.4", "1.2.3"): leave inside, install the newest
//   match when below or missing, ask when above.
export const Range = Schema.NonEmptyString.check(
  Schema.makeFilter((range) => range === "latest" || semver.validRange(range) !== null, {
    title: "Range",
    description:
      'a semver range (leave inside it, install below it, ask above it), "*" (install when missing, never upgrade), or "latest" (upgrade to the newest on every Ship)',
  }),
);

export const TrackedRepo = Schema.Struct({
  ...Targeting,
  origin: Origin.annotateKey({ description: "The GitHub `owner/repo`." }),
  ref: Ref.annotateKey({ description: "A branch, or a full 40-character commit SHA to pin it." }),
  install: Schema.NonEmptyString.annotateKey({
    description: "The Install Command, run in a login shell inside the Managed Clone.",
  }),
  name: Schema.optionalKey(Schema.NonEmptyString).annotateKey({
    description: "Names the clone's directory and the repo in output. Default: `<owner>-<repo>`.",
  }),
  // Their fingerprints are recorded, so a hand install shows as a change.
  outputs: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)).annotateKey({
    description:
      "Paths outside the clone the Install Command produces. If one changes by hand, the repo reinstalls.",
  }),
  files: Schema.optionalKey(Schema.Record(Schema.NonEmptyString, Schema.String)).annotateKey({
    description:
      "Gitignored files written into the clone before every install, keyed by path. Never secrets.",
  }),
});
export type TrackedRepo = typeof TrackedRepo.Type;

// A Global: its Range, or its Range with its own Targeting.
export const Global = Schema.Union([Range, Schema.Struct({ ...Targeting, range: Range })]);
export type Global = typeof Global.Type;

// Packages a Ship manages through other vp keys (or pins itself), so they
// cannot be Globals too.
const NOT_GLOBALS: Readonly<Record<string, string>> = {
  node: "set Node with vp.node",
  "vite-plus": "set vp with vp.version",
  fleetfizz: "a Ship installs the fleetfizz that ships",
};

export const VpSection = Schema.Struct({
  ...Targeting,
  dependsOn: Schema.optionalKey(Schema.Array(ProviderName)).annotateKey({
    description: "Providers whose Items must succeed on a Machine before vp changes there.",
  }),
  // Exact pins are recommended for vp and Node: a change affects every tool.
  version: Schema.optionalKey(Range).annotateKey({
    description: "The vp version. Pin it exactly.",
  }),
  node: Schema.optionalKey(Range).annotateKey({
    description: "The default Node version. Pin it exactly.",
  }),
  // Global package name -> Range, or { range, platforms?, machines? }.
  globals: Schema.optionalKey(
    Schema.Record(Schema.NonEmptyString, Global).check(
      Schema.makeFilter(
        (globals) => {
          const name = Object.keys(globals).find((n) => n in NOT_GLOBALS);
          return name === undefined || `"${name}" is not a Global: ${NOT_GLOBALS[name]}`;
        },
        { title: "Globals", description: "npm packages other than node, vite-plus, and fleetfizz" },
      ),
    ),
  ).annotateKey({
    description:
      "Global packages, each with a Range, or `{ range, platforms?, machines? }` to target one.",
  }),
});
export type VpSection = typeof VpSection.Type;

export const DEFAULT_CLONE_ROOT = "~/.local/share/fleetfizz/clones";

export const MachineSettings = Schema.Struct({
  // The Clone Root.
  clones: Schema.optionalKey(Schema.NonEmptyString).annotateKey({
    description: `Where this Machine keeps its Managed Clones. \`~\` expands on that Machine. Default: \`${DEFAULT_CLONE_ROOT}\`.`,
  }),
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
  // Every name must exist on the tailnet, and the Starting Machine must be one of them.
  machines: Schema.Record(Schema.NonEmptyString, MachineSettings)
    .check(
      Schema.makeFilter((machines) => Object.keys(machines).length > 0, {
        title: "Fleet",
        description: "at least one Machine",
      }),
    )
    .annotateKey({
      description:
        "The Fleet, keyed by each Machine's tailnet name. A tailnet member that is not listed is not part of the Fleet.",
    }),
  repos: Schema.optionalKey(Schema.Array(TrackedRepo)).annotateKey({
    description:
      "Each Tracked Repo is cloned on every targeted Machine and installed from its origin ref.",
  }),
  vp: Schema.optionalKey(VpSection).annotateKey({ description: "The vite-plus toolchain." }),
});
export type FleetConfig = typeof FleetConfig.Type;

// The default Tracked Repo name: "<owner>-<repo>".
export const repoName = (repo: Pick<TrackedRepo, "origin" | "name">): string =>
  repo.name ?? repo.origin.replace("/", "-");

// The npm package name of this tool, which a Ship pins implicitly (ADR 0008).
export const SELF_PACKAGE = "fleetfizz";
