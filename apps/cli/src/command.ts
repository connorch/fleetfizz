// The fizz command tree: every command, its flags, and their descriptions.
// bin.ts runs it; the docs' Commands reference is generated from it.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import packageJson from "../package.json" with { type: "json" };
import { addFile, addGlobal, addHomebrew, addMachines, addRepo } from "./configAdd.tsx";
import { editConfig, printPath, removeItem } from "./configEdit.tsx";
import { showConfig } from "./configView.tsx";
import { init } from "./init.tsx";
import { KEEP, logs } from "./log.ts";
import { report } from "./report.tsx";
import { ship } from "./ship.ts";
import { status } from "./status.tsx";

// Problems the person can fix print as one message, not a trace.
const printProblems = <A, E extends Error, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catch((e) =>
      Effect.gen(function* () {
        yield* Console.error(e.message);
        process.exitCode = 1;
      }),
    ),
  );

const shipCommand = Command.make("ship", {
  dryRun: Flag.Boolean("dry-run").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Check and plan only. Print every Machine's plan and change nothing."),
  ),
  only: Flag.String("only").pipe(
    Flag.atLeast(0),
    Flag.withMetavar("machine"),
    Flag.withDescription("Ship only to this Machine. Repeat the flag for more."),
  ),
  rebuild: Flag.String("rebuild").pipe(
    Flag.atLeast(0),
    Flag.withMetavar("item"),
    Flag.withDescription(
      "Rebuild a record Item (`repos:<name>`, `skills:<name>`) even when it is up to date. `all` for every one.",
    ),
  ),
  answer: Flag.String("answer").pipe(
    Flag.atLeast(0),
    Flag.withMetavar("answer"),
    Flag.withDescription(
      "Answer a Question in advance: `kind=choice` or `kind:subject=choice`. Repeat the flag for more.",
    ),
  ),
  bump: Flag.Boolean("bump").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Answer every above-range Question by bumping the config (`--answer range=bump`).",
    ),
  ),
  enforce: Flag.Boolean("enforce").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Answer every above-range Question by downgrading into the Range (`--answer range=downgrade`).",
    ),
  ),
  overwriteConfig: Flag.Boolean("overwrite-config").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Ship even when another Machine holds a newer config, overwriting it (`--answer config=overwrite`).",
    ),
  ),
  config: Flag.String("config").pipe(
    Flag.optional,
    Flag.withMetavar("path"),
    Flag.withDescription("The config file. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`."),
  ),
}).pipe(
  Command.withDescription("Ship the config to every reachable Machine."),
  Command.withHandler((flags) =>
    ship({
      dryRun: flags.dryRun,
      only: flags.only,
      rebuild: flags.rebuild,
      // The shortcut flags are answers; an --answer for a subject still wins.
      answers: [
        ...flags.answer,
        ...(flags.bump ? ["range=bump"] : []),
        ...(flags.enforce ? ["range=downgrade"] : []),
        ...(flags.overwriteConfig ? ["config=overwrite"] : []),
      ],
      config: Option.getOrUndefined(flags.config),
      version: packageJson.version,
    }).pipe(printProblems),
  ),
);

const initCommand = Command.make("init", {
  config: Flag.String("config").pipe(
    Flag.optional,
    Flag.withMetavar("path"),
    Flag.withDescription(
      "Where to write the config. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`.",
    ),
  ),
}).pipe(
  Command.withDescription(
    "Set up this Machine to ship: check what fleetfizz needs here and print any fixes, then pick the Fleet from the tailnet and what to keep in line, and write the config.",
  ),
  Command.withHandler((flags) =>
    init({ config: Option.getOrUndefined(flags.config), version: packageJson.version }).pipe(
      printProblems,
    ),
  ),
);

const statusCommand = Command.make("status", {
  config: Flag.String("config").pipe(
    Flag.optional,
    Flag.withMetavar("path"),
    Flag.withDescription("The config file. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`."),
  ),
}).pipe(
  Command.withDescription(
    "Check every reachable Machine and show where each Item stands: in line, to change, a Question, or failing. Changes nothing and asks nothing.",
  ),
  Command.withHandler((flags) =>
    status({ config: Option.getOrUndefined(flags.config), version: packageJson.version }).pipe(
      printProblems,
    ),
  ),
);

