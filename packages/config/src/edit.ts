// Edits to the config's text that keep everything else as written: comments,
// trailing commas, and how each object is laid out (ADR 0017). `fizz config
// add` inserts, `fizz config remove` removes, and `saveConfig` writes only a
// config that loads. Each edit checks its own result (`checked`) and refuses a
// layout it would get wrong. jsonc-parser's `modify` is used only to replace a value
// in place (bump.ts): for inserts and removals it moves a line comment onto
// the wrong entry, can leave a stray comma, and spreads values over lines.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as jsonc from "jsonc-parser";

import { parseConfig } from "./load.ts";

export type JsonPath = ReadonlyArray<string | number>;

// A line longer than this is written over several lines.
const WIDTH = 100;

const parse = (text: string): jsonc.Node =>
  jsonc.parseTree(text, undefined, { allowTrailingComma: true }) ?? {
    type: "object",
    offset: 0,
    length: 0,
    children: [],
  };

const lineStart = (text: string, offset: number): number => text.lastIndexOf("\n", offset - 1) + 1;

// The whitespace a line starts with.
const indentAt = (text: string, offset: number): string =>
  /^[ \t]*/.exec(text.slice(lineStart(text, offset)))?.[0] ?? "";

// A value as the docs write it: on one line when it fits after `column`
// characters, else one entry per line, each ending in a comma.
const format = (value: unknown, indent: string, column: number): string => {
  const inline = formatInline(value);
  if (column + inline.length <= WIDTH || typeof value !== "object" || value === null) return inline;
  const inner = `${indent}  `;
  if (Array.isArray(value))
    return `[\n${value.map((v) => `${inner}${format(v, inner, inner.length)},\n`).join("")}${indent}]`;
  const entries = Object.entries(value).map(([k, v]) => {
    const key = `${JSON.stringify(k)}: `;
    return `${inner}${key}${format(v, inner, inner.length + key.length)},\n`;
  });
  return `{\n${entries.join("")}${indent}}`;
};

const formatInline = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(formatInline).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).map(
      ([k, v]) => `${JSON.stringify(k)}: ${formatInline(v)}`,
    );
    return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value);
};

// Block comments on the same line, one after another.
const BLOCK_COMMENTS = /^(?:[ \t]*\/\*(?:(?!\*\/)[^\n])*\*\/)*/;

// The text after a member up to where it ends, all of which belongs to it:
// block comments on its line, its comma, then a line comment when nothing
// else follows on its line. `close` is the end of the member and the block
// comments before its comma. `lineEnd` is set when the member ends its line,
// so removing it can take the whole line.
const tail = (text: string, end: number) => {
  const close = end + (BLOCK_COMMENTS.exec(text.slice(end))?.[0].length ?? 0);
  let at = close;
  while (text[at] === " " || text[at] === "\t") at++;
  const comma = text[at] === ",";
  if (comma) at++;
  const blocks = BLOCK_COMMENTS.exec(text.slice(at))?.[0].length ?? 0;
  const rest = /^[ \t]*(\/\/[^\n]*)?(?=\n|$)/.exec(text.slice(at + blocks));
  return {
    comma,
    close,
    end: comma ? at : end,
    lineEnd: rest === null ? undefined : at + blocks + rest[0].length,
  };
};

// A member of an object or array: the property, or the element.
const memberOf = (node: jsonc.Node): jsonc.Node =>
  node.parent?.type === "property" ? node.parent : node;

