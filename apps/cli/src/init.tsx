// `fizz init`: a first config on the Machine you will ship from. It checks
// this Machine and prints any fixes, picks the Fleet from the tailnet, offers
// the Globals of every package manager here, Formulae, Casks, the skills the
// skills CLI installed from GitHub, and common dotfiles, writes the config at
// this fizz's version (ADR 0019) with the same edits as `fizz config add`
// (ADR 0017) and schema.json beside it, and offers a dry run. A Machine joins an
// existing Fleet by being added to its config and shipped to (ADR 0008), so
// when a config exists here, `init` shows it and points to `fizz config add`.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Prompt } from "effect/cli";
import { Box, Text } from "ink";

import {
  configPath,
  type EditResult,
  fleetConfigSchemaText,
  insertAt,
  type JsonPath,
  PACKAGE_MANAGERS,
  type PackageManager,
  parseConfig,
  readConfigText,
  SCHEMA_FILE,
  saveConfig,
  SELF_PACKAGE,
} from "@fleetfizz/config";
import { MANAGERS } from "@fleetfizz/providers";
import { CHECK_ENV, readTailnet, type Tailnet } from "@fleetfizz/remote";

import { ConfigAddError, fileName, machineNote, rangeEntry, skillEntry } from "./configAdd.tsx";
import { configText } from "./configView.tsx";
import { expandHome, homeRelative, interactive, runLocal } from "./local.ts";
import { type LocalSkill, localAgents, localSkills, pickAgents } from "./localSkills.ts";
import { checksOf, readFacts, type Check } from "./prerequisites.ts";
import { ship } from "./ship.ts";
import { T, toText } from "./view.tsx";

// Dotfiles most developers keep the same everywhere, offered when they exist here.
export const DOTFILES = ["~/.gitconfig", "~/.zshrc", "~/.bashrc", "~/.profile", "~/.vimrc"];

// What `init` writes: the Fleet, then each section from what was picked.
export interface Picks {
  // The running fleetfizz's.
  readonly version: string;
  readonly machines: ReadonlyArray<string>;
  readonly globals: ReadonlyArray<{
    readonly pm: PackageManager;
    readonly name: string;
    readonly version: string;
  }>;
  // Each picked Formula, and whether Homebrew requires macOS for it.
  readonly formulae: ReadonlyArray<{ readonly name: string; readonly macos: boolean }>;
  readonly casks: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<LocalSkill>;
  // The skills section's `agents`.
  readonly agents: ReadonlyArray<string>;
  readonly files: ReadonlyArray<string>;
  // A Cask fails on Linux, and so does a Formula that requires macOS, so
  // with a Linux Machine in the Fleet the cask section and those Formulae
  // target darwin.
  readonly linux: boolean;
}

// The config's text for `picks`, built with the edits `fizz config add` makes,
// or the reason a pick could not be added.
export const draftText = (picks: Picks): EditResult => {
  // Each edit: the pick it adds, where, and its entry.
  const edits: ReadonlyArray<readonly [string, JsonPath, unknown]> = [
    ...picks.machines.map((m, i) => [m, ["machines", i], m] as const),
    ...picks.globals.map((g) => [g.name, [g.pm, "items", g.name], `^${g.version}`] as const),
    ...picks.formulae.map(
      (f) =>
        [
          f.name,
          ["brew", "items", f.name],
          rangeEntry("*", picks.linux && f.macos ? { platforms: ["darwin"] } : {}),
        ] as const,
    ),
    ...(picks.casks.length > 0 && picks.linux
      ? [["the cask platforms", ["cask", "platforms"], ["darwin"]] as const]
      : []),
    ...picks.casks.map((c) => [c, ["cask", "items", c], "*"] as const),
    ...(picks.skills.length > 0
      ? [["the skills agents", ["skills", "agents"], picks.agents] as const]
      : []),
    ...picks.skills.map(
      (skill) =>
        [
          skill.name,
          ["skills", "items", skill.name],
          skillEntry(skill.source, skill.ref, [], {}),
        ] as const,
    ),
    ...picks.files.map((f) => [f, ["files", "items", fileName(f)], f] as const),
  ];
  let text = `{\n  "$schema": "./${SCHEMA_FILE}",\n  "version": ${JSON.stringify(picks.version)},\n  "machines": [],\n}\n`;
  for (const [pick, path, value] of edits) {
    const result = insertAt(text, path, value);
    if ("reason" in result) return { reason: `fizz init could not add ${pick}: ${result.reason}` };
    text = result.text;
  }
  return { text };
};

