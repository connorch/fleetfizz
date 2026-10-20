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

// The package managers whose Globals a Ship keeps, each its own section.
export const PACKAGE_MANAGERS = ["vp", "npm", "bun", "pnpm"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

// The Providers with a config section, each a top-level config key. Their
// order is only the tie-break when dependsOn leaves two Providers unordered
// (ADR 0010): Homebrew first, then Shared Files, so a Shared File's `after`
// can use a Formula; then the package managers, so they find the Node a
// Formula or a Shared File set up, npm before the ones it can install; then
// skills and repos, so an Install Command can use any of them.
export const SECTION_NAMES = [
  "brew",
  "cask",
  "files",
  ...PACKAGE_MANAGERS,
  "skills",
  "repos",
] as const;
export const SectionName = Schema.Literals(SECTION_NAMES);
export type SectionName = typeof SectionName.Type;

// Every built-in Provider: the sections, then fleetfizz itself, which has no
// section (its version is the config's `version`) and runs last (ADR 0019).
export const PROVIDER_NAMES = [...SECTION_NAMES, "fleetfizz"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

// The npm package name of this tool, kept at the config's `version` on every
// Machine (ADR 0019).
export const SELF_PACKAGE = "fleetfizz";

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

const dependsOn = Schema.optionalKey(Schema.Array(SectionName)).annotateKey({
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

// Every package manager's section: its Globals, kept inside their Ranges
// with its own global install (ADR 0020). fleetfizz is not one of them: the
// config's `version` sets it.
export const GlobalsSection = section(
  {},
  Schema.Record(Schema.NonEmptyString, variants(Global)).check(
    Schema.makeFilter(
      (globals) =>
        !Object.hasOwn(globals, SELF_PACKAGE) ||
        `"${SELF_PACKAGE}" is not a Global: the config's "version" sets it`,
      { title: "Globals", description: `npm packages other than ${SELF_PACKAGE}` },
    ),
  ),
  `Globals the section's package manager installs, keyed by package. Each is a Range, \`{ range, platforms?, machines? }\` to target it, ${VARIANTS}.`,
);
export type GlobalsSection = typeof GlobalsSection.Type;

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

// An Item name that names a file: an Install Record, a Step's markers, a
// skill's folder. One path segment of letters, digits, ".", "_" and "-".
const ITEM_NAME = /^[A-Za-z0-9._-]+$/;
const badName = (names: ReadonlyArray<string>) =>
  names.find((n) => !ITEM_NAME.test(n) || n === "." || n === "..");

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
  after: Schema.optionalKey(Schema.NonEmptyString).annotateKey({
    description:
      "A command run after a Ship writes the file there, in its directory, with shell.init and the known bin directories set up (`mise install`). If it fails, the next Ship runs it again.",
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
    // A name names the Item's Install Record file and its Steps' markers.
    // One exclude for every Variant, so the Starting Machine and a target
    // leave the same paths alone (a path only one side excluded would be
    // deleted, or copied and never seen again).
    Schema.makeFilter(
      (items) => {
        const name = badName(Object.keys(items));
        if (name !== undefined)
          return `"${name}": a Shared File's name uses only letters, digits, ., _ and -, and is not . or ..`;
        const mixed = Object.entries(items).find(
          ([, item]) => Array.isArray(item) && item.some((v) => !sameExclude(v, item[0])),
        )?.[0];
        return mixed === undefined || `"${mixed}": every Variant needs the same exclude`;
      },
      {
        title: "Shared Files",
        description:
          "names of letters, digits, ., _ and -, and one exclude across a Shared File's Variants",
      },
    ),
  ),
  `Shared Files, keyed by name, which names the \`files:<name>\` Item. Each is a path, \`{ path, exclude?, after?, platforms?, machines? }\`, ${VARIANTS}.`,
);
export type FilesSection = typeof FilesSection.Type;

// An agent id the skills CLI knows (`claude-code`, `codex`), passed to `skills add -a`.
const Agents = Schema.NonEmptyArray(Schema.NonEmptyString);

// An agent skill, installed with the skills CLI from its source (ADR 0018).
// Its name is its key in `skills.items`.
export const Skill = Schema.Struct({
  ...Targeting,
  source: Schema.NonEmptyString.annotateKey({
    description:
      "Where the skills CLI installs it from: `owner/repo` on GitHub, or any source `skills add` takes.",
  }),
  ref: Schema.optionalKey(Ref).annotateKey({
    description:
      "A branch, tag, or full commit SHA. Default: the repo's default branch. Not with a `source` that has `#ref`.",
  }),
  agents: Schema.optionalKey(Agents).annotateKey({
    description: "The agents to install it for, instead of the section's `agents`.",
  }),
});
export type Skill = typeof Skill.Type;

export const SkillsSection = section(
  {
    agents: Agents.annotateKey({
      description:
        "The agents every skill is installed for, as skills CLI ids (`claude-code`, `codex`). An Item's own `agents` replaces this list.",
    }),
  },
  Schema.Record(
    Schema.NonEmptyString,
    variants(
      withShorthand(Skill, Schema.NonEmptyString, {
        decode: (source) => ({ source }),
        encode: (skill) => skill.source,
      }),
    ),
  ).check(
    Schema.makeFilter(
      (items) => {
        const name = badName(Object.keys(items));
        if (name !== undefined)
          return `"${name}": a skill's name uses only letters, digits, ., _ and -, and is not . or ..`;
        // The skills CLI's own rule for a source with a ref in it.
        const twice = Object.entries(items).find(([, entry]) =>
          (Array.isArray(entry) ? entry : [entry]).some(
            (s: Skill) => s.ref !== undefined && s.source.includes("#"),
          ),
        )?.[0];
        return twice === undefined || `"${twice}": its source already has a #ref; remove "ref"`;
      },
      {
        title: "Skills",
        description: "names of letters, digits, ., _ and -, and one ref per skill",
      },
    ),
  ),
  `Skills, keyed by name, which names the \`skills:<name>\` Item. Each is a source, \`{ source, ref?, agents?, platforms?, machines? }\`, ${VARIANTS}.`,
);
export type SkillsSection = typeof SkillsSection.Type;

// Whether `version` is a fleetfizz from before the config's `version` (ADR
// 0019): one that cannot read this config, or switch away from it.
export const predatesVersion = (version: string): boolean =>
  semver.valid(version) !== null && semver.lt(version, "0.14.0");

// An exact version, as `version` takes: what a Ship and every fizz run.
export const ExactVersion = Schema.String.check(
  Schema.makeFilter(
    (version) => semver.valid(version) === version || 'an exact version, like "0.14.0"',
    { title: "version", description: 'an exact version, like "0.14.0"' },
  ),
);

// A command every Check and Apply runs first on a Machine, before anything
// else in its shell: one for every Machine, or Variants of `{ command }`.
const ShellInit = variants(
  withShorthand(
    Schema.Struct({ ...Targeting, command: Schema.NonEmptyString }),
    Schema.NonEmptyString,
    {
      decode: (command) => ({ command }),
      encode: (init) => init.command,
    },
  ),
);

export const ShellSection = Schema.Struct({
  init: Schema.optionalKey(ShellInit).annotateKey({
    description:
      "Shell run before every script a Ship runs on a Machine (`source ~/.zshrc`): a command, or a list of `{ command, platforms?, machines? }` where a Machine gets the first that targets it. By default no rc file is read; the known bin directories of vp, pnpm, bun, mise, volta, nvm, and fnm are on PATH.",
  }),
});
export type ShellSection = typeof ShellSection.Type;

const globalsDescription = (pm: string) =>
  `Globals installed with ${pm}'s global install. Needs ${pm} on the Machine; a Ship never installs it.`;

// The whole config.jsonc. Shorthands decode to their full entries, so
// `FleetConfig.Encoded` is the config as a user writes it.
export const FleetConfig = Schema.Struct({
  $schema: Schema.optionalKey(Schema.String),
  // Read from the raw text before anything else, by every fizz (ADR 0019).
  version: ExactVersion.annotateKey({
    messageMissingKey:
      'add "version", the fleetfizz every Machine runs, such as the one fizz --version prints',
    description:
      "The fleetfizz version every Machine runs. A fizz of any other version installs this one before it does anything else.",
  }),
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
  shell: Schema.optionalKey(ShellSection).annotateKey({
    description: "How a Ship's scripts start on each Machine.",
  }),
  files: Schema.optionalKey(FilesSection).annotateKey({
    description:
      "Files and directories copied from the Starting Machine to every targeted Machine. A directory is mirrored.",
  }),
  repos: Schema.optionalKey(ReposSection).annotateKey({
    description:
      "Each Tracked Repo is cloned on every targeted Machine and installed from its origin ref.",
  }),
  vp: Schema.optionalKey(GlobalsSection).annotateKey({ description: globalsDescription("vp") }),
  npm: Schema.optionalKey(GlobalsSection).annotateKey({ description: globalsDescription("npm") }),
  bun: Schema.optionalKey(GlobalsSection).annotateKey({ description: globalsDescription("bun") }),
  pnpm: Schema.optionalKey(GlobalsSection).annotateKey({ description: globalsDescription("pnpm") }),
  brew: Schema.optionalKey(BrewSection).annotateKey({
    description: "Homebrew Formulae. Needs Homebrew on the Machine; a Ship never installs it.",
  }),
  cask: Schema.optionalKey(CaskSection).annotateKey({
    description: "Homebrew Casks, macOS only. Needs Homebrew on the Machine.",
  }),
  skills: Schema.optionalKey(SkillsSection).annotateKey({
    description:
      "Agent skills, installed with the skills CLI, which a package manager's section must list as a Global. Kept at their source's ref.",
  }),
});
export type FleetConfig = typeof FleetConfig.Type;
