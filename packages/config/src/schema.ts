import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
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
// the tie-break when dependsOn leaves two Providers unordered: Shared Files
// come first and packages before repos, so an Install Command can read a
// Shared File or use a Formula from the same Ship without a dependsOn.
export const PROVIDER_NAMES = ["files", "vp", "brew", "cask", "repos"] as const;
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

// The Install Command, origin, and ref of a Tracked Repo. Its name is its
// key in `repos.items`, which names its Managed Clone and Install Record.
export const TrackedRepo = Schema.Struct({
  ...Targeting,
  origin: Origin.annotateKey({ description: "The GitHub `owner/repo`." }),
  ref: Ref.annotateKey({ description: "A branch, or a full 40-character commit SHA to pin it." }),
  install: Schema.NonEmptyString.annotateKey({
    description: "The Install Command, run in a login shell inside the Managed Clone.",
  }),
  // Their fingerprints are recorded, so a hand install shows as a change.
  outputs: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)).annotateKey({
    description:
      "Paths outside the clone the Install Command produces. If one changes by hand, the repo reinstalls.",
  }),
});
export type TrackedRepo = typeof TrackedRepo.Type;

// An entry that may also be written as one string with no Targeting
// (`"vercel": "^59.25.4"`). The string decodes to the full entry, so
// everything after decoding sees one shape.
const withShorthand = <Fields extends Schema.Struct.Fields, Text extends string>(
  entry: Schema.Struct<Fields>,
  value: Schema.Codec<Text>,
  shorthand: {
    readonly decode: (text: Text) => Schema.Struct<Fields>["Type"];
    readonly encode: (entry: Schema.Struct<Fields>["Type"]) => Text;
  },
) =>
  // The object first, so encoding writes the full entry and keeps its Targeting.
  Schema.Union([
    entry,
    value.pipe(Schema.decodeTo(Schema.toType(entry), SchemaTransformation.transform(shorthand))),
  ]);

// One definition, or a list of Variants: whole definitions, each with its own
// Targeting. A Machine gets the first Variant that targets it (ADR 0014).
const variants = <S extends Schema.Top>(entry: S) =>
  Schema.Union([entry, Schema.NonEmptyArray(entry)]);

const dependsOn = Schema.optionalKey(Schema.Array(ProviderName)).annotateKey({
  description: "Providers whose Items must succeed on a Machine before this one changes there.",
});

// Every section's envelope: Targeting, dependsOn, the Provider's own
// settings, and `items`, keyed by Item name. The engine applies the
// Targeting and picks each Item's Variant.
const section = <Settings extends Schema.Struct.Fields, Items extends Schema.Top>(
  settings: Settings,
  items: Items,
  description: string,
) =>
  Schema.Struct({
    ...Targeting,
    dependsOn,
    ...settings,
    items: Schema.optionalKey(items).annotateKey({ description }),
  });

const VARIANTS = "or a list of Variants, of which a Machine gets the first that targets it";

// A Global: its Range, or its Range with its own Targeting.
export const Global = withShorthand(Schema.Struct({ ...Targeting, range: Range }), Range, {
  decode: (range) => ({ range }),
  encode: (global) => global.range,
});
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