const CheckLine = (props: { check: Check }) => (
  <Text>
    <T tone={props.check.ok ? "ok" : props.check.required ? "fail" : "skip"}>
      {props.check.ok ? "✓" : props.check.required ? "✗" : "!"}
    </T>
    {` ${props.check.text}`}
  </Text>
);

// The checks, then the fixes for what failed: required ones first.
export const checksText = (checks: ReadonlyArray<Check>): string => {
  const required = checks.filter((c) => !c.ok && c.required && c.fix !== undefined);
  const optional = checks.filter((c) => !c.ok && !c.required && c.fix !== undefined);
  return toText(
    <Box flexDirection="column">
      {checks.map((check, i) => (
        <CheckLine key={i} check={check} />
      ))}
      {required.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Fix these, then run fizz init again:</Text>
          {required.map((c, i) => (
            <Text key={i}>{`  ${c.fix}`}</Text>
          ))}
        </Box>
      )}
      {optional.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text>{required.length > 0 ? "Optional:" : "Optional, now or later:"}</Text>
          {optional.map((c, i) => (
            <Text key={i}>{`  ${c.fix}`}</Text>
          ))}
        </Box>
      )}
    </Box>,
  );
};

// Lines of a command's output, or none when it fails.
const lines = Effect.fn("lines")(function* (command: string, args: ReadonlyArray<string>) {
  const ran = yield* runLocal(command, args);
  return ran.code === 0 ? ran.stdout.split("\n").filter((l) => l.trim() !== "") : [];
});

const Requirements = Schema.Array(Schema.Struct({ name: Schema.String }));

// A Formula as `brew info --json=v2 --variations` and formulae.brew.sh write
// it: its requirements here, and per bottle tag (`x86_64_linux`) those that
// differ there.
const FormulaInfo = Schema.Struct({
  requirements: Requirements,
  variations: Schema.optionalKey(
    Schema.NullOr(
      Schema.Record(
        Schema.String,
        Schema.Struct({ requirements: Schema.optionalKey(Requirements) }),
      ),
    ),
  ),
});

// Whether a Formula fails on Linux: it requires macOS on every Linux
// variation, or everywhere when it has none. `go` requires macOS 12 only on
// macOS, so its Linux variations clear the requirement.
export const macosOnly = (f: typeof FormulaInfo.Type) => {
  const linux = Object.entries(f.variations ?? {}).flatMap(([tag, v]) =>
    tag.endsWith("_linux") ? [v.requirements ?? f.requirements] : [],
  );
  return (linux.length > 0 ? linux : [f.requirements]).every((rs) =>
    rs.some((r) => r.name === "macos"),
  );
};

const BrewInfo = Schema.fromJsonString(
  Schema.Struct({
    formulae: Schema.Array(Schema.Struct({ ...FormulaInfo.fields, full_name: Schema.String })),
  }),
);

// Whether a homebrew/core Formula is macOS only, from formulae.brew.sh;
// false when it cannot be read.
const coreMacosOnly = Effect.fn("coreMacosOnly")(
  function* (name: string) {
    const response = yield* HttpClient.get(`https://formulae.brew.sh/api/formula/${name}.json`);
    return macosOnly(yield* HttpClientResponse.schemaBodyJson(FormulaInfo)(response));
  },
  Effect.timeout("10 seconds"),
  Effect.orElseSucceed(() => false),
  Effect.provide(FetchHttpClient.layer),
);

