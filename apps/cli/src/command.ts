// The fizz command tree: every command, its flags, and their descriptions.
// bin.ts runs it; the docs' Commands reference is generated from it.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import packageJson from "../package.json" with { type: "json" };
import { KEEP, logs } from "./log.ts";
import { report } from "./report.tsx";
import { ship } from "./ship.ts";

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
      "Rebuild a record Item (`repos:<name>`) even when it is up to date. `all` for every one.",
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

// The package is fleetfizz; the command is fizz.
export const fizz = Command.make("fizz").pipe(
  Command.withDescription("Keep every Machine on your tailnet in line with one config."),
  Command.withSubcommands([shipCommand, reportCommand, logsCommand]),
);
