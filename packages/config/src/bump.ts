// "Bump": answer an above-range Question by editing one Range in
// config.jsonc, at the path the Question names. Only the one string literal changes; comments and
// formatting stay (ADR 0004).
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as jsonc from "jsonc-parser";
import * as semver from "semver";

export class BumpError extends Schema.TaggedError<BumpError>()("BumpError", {
  path: Schema.String,
  at: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.path}: cannot bump ${this.at}: ${this.reason}`;
  }
}

// The Range to bump to: an exact pin stays exact; anything else becomes a caret.
export const bumpedRange = (current: string, installed: string): string =>
  semver.valid(current) !== null ? installed : `^${installed}`;

export const bumpText = (
  text: string,
  path: ReadonlyArray<string>,
  installed: string,
): { readonly text: string; readonly range: string } | { readonly reason: string } => {
  const node = jsonc.findNodeAtLocation(
    jsonc.parseTree(text) ?? { type: "null", offset: 0, length: 0 },
    [...path],
  );
  if (node === undefined || node.type !== "string" || typeof node.value !== "string") {
    return { reason: `${path.join(".")} is not a string literal; change it by hand` };
  }
  const range = bumpedRange(node.value, installed);
  const edits = jsonc.modify(text, [...path], range, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  return { text: jsonc.applyEdits(text, edits), range };
};

export const bumpConfig = Effect.fn("bumpConfig")(function* (
  configPath: string,
  path: ReadonlyArray<string>,
  installed: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(configPath);
  const result = bumpText(text, path, installed);
  if ("reason" in result)
    return yield* new BumpError({ path: configPath, at: path.join("."), reason: result.reason });
  yield* fs.writeFileString(configPath, result.text);
  return result.range;
});