// The tapped Formulae (`owner/tap/name`) in `names` that are macOS only, from
// `brew info`, which reads them from source; none when it cannot be read.
const tappedMacosOnly = Effect.fn("tappedMacosOnly")(
  function* (names: ReadonlyArray<string>) {
    if (names.length === 0) return [];
    const ran = yield* runLocal("brew", [
      "info",
      "--json=v2",
      "--variations",
      "--formula",
      ...names,
    ]);
    const info = yield* Schema.decodeEffect(BrewInfo)(ran.stdout);
    return info.formulae.filter(macosOnly).map((f) => f.full_name);
  },
  Effect.orElseSucceed(() => []),
);

// The Formulae in `names` that fail on a Linux Machine because Homebrew
// requires macOS for them (`depends_on :macos`). Homebrew 7 reads
// homebrew/core from an internal API with neither the requirements this Mac
// meets nor variations, so a core Formula's come from formulae.brew.sh.
const macosFormulae = Effect.fn("macosFormulae")(function* (names: ReadonlyArray<string>) {
  const tapped = yield* tappedMacosOnly(names.filter((n) => n.includes("/")));
  const core = yield* Effect.filter(
    names.filter((n) => !n.includes("/")),
    coreMacosOnly,
    { concurrency: 8 },
  );
  return new Set([...tapped, ...core]);
});

// A multi-select with nothing picked unless a choice says so, or nothing to
// ask when there is nothing.
const pickSome = <A,>(
  message: string,
  choices: ReadonlyArray<{
    readonly title: string;
    readonly value: A;
    readonly selected?: boolean;
  }>,
) =>
  choices.length === 0
    ? Effect.succeed([] as ReadonlyArray<A>)
    : Prompt.MultiSelect({ message, choices, maxPerPage: 15 });

const pickMachines = (tailnet: Tailnet) =>
  Prompt.MultiSelect({
    message: "Which Machines are in the Fleet?",
    choices: tailnet.fleet.map((m) => {
      const self = m.name === tailnet.self.name;
      const note = self ? "this Machine" : machineNote(m, tailnet);
      return {
        title: `${m.name}  ${m.platform}`,
        value: m.name,
        // Every Machine a Ship can reach starts picked; the rest can be picked.
        selected: self || note === undefined,
        ...(note === undefined ? {} : { description: note }),
      };
    }),
    min: 1,
  });