// Inserts `member` (`"key": value` or a value) as the last member of
// `container`, as its other members are laid out.
const insertMember = (
  text: string,
  container: jsonc.Node,
  render: (indent: string, column: number) => string,
): string => {
  const open = container.offset;
  const close = container.offset + container.length - 1;
  const members = container.children ?? [];
  const last = members.at(-1);
  const inside = text.slice(open + 1, close);
  if (last === undefined && inside.trim() !== "") {
    // Empty but for comments: the member goes after them, on its own line
    // when they span lines.
    const indent = indentAt(text, open);
    if (!inside.includes("\n"))
      return `${text.slice(0, close).trimEnd()} ${render(indent, close - lineStart(text, close) + 1)} ${text.slice(close)}`;
    const inner = `${indent}  `;
    const at = lineStart(text, close);
    // A comment that ends on the closing line: the member goes after it.
    if (text.slice(at, close).trim() !== "")
      return `${text.slice(0, close).trimEnd()}\n${inner}${render(inner, inner.length)},\n${indent}${text.slice(close)}`;
    return `${text.slice(0, at)}${inner}${render(inner, inner.length)},\n${text.slice(at)}`;
  }
  if (last === undefined) {
    // An empty `{}` or `[]` gets its one member on the same line when it fits.
    const indent = indentAt(text, open);
    const column = open - lineStart(text, open) + 2;
    const member = render(indent, column);
    const [l, r] = container.type === "array" ? ["[", "]"] : ["{ ", " }"];
    const body = `${l}${member}${r}`;
    return text.slice(0, open) + body + text.slice(close + 1);
  }
  const multiline = text.slice(open, close).includes("\n");
  const after = tail(text, last.offset + last.length);
  if (!multiline || after.lineEnd === undefined) {
    // On one line: `, member` after the last member and its comments.
    const at = after.close;
    return `${text.slice(0, at)}, ${render("", at - lineStart(text, at) + 2)}${text.slice(at)}`;
  }
  const indent = indentAt(text, last.offset);
  const member = `\n${indent}${render(indent, indent.length)}${after.comma ? "," : ""}`;
  const comma = after.comma ? "" : ",";
  const at = last.offset + last.length;
  return (
    text.slice(0, at) + comma + text.slice(at, after.lineEnd) + member + text.slice(after.lineEnd)
  );
};

// `container`, written on one line, as one member per line, each member's
// text as it was.
const spread = (text: string, container: jsonc.Node): string => {
  const open = container.offset;
  const close = container.offset + container.length - 1;
  const indent = indentAt(text, open);
  const [l, r] = container.type === "array" ? ["[", "]"] : ["{", "}"];
  const body = (container.children ?? [])
    .map((m) => `${indent}  ${text.slice(m.offset, m.offset + m.length)},\n`)
    .join("");
  return `${text.slice(0, open)}${l}\n${body}${indent}${r}${text.slice(close + 1)}`;
};

// The outermost container written on one line that holds `offset` and starts
// on its line, if any.
const oneLineAround = (text: string, tree: jsonc.Node, offset: number): jsonc.Node | undefined => {
  const start = lineStart(text, offset);
  let found: jsonc.Node | undefined;
  for (
    let node = jsonc.findNodeAtOffset(tree, offset, true);
    node !== undefined;
    node = node.parent
  ) {
    const isContainer = node.type === "object" || node.type === "array";
    if (
      isContainer &&
      node.offset >= start &&
      !text.slice(node.offset, node.offset + node.length).includes("\n")
    )
      found = node;
  }
  return found;
};

// `text` with every string literal emptied, so `//` in a URL is not a comment.
const stripStrings = (text: string): string => text.replace(/"(?:[^"\\]|\\.)*"/g, '""');

const lineLength = (text: string, offset: number): number => {
  const end = text.indexOf("\n", offset);
  return (end < 0 ? text.length : end) - lineStart(text, offset);
};

export type EditResult = { readonly text: string } | { readonly reason: string };

const valueOf = (text: string): unknown =>
  jsonc.parse(text, undefined, { allowTrailingComma: true });

// The comments in `text`, in order.
const commentsOf = (text: string): ReadonlyArray<string> => {
  const scanner = jsonc.createScanner(text, false);
  const found: Array<string> = [];
  for (let kind = scanner.scan(); kind !== jsonc.SyntaxKind.EOF; kind = scanner.scan())
    if (kind === jsonc.SyntaxKind.LineCommentTrivia || kind === jsonc.SyntaxKind.BlockCommentTrivia)
      found.push(scanner.getTokenValue());
  return found;
};

