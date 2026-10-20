// `fizz init`: a first config on the Machine you will ship from. It checks
// this Machine and prints any fixes, picks the Fleet from the tailnet, offers
// the Globals of every package manager here, Formulae, Casks, and common
// dotfiles, writes the config at this fizz's version (ADR 0019) with the same edits as `fizz config add` (ADR
// 0017) and schema.json beside it, and offers a dry run. A Machine joins an
// existing Fleet by being added to its config and shipped to (ADR 0008), so
// when a config exists here, `init` shows it and points to `fizz config add`.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Prompt } from "effect/cli";
import { Box, Text } from "ink";

import {
  configPath,
  fleetConfigSchemaText,
  insertAt,
  type JsonPath,
  loadConfig,
  PACKAGE_MANAGERS,
  type PackageManager,
  SCHEMA_FILE,
  saveConfig,
  SELF_PACKAGE,
} from "@fleetfizz/config";
import { MANAGERS } from "@fleetfizz/providers";
import { readTailnet, type Tailnet } from "@fleetfizz/remote";

import { ConfigAddError, fileName, machineNote } from "./configAdd.tsx";
import { configText } from "./configView.tsx";
import { expandHome, homeRelative, interactive, runLocal } from "./local.ts";
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
  readonly formulae: ReadonlyArray<string>;
  readonly casks: ReadonlyArray<string>;
  readonly files: ReadonlyArray<string>;
  // A Cask fails on Linux, so with a Linux Machine in the Fleet the cask
  // section targets darwin.
  readonly linux: boolean;
}

// The config's text for `picks`, built with the edits `fizz config add` makes.
export const draftText = (picks: Picks): string => {
  const edits: ReadonlyArray<readonly [JsonPath, unknown]> = [
    ...picks.globals.map((g) => [[g.pm, "items", g.name], `^${g.version}`] as const),
    ...picks.formulae.map((f) => [["brew", "items", f], "*"] as const),
    ...(picks.casks.length > 0 && picks.linux
      ? [[["cask", "platforms"], ["darwin"]] as const]
      : []),
    ...picks.casks.map((c) => [["cask", "items", c], "*"] as const),
    ...picks.files.map((f) => [["files", "items", fileName(f)], f] as const),
  ];
  const start = `{\n  "$schema": "./${SCHEMA_FILE}",\n  "version": ${JSON.stringify(picks.version)},\n  "machines": [],\n}\n`;
  return [...picks.machines.map((m, i) => [["machines", i], m] as const), ...edits].reduce<string>(
    (text, [path, value]) => {
      const result = insertAt(text, path, value);
      return "text" in result ? result.text : text;
    },
    start,
  );
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

// A multi-select with nothing picked, or nothing to ask when there is nothing.
const pickSome = <A,>(
  message: string,
  choices: ReadonlyArray<{ readonly title: string; readonly value: A }>,
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
  if (yield* fs.exists(path)) {
    const config = yield* loadConfig(path);
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
    // A mise shim for a tool that is not installed fails instead of installing it.
    runLocal("sh", ["-c", MANAGERS[pm].list], { MISE_NOT_FOUND_AUTO_INSTALL: "false" }).pipe(
      Effect.map((ran) =>
        [...MANAGERS[pm].parse(ran.stdout)].map(([name, version]) => ({ pm, name, version })),
      ),
    ),
  ))
    .flat()
    .filter((g) => g.name !== SELF_PACKAGE);
  const globals = yield* pickSome(
    `Which Globals from this Machine? (${installed.length} installed)`,
    installed.map((g) => ({ title: `${g.name}  ${g.version}  ${g.pm}`, value: g })),
  );
  const leaves = yield* lines("brew", ["leaves", "--installed-on-request"]);
  const formulae = yield* pickSome(
    `Which Formulae from this Machine? (${leaves.length} installed on request)`,
    leaves.map((f) => ({ title: f, value: f })),
  );
  const installedCasks =
    process.platform === "darwin" ? yield* lines("brew", ["list", "--cask"]) : [];
  const casks = yield* pickSome(
    `Which Casks from this Machine? (${installedCasks.length} installed)`,
    installedCasks.map((c) => ({ title: c, value: c })),
  );
  const present = yield* Effect.filter(DOTFILES, (f) => fs.exists(expandHome(f)));
  const files = yield* pickSome(
    "Which Shared Files? A Ship copies each from the Machine it starts on.",
    present.map((f) => ({ title: f, value: f })),
  );

  const text = draftText({
    version: flags.version,
    machines,
    globals,
    formulae,
    casks,
    files,
    linux: machines.some((m) => tailnet.fleet.find((f) => f.name === m)?.platform === "linux"),
  });
  const config = yield* saveConfig(path, text);
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
        `Add more with fizz config add repos|files|${PACKAGE_MANAGERS.join("|")}|brew|cask.`,
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
