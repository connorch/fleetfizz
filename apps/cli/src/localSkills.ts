// What the skills CLI has installed on this Machine, for `fizz init` and
// `fizz config add skills` (ADR 0018): the skills it installed from GitHub,
// and the agents it sees them installed for.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { Prompt } from "effect/cli";

import { expandHome, runLocal } from "./local.ts";

// A skill the CLI installed here from GitHub, as a config writes it.
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

// The lock's skills with a GitHub source, which every Machine can install
// from. One from a path here, or a folder the CLI did not install, has no
// source another Machine has.
export const lockSkills = (text: string): ReadonlyArray<LocalSkill> => {
  const lock = decodeLock(text);
  if (lock._tag === "None" || lock.value.version < 3) return [];
  return Object.entries(lock.value.skills)
    .filter(([, entry]) => entry.sourceType === "github")
    .map(([name, entry]) => ({
      name,
      source: entry.source,
      ...(entry.ref === undefined ? {} : { ref: entry.ref }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// The skills in the CLI's lock, where the CLI itself keeps it.
export const localSkills = Effect.fn("localSkills")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const state = process.env.XDG_STATE_HOME;
  const path =
    state === undefined || state === ""
      ? expandHome("~/.agents/.skill-lock.json")
      : `${state}/skills/.skill-lock.json`;
  return lockSkills(yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => "")));
});

const NO_TELEMETRY = { DISABLE_TELEMETRY: "1" };

const decodeList = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.Struct({ agents: Schema.Array(Schema.String) }))),
);

// The ids of the agents `skills ls --json` names for display ("Claude Code"
// is `claude-code`), the way most ids are written. A few ids are not
// (`roo` is "Roo Code"); the CLI rejects those, and localAgents drops them.
export const agentIds = (list: string): ReadonlyArray<string> => {
  const skills = decodeList(list);
  return skills._tag === "None"
    ? []
    : [
        ...new Set(
          skills.value.flatMap((s) => s.agents.map((a) => a.toLowerCase().replace(/\s+/g, "-"))),
        ),
      ];
};

// The agents the skills CLI sees skills installed for here, as the ids
// `skills add -a` takes, or none when the CLI is not here.
export const localAgents = Effect.fn("localAgents")(function* () {
  const listed = yield* runLocal("skills", ["ls", "-g", "--json"], NO_TELEMETRY);
  const ids = listed.code === 0 ? agentIds(listed.stdout) : [];
  if (ids.length === 0) return ids;
  // The CLI prints the ids it does not know: "Invalid agents: a, b".
  const probe = yield* runLocal("skills", ["ls", "-g", "-a", ...ids, "--json"], NO_TELEMETRY);
  const invalid =
    probe.code === 0
      ? []
      : (/Invalid agents: (.*)/
          .exec(probe.stdout.replace(/\u001b\[[0-9;]*m/g, ""))?.[1]
          ?.split(", ") ?? ids);
  return ids.filter((id) => !invalid.includes(id));
});

// The agents a skills section installs every skill for, picked from
// `agents`, all picked to start.
export const pickAgents = (agents: ReadonlyArray<string>) =>
  Prompt.MultiSelect({
    message: "Which agents are skills installed for? (skills CLI ids)",
    choices: agents.map((a) => ({ title: a, value: a, selected: true })),
    min: 1,
  });