// `root` with `change` applied to the value that holds the end of `path`,
// creating the objects on the way.
const changedAt = (
  root: unknown,
  path: JsonPath,
  change: (parent: Record<string | number, unknown>, key: string | number) => void,
): unknown => {
  const copy: unknown = structuredClone(root);
  let parent = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) {
    parent[key] ??= {};
    parent = parent[key] as Record<string | number, unknown>;
  }
  const key = path.at(-1);
  if (key !== undefined) change(parent, key);
  return copy;
};

// An edit's text only when it means exactly what was asked, with every
// comment kept for an insert, so a layout these edits do not handle is
// refused instead of saved wrong.
const checked = (text: string, result: EditResult, expected: unknown, comments: boolean) =>
  "reason" in result ||
  (JSON.stringify(valueOf(result.text)) === JSON.stringify(expected) &&
    (!comments || commentsOf(result.text).join("\0") === commentsOf(text).join("\0")))
    ? result
    : {
        reason:
          "this part of the config is written in a way fizz cannot edit; use fizz config edit",
      };

// Inserts `value` at `path`, creating the objects on the way. The last key
// must not exist yet; a number appends to an array.
export const insertAt = (text: string, path: JsonPath, value: unknown): EditResult =>
  checked(
    text,
    insertSpread(text, path, value),
    changedAt(valueOf(text), path, (parent, key) => {
      if (Array.isArray(parent)) parent.push(value);
      else parent[key] = value;
    }),
    true,
  );

// When an insert makes a line longer than WIDTH, the outermost object on it is
// spread over lines first.
const insertSpread = (text: string, path: JsonPath, value: unknown): EditResult => {
  const result = insertText(text, path, value);
  if (!("text" in result)) return result;
  const at = firstDifference(text, result.text);
  if (lineLength(result.text, at) <= WIDTH) return result;
  const container = oneLineAround(text, parse(text), Math.min(at, text.length - 1));
  // A comment inside it is between members, where spread does not look:
  // leave the long line rather than lose the comment.
  return container === undefined ||
    /\/\/|\/\*/.test(
      stripStrings(text.slice(container.offset, container.offset + container.length)),
    )
    ? result
    : insertSpread(spread(text, container), path, value);
};

const firstDifference = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i;
};

const insertText = (text: string, path: JsonPath, value: unknown): EditResult => {
  const tree = parse(text);
  // The deepest node on the path that exists.
  let depth = 0;
  let node = tree;
  while (depth < path.length) {
    const next = jsonc.findNodeAtLocation(tree, path.slice(0, depth + 1));
    if (next === undefined) break;
    node = next;
    depth++;
  }
  const key = path[depth];
  if (key === undefined) return { reason: `${path.join(".")} is already in the config` };
  // The value for the missing part of the path, nested inside its objects.
  const nested = path
    .slice(depth + 1)
    .reduceRight<unknown>((inner, k) => ({ [String(k)]: inner }), value);
  if (typeof key === "number") {
    if (node.type !== "array") return { reason: `${path.slice(0, depth).join(".")} is not a list` };
    return { text: insertMember(text, node, (indent, column) => format(nested, indent, column)) };
  }
  if (node.type !== "object")
    return { reason: `${path.slice(0, depth).join(".")} is not an object` };
  const name = `${JSON.stringify(key)}: `;
  return {
    text: insertMember(
      text,
      node,
      (indent, column) => `${name}${format(nested, indent, column + name.length)}`,
    ),
  };
};

// Removes the property or list element at `path`, with its comma and a line
// comment after it.
export const removeAt = (text: string, path: JsonPath): EditResult =>
  checked(
    text,
    removeText(text, path),
    changedAt(valueOf(text), path, (parent, key) => {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    }),
    false,
  );

