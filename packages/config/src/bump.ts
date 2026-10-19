// "Bump": answer an above-range Question by editing one Range in
// config.jsonc, at the path the Question names. Only the one string literal changes; comments and
// formatting stay (ADR 0004). The path names the `range` field; when the
// entry is a shorthand string, that string is the Range.
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

// The Range `fizz config add vp` writes when none is given: a caret of the
// version installed on this Machine, else of the newest stable version
// published. Undefined when there is neither.
export const addedRange = (
  installed: string | undefined,
  published: ReadonlyArray<string>,
): string | undefined => {
  const version = installed ?? semver.maxSatisfying([...published], "*") ?? undefined;
  return version === undefined ? undefined : `^${version}`;
};

export const bumpText = (
  text: string,
  path: ReadonlyArray<string | number>,
  installed: string,
): { readonly text: string; readonly range: string } | { readonly reason: string } => {
  const tree = jsonc.parseTree(text) ?? { type: "null", offset: 0, length: 0 };
  const shorthand = path.slice(0, -1);
  const at =
    jsonc.findNodeAtLocation(tree, [...path]) === undefined &&
    jsonc.findNodeAtLocation(tree, shorthand)?.type === "string"
      ? shorthand
      : path;
  const node = jsonc.findNodeAtLocation(tree, [...at]);
  if (node === undefined || node.type !== "string" || typeof node.value !== "string") {
    return { reason: `${path.join(".")} is not a string literal; change it by hand` };
  }
  const range = bumpedRange(node.value, installed);
  const edits = jsonc.modify(text, [...at], range, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  return { text: jsonc.applyEdits(text, edits), range };
};

export const bumpConfig = Effect.fn("bumpConfig")(function* (
  configPath: string,
  path: ReadonlyArray<string | number>,
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
