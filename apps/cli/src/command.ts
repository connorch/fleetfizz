// The fizz command tree: every command, its flags, and their descriptions.
// bin.ts runs it; the docs' Commands reference is generated from it.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/cli";

import packageJson from "../package.json" with { type: "json" };
import { report } from "./report.tsx";
import { ship } from "./ship.ts";

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
    Flag.withMetavar("repo"),
    Flag.withDescription(
      "Run a repo's Install Command even when nothing changed. `all` for every repo.",
    ),
  ),
  bump: Flag.Boolean("bump").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Answer every above-range Question by bumping the config."),
  ),
  enforce: Flag.Boolean("enforce").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Answer every above-range Question by downgrading into the Range."),
  ),
  overwriteConfig: Flag.Boolean("overwrite-config").pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Ship even when another Machine holds a newer config, overwriting it with this one.",
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
      bump: flags.bump,
      enforce: flags.enforce,
      overwriteConfig: flags.overwriteConfig,
      config: flags.config._tag === "Some" ? flags.config.value : undefined,
      version: packageJson.version,
    }).pipe(
      // Problems the person can fix print as one message, not a trace.
      Effect.catch((e) =>
        Effect.gen(function* () {
          yield* Console.error(e.message);
          process.exitCode = 1;
        }),
      ),
    ),
  ),
);

const reportCommand = Command.make("report", {}).pipe(
  Command.withDescription("Print the full Ledger of the last Ship from this Machine."),
  Command.withHandler(() => report()),
);

// The package is fleetfizz; the command is fizz.
export const fizz = Command.make("fizz").pipe(
  Command.withDescription("Keep every Machine on your tailnet in line with one config."),
  Command.withSubcommands([shipCommand, reportCommand]),
);
