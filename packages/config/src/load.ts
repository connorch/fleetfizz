import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as jsonc from "jsonc-parser";

import { FleetConfig, repoName, SELF_PACKAGE } from "./schema.ts";

export const CONFIG_FILE = "config.jsonc";
export const SCHEMA_FILE = "schema.json";

// The config directory on every Machine: $XDG_CONFIG_HOME/fleetfizz, which
// defaults to ~/.config/fleetfizz (ADR 0008). `env` is the process environment.
// An empty XDG_CONFIG_HOME counts as unset, as `${XDG_CONFIG_HOME:-...}` does
// in the generated scripts.
export const configDir = (env: Readonly<Record<string, string | undefined>>): string =>
  `${env.XDG_CONFIG_HOME || `${env.HOME ?? "~"}/.config`}/fleetfizz`;
export const configPath = (env: Readonly<Record<string, string | undefined>>): string =>
  `${configDir(env)}/${CONFIG_FILE}`;

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
  path: Schema.String,
}) {
  override get message() {
    return `no config at ${this.path}; write one there (the README has an example) or pass --config`;
  }
}

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
  if (config.vp?.globals?.[SELF_PACKAGE] !== undefined) {
    problems.push(`vp.globals: ${SELF_PACKAGE} is pinned by the running version; remove it`);
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

// Loads the config at `path`. A missing file is ConfigNotFound; any other
// read error is reported as it is.
export const loadConfig = Effect.fn("loadConfig")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(path))) return yield* new ConfigNotFound({ path });
  const text = yield* fs.readFileString(path);
  return yield* parseConfig(path, text);
});
