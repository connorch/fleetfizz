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
// the tie-break when dependsOn leaves two Providers unordered: packages come
// before repos, whose array section cannot declare dependsOn, so an Install
// Command can use a Formula installed in the same Ship.
export const PROVIDER_NAMES = ["vp", "brew", "cask", "repos"] as const;
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

// The package managers vp keeps a default version of, each its own vp key.
export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

// Packages a Ship manages through other vp keys (or pins itself), and the
// names of vp's implicit Items, so they cannot be Globals too.
const NOT_GLOBALS: Readonly<Record<string, string>> = {
  vp: "the vp Item is vp itself; set it with vp.version",
  mode: "the mode Item is vp's managed mode",
  node: "set Node with vp.node",
  ...Object.fromEntries(PACKAGE_MANAGERS.map((pm) => [pm, `set ${pm} with vp.${pm}`])),
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
  // Each package manager's default version.
  npm: Schema.optionalKey(Range).annotateKey({ description: "The default npm version." }),
  pnpm: Schema.optionalKey(Range).annotateKey({ description: "The default pnpm version." }),
  yarn: Schema.optionalKey(Range).annotateKey({ description: "The default Yarn version." }),
  bun: Schema.optionalKey(Range).annotateKey({ description: "The default Bun version." }),
  // Global package name -> Range, or { range, platforms?, machines? }.
  globals: Schema.optionalKey(
    Schema.Record(Schema.NonEmptyString, Global).check(
      Schema.makeFilter(
        (globals) => {
          const name = Object.keys(globals).find((n) => n in NOT_GLOBALS);
          return name === undefined || `"${name}" is not a Global: ${NOT_GLOBALS[name]}`;
        },
        {
          title: "Globals",
          description:
            "npm packages other than vp, node, a package manager, vite-plus, and fleetfizz",
        },
      ),
    ),
  ).annotateKey({
    description:
      "Global packages, each with a Range, or `{ range, platforms?, machines? }` to target one.",
  }),
});
export type VpSection = typeof VpSection.Type;

// A Formula's or Cask's Range. Homebrew installs only its newest version:
// - "*": install when missing, never upgrade.
// - "latest": brew update, then upgrade on every Ship.
export const HomebrewRange = Schema.Literals(["*", "latest"]).annotate({
  description:
    '"*" (install when missing, never upgrade) or "latest" (brew update, then upgrade on every Ship)',
});
export type HomebrewRange = typeof HomebrewRange.Type;

// Formula or Cask name -> Range, or { range, platforms?, machines? }. A
// tapped name ("oven-sh/bun/bun") taps on install.
const HomebrewItems = Schema.Record(
  Schema.NonEmptyString,
  Schema.Union([HomebrewRange, Schema.Struct({ ...Targeting, range: HomebrewRange })]),
);

// A brew or cask section; `noun` names its Items in their key description.
const homebrewSection = (items: typeof HomebrewItems, noun: string) =>
  Schema.Struct({
    ...Targeting,
    dependsOn: Schema.optionalKey(Schema.Array(ProviderName)).annotateKey({
      description: "Providers whose Items must succeed on a Machine before this one changes there.",
    }),
    items: Schema.optionalKey(items).annotateKey({
      description: `${noun}, each \`"*"\` or \`"latest"\`, or \`{ range, platforms?, machines? }\` to target one. A tapped name (\`owner/tap/name\`) taps on install.`,
    }),
  });

// Formulae. Homebrew itself is the implicit `brew:brew` Item, so no Formula takes its name.
export const BrewSection = homebrewSection(
  HomebrewItems.check(
    Schema.makeFilter((items) => !Object.hasOwn(items, "brew") || '"brew" is Homebrew itself', {
      title: "Formulae",
      description: "Formulae other than brew",
    }),
  ),
  "Formulae",
);

// Casks, macOS only. Always after brew.
export const CaskSection = homebrewSection(HomebrewItems, "Casks");

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
  brew: Schema.optionalKey(BrewSection).annotateKey({
    description: "Homebrew Formulae. Needs Homebrew on the Machine; a Ship never installs it.",
  }),
  cask: Schema.optionalKey(CaskSection).annotateKey({
    description: "Homebrew Casks, macOS only. Needs Homebrew on the Machine.",
  }),
});
export type FleetConfig = typeof FleetConfig.Type;

// The default Tracked Repo name: "<owner>-<repo>".
export const repoName = (repo: Pick<TrackedRepo, "origin" | "name">): string =>
  repo.name ?? repo.origin.replace("/", "-");

// The npm package name of this tool, which a Ship pins implicitly (ADR 0008).
export const SELF_PACKAGE = "fleetfizz";
