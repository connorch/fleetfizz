// The docs' generated reference: Markdown files the website's Config and
// Commands pages include (apps/website/content/generated). reference.test.ts
// keeps them current, so the docs say what the CLI and the config Schema do.
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Schema from "effect/Schema";
import { CliOutput, Command, type HelpDoc } from "effect/cli";
import * as TestConsole from "effect/testing/TestConsole";

import {
  BrewSection,
  CaskSection,
  FilesSection,
  FleetConfig,
  ReposSection,
  SharedFile,
  Skill,
  SkillsSection,
  Targeting,
  TrackedRepo,
  VpSection,
} from "@fleetfizz/config";

import packageJson from "../package.json" with { type: "json" };
import { fizz } from "./command.ts";

const table = (header: readonly [string, string], rows: ReadonlyArray<readonly [string, string]>) =>
  [header, ["---", "---"], ...rows]
    .map((cells) => `| ${cells.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")} |`)
    .join("\n");

// A key's description annotation. Every documented key must have one.
const describe = (name: string, field: Schema.Constraint) => {
  const description = field.ast.context?.annotations?.description;
  if (typeof description !== "string") throw new Error(`"${name}" has no description`);
  return description;
};

// A Struct's fields as a Field / Description table, without the Targeting fields,
// which have their own table.
const fieldTable = (fields: Schema.Struct.Fields) =>
  table(
    ["Field", "Description"],
    Object.entries(fields)
      .filter(([name]) => !(name in Targeting))
      .map(([name, field]) => [
        `\`${name}\``,
        field.ast.context?.isOptional
          ? describe(name, field)
          : `${describe(name, field)} Required.`,
      ]),
  );

// A config section: what its key holds, then its fields.
const section = (key: keyof typeof FleetConfig.fields, fields: Schema.Struct.Fields) =>
  `${describe(key, FleetConfig.fields[key])}\n\n${fieldTable(fields)}\n`;

const flagName = (flag: HelpDoc.FlagDoc) =>
  `\`--${flag.name}${flag.type === "boolean" ? "" : ` <${flag.type}>`}\``;

// `fizz <command> --help`, formatted as Markdown instead of for the terminal.
const markdownFormatter: CliOutput.Formatter = {
  ...CliOutput.defaultFormatter({ colors: false }),
  formatHelpDoc: (doc) =>
    [
      doc.description,
      ...(doc.args !== undefined && doc.args.length > 0
        ? [
            table(
              ["Argument", "Description"],
              doc.args.map((arg) => [
                `\`<${arg.name}>\`${arg.required ? "" : " (optional)"}`,
                Option.getOrElse(arg.description, () => ""),
              ]),
            ),
          ]
        : []),
      ...(doc.flags.length > 0
        ? [
            table(
              ["Flag", "Description"],
              doc.flags.map((flag) => [
                flagName(flag),
                Option.getOrElse(flag.description, () => ""),
              ]),
            ),
          ]
        : []),
    ].join("\n\n"),
};

const help = (command: ReadonlyArray<string>) =>
  Command.runWith(fizz, { version: packageJson.version })([...command, "--help"]).pipe(
    Effect.andThen(TestConsole.logLines),
    Effect.map((lines) => `${lines.join("\n")}\n`),
    Effect.provide([CliOutput.layer(markdownFormatter), TestConsole.layer, NodeServices.layer]),
  );

interface Tree {
  readonly name: string;
  readonly subcommands: ReadonlyArray<{ readonly commands: ReadonlyArray<Tree> }>;
}

// Every command under `command`, as the words that run it: `config add brew`.
const commandsOf = (command: Tree, path: ReadonlyArray<string> = []): string[][] =>
  command.subcommands
    .flatMap((group) => group.commands)
    .flatMap((sub) => [[...path, sub.name], ...commandsOf(sub, [...path, sub.name])]);

// Every generated file, keyed by its path under apps/website/content/generated.
// A command's file is named by its words: commands/config-add-brew.md.
export const reference = Effect.gen(function* () {
  const commands = commandsOf(fizz);
  return {
    "config/machines.md": `${describe("machines", FleetConfig.fields.machines)}\n`,
    "config/repos.md": `${section("repos", ReposSection.fields)}\nEach Tracked Repo in \`items\`:\n\n${fieldTable(TrackedRepo.fields)}\n`,
    "config/vp.md": section("vp", VpSection.fields),
    "config/brew.md": section("brew", BrewSection.fields),
    "config/cask.md": section("cask", CaskSection.fields),
    "config/skills.md": `${section("skills", SkillsSection.fields)}\nEach skill in \`items\`:\n\n${fieldTable(Skill.fields)}\n`,
    "config/files.md": `${section("files", FilesSection.fields)}\nEach Shared File in \`items\`:\n\n${fieldTable(SharedFile.fields)}\n`,
    "config/targeting.md": `${table(
      ["Field", "Description"],
      Object.entries(Targeting).map(([name, field]) => [`\`${name}\``, describe(name, field)]),
    )}\n`,
    ...Object.fromEntries(
      yield* Effect.forEach(commands, (command) =>
        help(command).pipe(
          Effect.map((markdown) => [`commands/${command.join("-")}.md`, markdown]),
        ),
      ),
    ),
  };
});