const reportCommand = Command.make("report", {}).pipe(
  Command.withDescription("Print the full Ledger of the last Ship from this Machine."),
  Command.withHandler(() => report()),
);

const logsCommand = Command.make("logs", {
  ship: Argument.String("ship").pipe(
    Argument.optional,
    Argument.withDescription("The Ship id, printed at the end of every Ship."),
  ),
  machine: Flag.String("machine").pipe(
    Flag.optional,
    Flag.withMetavar("machine"),
    Flag.withDescription("Print only this Machine's lines."),
  ),
  list: Flag.Boolean("list").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      `List the Ships started here whose logs this Machine keeps (its last ${KEEP}).`,
    ),
  ),
}).pipe(
  Command.withDescription(
    "Print the Ship Log of a Ship: every script, every line each Machine printed, and every decision. Without a Ship id, the latest Ship that started on or reached this Machine, read over tailscale ssh when another Machine started it.",
  ),
  Command.withHandler((flags) =>
    logs({
      id: Option.getOrUndefined(flags.ship),
      machine: Option.getOrUndefined(flags.machine),
      list: flags.list,
    }).pipe(printProblems),
  ),
);

// `fizz config` and its subcommands share --config, before or after the
// subcommand's name.
const configFlags = {
  config: Flag.String("config").pipe(
    Flag.optional,
    Flag.withMetavar("path"),
    Flag.withDescription("The config file. Default: `$XDG_CONFIG_HOME/fleetfizz/config.jsonc`."),
  ),
};

// --platform and --machine, the Targeting an added Item gets.
const targetingFlags = {
  platform: Flag.Literals("platform", ["darwin", "linux"]).pipe(
    Flag.atLeast(0),
    Flag.withDescription("Only Machines on this Platform. Repeat the flag for both."),
  ),
  machine: Flag.String("machine").pipe(
    Flag.atLeast(0),
    Flag.withMetavar("machine"),
    Flag.withDescription("Only this Machine. Repeat the flag for more."),
  ),
};

const latestFlag = Flag.Boolean("latest").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Upgrade it on every Ship (`"latest"`) instead of installing it once (`"*"`).',
  ),
);

const configCommand = Command.make("config").pipe(
  Command.withSharedFlags(configFlags),
  Command.withDescription(
    "Show the config: each Provider's Items and the Machines they target, and when a Ship last reached each Machine.",
  ),
  Command.withHandler((flags) =>
    showConfig({ config: Option.getOrUndefined(flags.config) }).pipe(printProblems),
  ),
);

// The --config given to `fizz config`, for its subcommands.
const configFile = Effect.map(configCommand, (flags) => Option.getOrUndefined(flags.config));

const homebrewCommand = (provider: "brew" | "cask") =>
  Command.make(provider, {
    name: Argument.String("name").pipe(
      Argument.withDescription(
        provider === "brew"
          ? "The Formula, or a tapped name (`owner/tap/name`)."
          : "The Cask, or a tapped name.",
      ),
    ),
    latest: latestFlag,
    ...targetingFlags,
  }).pipe(
    Command.withDescription(provider === "brew" ? "Add a Formula." : "Add a Cask."),
    Command.withHandler((flags) =>
      Effect.flatMap(configFile, (config) =>
        addHomebrew({
          config,
          provider,
          name: flags.name,
          latest: flags.latest,
          targeting: { platforms: flags.platform, machines: flags.machine },
        }),
      ).pipe(printProblems),
    ),
  );

