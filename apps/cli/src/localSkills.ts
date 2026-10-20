// What the skills CLI has installed on this Machine, for `fizz init` and
// `fizz config add skills` (ADR 0018): the Skills it installed from GitHub,
// and the Agents it sees them installed for.
import { stripVTControlCharacters } from "node:util";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { Prompt } from "effect/cli";

import { isItemName } from "@fleetfizz/config";

import { expandHome, runLocal } from "./local.ts";

/** A Skill the CLI installed here from GitHub, as a config writes it. */
export interface LocalSkill {
  readonly name: string;
  readonly source: string;
  readonly ref?: string;
}

const decodeLock = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      version: Schema.Number,
      skills: Schema.Record(
        Schema.String,
        Schema.Struct({
          source: Schema.String,
          sourceType: Schema.String,
          ref: Schema.optionalKey(Schema.String),
        }),
      ),
    }),
  ),
);

/**
 * The Skills in the CLI's lock, read where the CLI keeps it, that every
 * Machine can install: a GitHub source and a name the config can hold. One
 * from a path here, or a folder the CLI did not install, has no source another
 * Machine has. None when the lock is missing or from an older CLI.
 */
export const localSkills = Effect.fn("localSkills")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const state = process.env.XDG_STATE_HOME;
  const path =
    state === undefined || state === ""
      ? expandHome("~/.agents/.skill-lock.json")
      : `${state}/skills/.skill-lock.json`;
  const lock = decodeLock(yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => "")));
  if (lock._tag === "None" || lock.value.version < 3) return [];
  return Object.entries(lock.value.skills)
    .filter(([name, entry]) => entry.sourceType === "github" && isItemName(name))
    .map(([name, entry]): LocalSkill => ({
      name,
      source: entry.source,
      ...(entry.ref === undefined ? {} : { ref: entry.ref }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

const NO_TELEMETRY = { DISABLE_TELEMETRY: "1" };

const decodeList = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.Struct({ agents: Schema.Array(Schema.String) }))),
);

/**
 * The Agents the skills CLI sees Skills installed for here, as the ids
 * `skills add -a` takes, or none when the CLI is not here. `skills ls --json`
 * names them for display ("Claude Code" is `claude-code`), the way most ids
 * are written; the few that are not (`roo` is "Roo Code") the CLI rejects,
 * and they are dropped.
 */
export const localAgents = Effect.fn("localAgents")(function* () {
  const listed = yield* runLocal("skills", ["ls", "-g", "--json"], NO_TELEMETRY);
  const list = listed.code === 0 ? decodeList(listed.stdout) : undefined;
  const ids =
    list === undefined || list._tag === "None"
      ? []
      : [
          ...new Set(
            list.value.flatMap((skill) =>
              skill.agents.map((agent) => agent.toLowerCase().replace(/\s+/g, "-")),
            ),
          ),
        ];
  if (ids.length === 0) return ids;
  // The CLI prints the ids it does not know: "Invalid agents: a, b".
  const validated = yield* runLocal("skills", ["ls", "-g", "-a", ...ids, "--json"], NO_TELEMETRY);
  const invalid =
    validated.code === 0
      ? []
      : (/Invalid agents: (.*)/
          .exec(stripVTControlCharacters(validated.stdout))?.[1]
          ?.split(", ") ?? ids);
  return ids.filter((id) => !invalid.includes(id));
});

/** The skills section's `agents`, picked from `agents`, all picked to start. */
export const pickAgents = (agents: ReadonlyArray<string>) =>
  Prompt.MultiSelect({
    message: "Which agents are skills installed for? (skills CLI ids)",
    choices: agents.map((agent) => ({ title: agent, value: agent, selected: true })),
    min: 1,
  });