const removeText = (text: string, path: JsonPath): EditResult => {
  const found = jsonc.findNodeAtLocation(parse(text), [...path]);
  if (found === undefined) return { reason: `${path.join(".")} is not in the config` };
  const member = memberOf(found);
  const siblings = member.parent?.children ?? [];
  const index = siblings.indexOf(member);
  const start = member.offset;
  const after = tail(text, start + member.length);
  // Alone on its lines: take the lines.
  if (text.slice(lineStart(text, start), start).trim() === "" && after.lineEnd !== undefined) {
    const from = lineStart(text, start);
    const to = text[after.lineEnd] === "\n" ? after.lineEnd + 1 : after.lineEnd;
    return { text: text.slice(0, from) + text.slice(to) };
  }
  // Inline: take its comma and the space after it, or, as the last member,
  // the comma before it.
  if (after.comma && index < siblings.length - 1) {
    let to = after.end;
    while (text[to] === " ") to++;
    return { text: text.slice(0, start) + text.slice(to) };
  }
  const previous = siblings[index - 1];
  if (previous === undefined) {
    const parent = member.parent;
    if (parent === undefined) return { text };
    // The only member: `{}`, unless a comment beside it stays.
    const kept = `${text.slice(parent.offset + 1, start)}${text.slice(after.end, parent.offset + parent.length - 1)}`;
    const empty = parent.type === "array" ? "[]" : "{}";
    return {
      text:
        kept.trim() === ""
          ? text.slice(0, parent.offset) + empty + text.slice(parent.offset + parent.length)
          : text.slice(0, start) + text.slice(after.end),
    };
  }
  // The comma after the previous member goes; a comment before this one stays.
  const before = tail(text, previous.offset + previous.length);
  const comma = before.comma ? before.end - 1 : previous.offset + previous.length;
  return {
    text:
      text.slice(0, comma) +
      text.slice(before.comma ? before.end : comma, start).trimEnd() +
      text.slice(after.end),
  };
};

// Every Targeting list that names `machine`, outside the top-level `machines`:
// where each is, and how many names it has.
export const targetingLists = (text: string, machine: string) => {
  const found: Array<{ readonly path: JsonPath; readonly size: number; readonly index: number }> =
    [];
  const visit = (node: jsonc.Node, path: JsonPath) => {
    if (node.type === "array") node.children?.forEach((child, i) => visit(child, [...path, i]));
    if (node.type !== "object") return;
    for (const [key, value] of (node.children ?? []).map((p) => p.children ?? [])) {
      if (key === undefined || value === undefined) continue;
      const at = [...path, String(key.value)];
      if (key.value === "machines" && path.length > 0 && value.type === "array") {
        const index = (value.children ?? []).findIndex((c) => c.value === machine);
        if (index >= 0) found.push({ path: at, size: value.children?.length ?? 0, index });
      } else visit(value, at);
    }
  };
  visit(parse(text), []);
  return found;
};

// Writes `text` to `path` when it is a config that loads, so no edit can
// leave an invalid config behind. A ConfigError lists what is wrong.
export const saveConfig = Effect.fn("saveConfig")(function* (path: string, text: string) {
  const config = yield* parseConfig(path, text);
  const fs = yield* FileSystem.FileSystem;
  // Through a symlink (a config kept in a dotfiles repo) to the file it
  // names, so the link stays a link.
  const target = (yield* fs.exists(path)) ? yield* fs.realPath(path) : path;
  yield* fs.makeDirectory((yield* Path.Path).dirname(target), { recursive: true });
  yield* fs.writeFileString(`${target}.tmp`, text);
  // The new file keeps the old one's permissions (a private config stays private).
  if (yield* fs.exists(target))
    yield* fs.chmod(`${target}.tmp`, (yield* fs.stat(target)).mode & 0o7777);
  yield* fs.rename(`${target}.tmp`, target);
  return config;
});