const addCommand = Command.make("add").pipe(
  Command.withDescription("Add an Item or a Machine to the config, then validate and save it."),
  Command.withSubcommands([
    Command.make("machines", {
      names: Argument.String("name").pipe(
        Argument.variadic(),
        Argument.withDescription("Machine names. Without any, pick from the tailnet."),
      ),
    }).pipe(
      Command.withDescription("Add Machines from the tailnet to the Fleet."),
      Command.withHandler((flags) =>
        Effect.flatMap(configFile, (config) => addMachines({ config, names: flags.names })).pipe(
          printProblems,
        ),
      ),
    ),
    Command.make("vp", {
      spec: Argument.String("package").pipe(
        Argument.withDescription(
          "An npm package, with a Range (`vercel@^59`) or without one: then `^` the version installed here, or the newest published.",
        ),
      ),
      ...targetingFlags,
    }).pipe(
      Command.withDescription("Add a Global."),
      Command.withHandler((flags) =>
        Effect.flatMap(configFile, (config) =>
          addGlobal({
            config,
            spec: flags.spec,
            targeting: { platforms: flags.platform, machines: flags.machine },
          }),
        ).pipe(printProblems),
      ),
    ),
    homebrewCommand("brew"),
    homebrewCommand("cask"),
    Command.make("repos", {
      origin: Argument.String("origin").pipe(Argument.withDescription("The GitHub `owner/repo`.")),
      name: Flag.String("name").pipe(
        Flag.optional,
        Flag.withDescription("The Item's name. Default: the repo's name."),
      ),
      ref: Flag.String("ref").pipe(
        Flag.optional,
        Flag.withDescription(
          "A branch or a full commit SHA. Default: the origin's default branch.",
        ),
      ),
      install: Flag.String("install").pipe(
        Flag.optional,
        Flag.withDescription("The Install Command. Asked for when missing."),
      ),
      output: Flag.String("output").pipe(
        Flag.atLeast(0),
        Flag.withMetavar("path"),
        Flag.withDescription(
          "A path outside the clone the Install Command produces. Repeat the flag for more.",
        ),
      ),
      ...targetingFlags,
    }).pipe(
      Command.withDescription("Add a Tracked Repo."),
      Command.withHandler((flags) =>
        Effect.flatMap(configFile, (config) =>
          addRepo({
            config,
            origin: flags.origin,
            name: Option.getOrUndefined(flags.name),
            ref: Option.getOrUndefined(flags.ref),
            install: Option.getOrUndefined(flags.install),
            outputs: flags.output,
            targeting: { platforms: flags.platform, machines: flags.machine },
          }),
        ).pipe(printProblems),
      ),
    ),
    Command.make("files", {
      path: Argument.String("path").pipe(
        Argument.withDescription("A file or directory on this Machine."),
      ),
      name: Flag.String("name").pipe(
        Flag.optional,
        Flag.withDescription(
          "The Item's name. Default: the last part of the path, without a leading dot.",
        ),
      ),
      exclude: Flag.String("exclude").pipe(
        Flag.atLeast(0),
        Flag.withMetavar("glob"),
        Flag.withDescription(
          "A glob inside a directory that is not copied. Repeat the flag for more.",
        ),
      ),
      ...targetingFlags,
    }).pipe(
      Command.withDescription("Add a Shared File."),
      Command.withHandler((flags) =>
        Effect.flatMap(configFile, (config) =>
          addFile({
            config,
            path: flags.path,
            name: Option.getOrUndefined(flags.name),
            exclude: flags.exclude,
            targeting: { platforms: flags.platform, machines: flags.machine },
          }),
        ).pipe(printProblems),
      ),
    ),
  ]),
);

const removeCommand = Command.make("remove", {
  address: Argument.String("item").pipe(
    Argument.withDescription(
      "`provider:item` (`brew:tmux`, `vp:node`), or `machines:<name>` to take a Machine out of the Fleet.",
    ),
  ),
}).pipe(
  Command.withDescription(
    "Remove an Item or a Machine from the config. A Ship never uninstalls what it removes.",
  ),
  Command.withHandler((flags) =>
    Effect.flatMap(configFile, (config) => removeItem({ config, address: flags.address })).pipe(
      printProblems,
    ),
  ),
);

const editCommand = Command.make("edit").pipe(
  Command.withDescription(
    "Edit the config in `$VISUAL` or `$EDITOR`. It is saved only when it loads.",
  ),
  Command.withHandler(() =>
    Effect.flatMap(configFile, (config) => editConfig({ config })).pipe(printProblems),
  ),
);

const pathCommand = Command.make("path").pipe(
  Command.withDescription("Print the config's path."),
  Command.withHandler(() => Effect.flatMap(configFile, (config) => printPath({ config }))),
);

const configTree = configCommand.pipe(
  Command.withSubcommands([addCommand, removeCommand, editCommand, pathCommand]),
);

// The package is fleetfizz; the command is fizz.
export const fizz = Command.make("fizz").pipe(
  Command.withDescription("Keep every Machine on your tailnet in line with one config."),
  Command.withSubcommands([
    initCommand,
    shipCommand,
    statusCommand,
    reportCommand,
    logsCommand,
    configTree,
  ]),
);