export const VpSection = section(
  {
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
  },
  Schema.Record(Schema.NonEmptyString, variants(Global)).check(
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
  `Globals, keyed by package. Each is a Range, \`{ range, platforms?, machines? }\` to target it, ${VARIANTS}.`,
);
export type VpSection = typeof VpSection.Type;

// A Formula's or Cask's Range. Homebrew installs only its newest version:
// - "*": install when missing, never upgrade.
// - "latest": brew update, then upgrade on every Ship.
export const HomebrewRange = Schema.Literals(["*", "latest"]).annotate({
  description:
    '"*" (install when missing, never upgrade) or "latest" (brew update, then upgrade on every Ship)',
});
export type HomebrewRange = typeof HomebrewRange.Type;

// Formula or Cask name -> Range, or { range, platforms?, machines? }, or a
// list of Variants. A tapped name ("oven-sh/bun/bun") taps on install.
const HomebrewItems = Schema.Record(
  Schema.NonEmptyString,
  variants(
    withShorthand(Schema.Struct({ ...Targeting, range: HomebrewRange }), HomebrewRange, {
      decode: (range) => ({ range }),
      encode: (entry) => entry.range,
    }),
  ),
);

const homebrewDescription = (noun: string) =>
  `${noun}, keyed by name. Each is \`"*"\` or \`"latest"\`, \`{ range, platforms?, machines? }\` to target it, ${VARIANTS}. A tapped name (\`owner/tap/name\`) taps on install.`;

// Formulae. Homebrew itself is the implicit `brew:brew` Item, so no Formula takes its name.
export const BrewSection = section(
  {},
  HomebrewItems.check(
    Schema.makeFilter((items) => !Object.hasOwn(items, "brew") || '"brew" is Homebrew itself', {
      title: "Formulae",
      description: "Formulae other than brew",
    }),
  ),
  homebrewDescription("Formulae"),
);

// Casks, macOS only. Always after brew.
export const CaskSection = section({}, HomebrewItems, homebrewDescription("Casks"));

export const DEFAULT_CLONE_ROOT = "~/.local/share/fleetfizz/clones";

// Where a Machine keeps its Managed Clones: one path, or Variants of `{ path }`.
const CloneRoot = variants(
  withShorthand(
    Schema.Struct({ ...Targeting, path: Schema.NonEmptyString }),
    Schema.NonEmptyString,
    {
      decode: (path) => ({ path }),
      encode: (root) => root.path,
    },
  ),
);

export const ReposSection = section(
  {
    cloneRoot: Schema.optionalKey(CloneRoot).annotateKey({
      description: `Where a Machine keeps its Managed Clones: a path, or a list of \`{ path, platforms?, machines? }\` where a Machine gets the first that targets it. \`~\` expands on that Machine. Default: \`${DEFAULT_CLONE_ROOT}\`.`,
    }),
  },
  Schema.Record(Schema.NonEmptyString, variants(TrackedRepo)),
  `Tracked Repos, keyed by name, which names the Managed Clone and the \`repos:<name>\` Item. Each is \`{ origin, ref, install, ... }\`, ${VARIANTS}.`,
);
export type ReposSection = typeof ReposSection.Type;

// A path on a Machine: absolute, or under its home.
const HomePath = Schema.NonEmptyString.check(
  Schema.isPattern(/^(\/|~\/)./, {
    title: "path",
    description: "an absolute path, or one under ~",
  }),
);

// fleetfizz's own directories, which a Ship writes itself: a Shared File
// may not be one, hold one, or sit inside one.
const OWN_DIRS = ["~/.config/fleetfizz", "~/.local/state/fleetfizz"];
const SharedFilePath = HomePath.check(
  Schema.makeFilter(
    (path) => {
      const p = path.replace(/\/+$/, "");
      const dir = OWN_DIRS.find(
        (d) => p === "~" || d === p || d.startsWith(`${p}/`) || p.startsWith(`${d}/`),
      );
      return dir === undefined || `overlaps ${dir}, which a Ship writes itself`;
    },
    { title: "Shared File path", description: "a path outside fleetfizz's own directories" },
  ),
);

// A Shared File: a file or directory a Ship copies from the Starting Machine
// (ADR 0016). Its name is its key in `files.items`.
export const SharedFile = Schema.Struct({
  ...Targeting,
  path: SharedFilePath.annotateKey({
    description: "A file or directory, absolute or under `~`, which expands on each Machine.",
  }),
  exclude: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)).annotateKey({
    description:
      "Globs inside a directory that are neither copied nor deleted. One without a `/` matches a name at any depth. `.DS_Store` and `._*` are always excluded. Every Variant of one Shared File has the same exclude.",
  }),
});
export type SharedFile = typeof SharedFile.Type;

const sameExclude = (a: SharedFile, b: SharedFile) =>
  [...new Set(a.exclude ?? [])].toSorted().join("\n") ===
  [...new Set(b.exclude ?? [])].toSorted().join("\n");

export const FilesSection = section(
  {},
  Schema.Record(
    Schema.NonEmptyString,
    variants(
      withShorthand(SharedFile, SharedFilePath, {
        decode: (path) => ({ path }),
        encode: (file) => file.path,
      }),
    ),
  ).check(
    // A name names the Item's Install Record file and its Steps' markers, so
    // it is one path segment of letters, digits, ".", "_" and "-".
    // One exclude for every Variant, so the Starting Machine and a target
    // leave the same paths alone (a path only one side excluded would be
    // deleted, or copied and never seen again).
    Schema.makeFilter(
      (items) => {
        const badName = Object.keys(items).find(
          (n) => !/^[A-Za-z0-9._-]+$/.test(n) || n === "." || n === "..",
        );
        if (badName !== undefined)
          return `"${badName}": a Shared File's name uses only letters, digits, ., _ and -, and is not . or ..`;
        const name = Object.entries(items).find(
          ([, item]) => Array.isArray(item) && item.some((v) => !sameExclude(v, item[0])),
        )?.[0];
        return name === undefined || `"${name}": every Variant needs the same exclude`;
      },
      {
        title: "Shared Files",
        description:
          "names of letters, digits, ., _ and -, and one exclude across a Shared File's Variants",
      },
    ),
  ),
  `Shared Files, keyed by name, which names the \`files:<name>\` Item. Each is a path, \`{ path, exclude?, platforms?, machines? }\`, ${VARIANTS}.`,
);
export type FilesSection = typeof FilesSection.Type;

// The whole config.jsonc. Shorthands decode to their full entries, so
// `FleetConfig.Encoded` is the config as a user writes it.
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
  machines: Schema.Array(Schema.NonEmptyString)
    .check(
      Schema.isMinLength(1, { message: "list at least one Machine" }),
      Schema.isUnique({ message: "list each Machine once" }),
    )
    .annotateKey({
      description:
        "The Fleet: each Machine's tailnet name. A tailnet member that is not listed is not part of the Fleet.",
    }),
  files: Schema.optionalKey(FilesSection).annotateKey({
    description:
      "Files and directories copied from the Starting Machine to every targeted Machine. A directory is mirrored.",
  }),
  repos: Schema.optionalKey(ReposSection).annotateKey({
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

// The npm package name of this tool, which a Ship pins implicitly (ADR 0008).
export const SELF_PACKAGE = "fleetfizz";
