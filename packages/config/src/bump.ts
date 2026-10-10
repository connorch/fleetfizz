// "Bump": answer an above-range Question by editing one Range in
// fleet.config.jsonc. Only the one string literal changes; comments and
// formatting stay (ADR 0004).
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as jsonc from "jsonc-parser";
import * as semver from "semver";

export class BumpError extends Schema.TaggedError<BumpError>()("BumpError", {
  path: Schema.String,
  package: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.path}: cannot bump ${this.package}: ${this.reason}`;
  }
}

// Where a package's Range lives in the config.
export const rangePath = (pkg: string): string[] =>
  pkg === "vite-plus"
    ? ["vp", "version"]
    : pkg === "node"
      ? ["vp", "node"]
      : ["vp", "globals", pkg];

// The Range to bump to: an exact pin stays exact; anything else becomes a caret.
export const bumpedRange = (current: string, installed: string): string =>
  semver.valid(current) !== null ? installed : `^${installed}`;

export const bumpText = (
  text: string,
  pkg: string,
  installed: string,
): { readonly text: string; readonly range: string } | { readonly reason: string } => {
  const path = rangePath(pkg);
  const node = jsonc.findNodeAtLocation(
    jsonc.parseTree(text) ?? { type: "null", offset: 0, length: 0 },
    path,
  );
  if (node === undefined || node.type !== "string" || typeof node.value !== "string") {
    return { reason: `${path.join(".")} is not a string literal; change it by hand` };
  }
  const range = bumpedRange(node.value, installed);
  const edits = jsonc.modify(text, path, range, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  return { text: jsonc.applyEdits(text, edits), range };
};

export const bumpConfig = Effect.fn("bumpConfig")(function* (
  configPath: string,
  pkg: string,
  installed: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(configPath);
  const result = bumpText(text, pkg, installed);
  if ("reason" in result)
    return yield* new BumpError({ path: configPath, package: pkg, reason: result.reason });
  yield* fs.writeFileString(configPath, result.text);
  return result.range;
});
