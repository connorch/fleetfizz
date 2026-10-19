import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as jsonc from "jsonc-parser";

import { FleetConfig } from "./schema.ts";

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
    return `no config at ${this.path}; run fizz init to write one, or pass --config`;
  }
}

const lineOf = (text: string, offset: number): number => text.slice(0, offset).split("\n").length;

// Keys an object repeats. The parser keeps the last one, so a repeated Item
// name would silently drop the first definition.
const repeatedKeys = (text: string): string[] => {
  const problems: string[] = [];
  const visit = (node: jsonc.Node, path: ReadonlyArray<string | number>) => {
    if (node.type === "array") node.children?.forEach((child, i) => visit(child, [...path, i]));
    if (node.type !== "object") return;
    const seen = new Set<string>();
    for (const [key, value] of (node.children ?? []).map((property) => property.children ?? [])) {
      if (key === undefined) continue;
      const name = String(key.value);
      if (seen.has(name))
        problems.push(
          `line ${lineOf(text, key.offset)}: "${name}" is repeated${path.length > 0 ? ` in ${path.join(".")}` : ""}`,
        );
      seen.add(name);
      if (value !== undefined) visit(value, [...path, name]);
    }
  };
  const tree = jsonc.parseTree(text, undefined, { allowTrailingComma: true });
  if (tree !== undefined) visit(tree, []);
  return problems;
};

// What moved in a config written before ADR 0014, or before the Config had
// an Install Record (ADR 0008), which no longer loads.
const STAMPS = ["shippedAt", "shippedFrom", "shippedTo"];
const movedKeys = (parsed: unknown): string[] => {
  if (typeof parsed !== "object" || parsed === null) return [];
  const config: { machines?: unknown; repos?: unknown; vp?: unknown } = parsed;
  const stamps = STAMPS.filter((key) => key in parsed);
  return [
    ...(stamps.length > 0
      ? [
          `${stamps.join(", ")}: no longer written; a Ship keeps them in its Install Record now, so delete them`,
        ]
      : []),
    ...(typeof config.machines === "object" &&
    config.machines !== null &&
    !Array.isArray(config.machines)
      ? ["machines is now a list of names, and machines.<name>.clones is repos.cloneRoot"]
      : []),
    ...(Array.isArray(config.repos)
      ? ["repos is now { items: { <name>: { origin, ref, install } } }, keyed by each repo's name"]
      : []),
    ...(typeof config.vp === "object" && config.vp !== null && "globals" in config.vp
      ? ["vp.globals is now vp.items"]
      : []),
  ];
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
  const moved = movedKeys(parsed);
  if (moved.length > 0) return yield* new ConfigError({ path, problems: moved });
  const repeated = repeatedKeys(text);
  if (repeated.length > 0) return yield* new ConfigError({ path, problems: repeated });
  return yield* Schema.decodeUnknownEffect(FleetConfig, { onExcessProperty: "error" })(parsed).pipe(
    Effect.mapError((error) => new ConfigError({ path, problems: [formatIssue(error.issue)] })),
  );
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
