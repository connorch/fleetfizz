import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as jsonc from "jsonc-parser";

import { FleetConfig, repoName } from "./schema.ts";

export const CONFIG_FILE = "fleet.config.jsonc";

// Every problem with the config, reported together, so one run shows them all.
export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", {
  path: Schema.String,
  problems: Schema.Array(Schema.String),
}) {
  override get message() {
    return [`${this.path}:`, ...this.problems.map((p) => `  ${p}`)].join("\n");
  }
}

export class ConfigNotFound extends Schema.TaggedError<ConfigNotFound>()("ConfigNotFound", {
  start: Schema.String,
}) {
  override get message() {
    return `no ${CONFIG_FILE} found in ${this.start} or any parent directory`;
  }
}

// Searches upward from `start` for fleet.config.jsonc.
export const findConfig = Effect.fn("findConfig")(function* (start: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, CONFIG_FILE);
    if (yield* fs.exists(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return yield* new ConfigNotFound({ start });
    dir = parent;
  }
});

const lineOf = (text: string, offset: number): number => text.slice(0, offset).split("\n").length;

// Checks that the schema cannot express: cross-entry consistency.
const semanticProblems = (config: FleetConfig): string[] => {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const repo of config.repos ?? []) {
    const name = repoName(repo);
    if (seen.has(name)) problems.push(`repos: duplicate name "${name}"`);
    seen.add(name);
  }
  return problems;
};

// Parses and validates one config file. Unknown keys are errors, so a typo
// (`platform` for `platforms`) cannot silently widen a Tracked Repo's targeting.
export const parseConfig = Effect.fn("parseConfig")(function* (path: string, text: string) {
  const parseErrors: jsonc.ParseError[] = [];
  const parsed: unknown = jsonc.parse(text, parseErrors, { allowTrailingComma: true });
  if (parseErrors.length > 0) {
    return yield* new ConfigError({
      path,
      problems: parseErrors.map(
        (e) => `line ${lineOf(text, e.offset)}: ${jsonc.printParseErrorCode(e.error)}`,
      ),
    });
  }
  const config = yield* Schema.decodeUnknownEffect(FleetConfig, { onExcessProperty: "error" })(
    parsed,
  ).pipe(
    Effect.mapError((error) => new ConfigError({ path, problems: [formatIssue(error.issue)] })),
  );
  const problems = semanticProblems(config);
  if (problems.length > 0) return yield* new ConfigError({ path, problems });
  return config;
});

const formatIssue = SchemaIssue.makeFormatterDefault();

export const loadConfig = Effect.fn("loadConfig")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(path);
  return yield* parseConfig(path, text);
});