export const init = Effect.fn("init")(function* (flags: {
  readonly config: string | undefined;
  readonly version: string;
}) {
  if (!interactive())
    return yield* new ConfigAddError({
      reason: "fizz init asks questions, so it needs a terminal; write the config by hand instead",
    });
  const fs = yield* FileSystem.FileSystem;
  const path = flags.config ?? configPath(process.env);

  const checks = checksOf(yield* readFacts());
  yield* Console.log(checksText(checks));
  if (checks.some((c) => !c.ok && c.required)) {
    process.exitCode = 1;
    return;
  }

  const tailnet = yield* readTailnet();
  const existing = yield* readConfigText(path);
  if (existing !== undefined) {
    const config = yield* parseConfig(path, existing);
    yield* Console.log(
      `\n${configText({
        path,
        config,
        tailnet,
        footer: [
          "This Machine already has a config. Add to it with fizz config add, and see where each Machine stands with fizz status.",
        ],
      })}`,
    );
    return;
  }

  yield* Console.log("");
  const picked = yield* pickMachines(tailnet);
  // A Ship must start from a Machine in its own Fleet.
  const machines = picked.includes(tailnet.self.name) ? picked : [tailnet.self.name, ...picked];
  if (machines !== picked)
    yield* Console.log(`${tailnet.self.name} is in the Fleet too: a Ship starts from it.`);

  // Every package manager's Globals here, each kept by the one that has it;
  // fleetfizz itself is the config's `version`.
  const installed = (yield* Effect.forEach(PACKAGE_MANAGERS, (pm) =>
    runLocal("sh", ["-c", MANAGERS[pm].list], CHECK_ENV).pipe(
      Effect.map((ran) =>
        [...MANAGERS[pm].parse(ran.stdout)].map(([name, version]) => ({ pm, name, version })),
      ),
    ),
  ))
    .flat()
    .filter((g) => g.name !== SELF_PACKAGE);
  const pickedGlobals = yield* pickSome(
    `Which Globals from this Machine? (${installed.length} installed)`,
    installed.map((g) => ({ title: `${g.name}  ${g.version}  ${g.pm}`, value: g })),
  );
  const linux = machines.some((m) => tailnet.fleet.find((f) => f.name === m)?.platform === "linux");
  const leaves = yield* lines("brew", ["leaves", "--installed-on-request"]);
  const pickedFormulae = yield* pickSome(
    `Which Formulae from this Machine? (${leaves.length} installed on request)`,
    leaves.map((f) => ({ title: f, value: f })),
  );
  const macos = linux ? yield* macosFormulae(pickedFormulae) : new Set<string>();
  const formulae = pickedFormulae.map((name) => ({ name, macos: macos.has(name) }));
  const installedCasks =
    process.platform === "darwin" ? yield* lines("brew", ["list", "--cask"]) : [];
  const casks = yield* pickSome(
    `Which Casks from this Machine? (${installedCasks.length} installed)`,
    installedCasks.map((c) => ({ title: c, value: c })),
  );
  // A skills section needs agents, so skills are offered only when the
  // skills CLI sees some here.
  const agentsHere = yield* localAgents();
  const fromGitHub = agentsHere.length === 0 ? [] : yield* localSkills();
  const skills = yield* pickSome(
    `Which skills from this Machine? (${fromGitHub.length} installed from GitHub)`,
    fromGitHub.map((skill) => ({
      title: `${skill.name}  ${skill.source}${skill.ref === undefined ? "" : `#${skill.ref}`}`,
      value: skill,
      selected: true,
    })),
  );
  const agents = skills.length === 0 ? [] : yield* pickAgents(agentsHere);
  // A Ship installs skills with the skills CLI, so the config keeps the CLI
  // too, with the package manager that has it here.
  const cli = installed.find((global) => global.name === "skills");
  const addCli =
    cli !== undefined &&
    skills.length > 0 &&
    !pickedGlobals.some((global) => global.name === "skills");
  const globals = addCli ? [...pickedGlobals, cli] : pickedGlobals;
  if (addCli)
    yield* Console.log(
      `The skills CLI is in the config too, as a ${cli.pm} Global: a Ship installs skills with it.`,
    );
  if (cli === undefined && skills.length > 0)
    yield* Console.log(
      `No package manager here has the skills CLI, so a Ship cannot install skills; add it with fizz config add ${PACKAGE_MANAGERS.join("|")} skills.`,
    );
  const present = yield* Effect.filter(DOTFILES, (f) => fs.exists(expandHome(f)));
  const files = yield* pickSome(
    "Which Shared Files? A Ship copies each from the Machine it starts on.",
    present.map((f) => ({ title: f, value: f })),
  );

  const draft = draftText({
    version: flags.version,
    machines,
    globals,
    formulae,
    casks,
    skills,
    agents,
    files,
    linux,
  });
  if ("reason" in draft) return yield* new ConfigAddError({ reason: draft.reason });
  const config = yield* saveConfig(path, draft.text);
  const paths = yield* Path.Path;
  yield* fs.writeFileString(paths.join(paths.dirname(path), SCHEMA_FILE), fleetConfigSchemaText());
  yield* Console.log(
    `\n${toText(
      <Text>
        <T tone="ok">Wrote</T>
        {` ${homeRelative(path)} and ${SCHEMA_FILE}`}
      </Text>,
    )}`,
  );
  yield* Console.log(
    configText({
      path,
      config,
      tailnet,
      footer: [
        `Add more with fizz config add repos|files|${PACKAGE_MANAGERS.join("|")}|brew|cask|skills.`,
      ],
    }),
  );
  const dryRun = yield* Prompt.Confirm({
    message: "Run fizz ship --dry-run now?",
    initial: true,
  });
  if (dryRun)
    yield* ship({
      dryRun: true,
      only: [],
      rebuild: [],
      answers: [],
      config: flags.config,
      version: flags.version,
    });
});
