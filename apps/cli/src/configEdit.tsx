// `fizz config remove`, `edit`, and `path`. Like `add`, each writes only a
// config that loads (ADR 0017).
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Prompt } from "effect/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  configPath,
  type JsonPath,
  parseConfig,
  removeAt,
  SECTION_NAMES,
  targetingLists,
  SCHEMA_FILE,
  saveConfig,
} from "@fleetfizz/config";
import { parseAddress } from "@fleetfizz/core";

import { ConfigAddError, openConfig } from "./configAdd.tsx";
import { changeText } from "./configView.tsx";
import { homeRelative, interactive } from "./local.ts";
import { T } from "./view.tsx";

// Where a `provider:item` address sits in the config.
export const pathOf = (provider: string, item: string): JsonPath | undefined =>
  SECTION_NAMES.some((p) => p === provider) ? [provider, "items", item] : undefined;

// The Item a Targeting list belongs to, for messages: `brew.items.tmux`.
const owner = (path: JsonPath) => path.slice(0, -1).join(".");

// `fizz config remove machines:<name>`: out of the Fleet, and out of every
// Targeting list, unless a list would be left empty: then nothing changes.
const removeMachine = Effect.fn("removeMachine")(function* (
  flag: string | undefined,
  name: string,
) {
  const { path, text, config } = yield* openConfig(flag);
  const index = config.machines.indexOf(name);
  if (index < 0) return yield* new ConfigAddError({ reason: `${name} is not in machines` });
  const lists = targetingLists(text, name);
  const only = lists.filter((l) => l.size === 1);
  if (only.length > 0)
    return yield* new ConfigAddError({
      reason: `${name} is the only Machine ${only.map((l) => owner(l.path)).join(", ")} targets; change ${only.length === 1 ? "it" : "them"} with fizz config edit first`,
    });
  let next = text;
  // Last first, so earlier paths stay where they are.
  for (const at of [...lists.map((l) => [...l.path, l.index]), ["machines", index]].toReversed()) {
    const result = removeAt(next, at);
    if ("reason" in result) return yield* new ConfigAddError({ reason: result.reason });
    next = result.text;
  }
  yield* saveConfig(path, next);
  yield* Console.log(
    changeText(
      path,
      text,
      next,
      <>
        <T tone="ok">removed</T>
        {` ${name} from the Fleet`}
        <T tone="dim">{" · a Ship no longer checks or changes it"}</T>
      </>,
    ),
  );
});

// `fizz config remove <provider:item>`. Removing an Item never uninstalls it.
export const removeItem = Effect.fn("removeItem")(function* (input: {
  readonly config: string | undefined;
  readonly address: string;
}) {
  const at = parseAddress(input.address);
  if (at === undefined)
    return yield* new ConfigAddError({
      reason: `${input.address}: expected provider:item, as the Ledger writes it (brew:tmux)`,
    });
  if (at.provider === "machines") return yield* removeMachine(input.config, at.item);
  const path = pathOf(at.provider, at.item);
  if (path === undefined)
    return yield* new ConfigAddError({
      reason: `${at.provider}: expected machines or a Provider (${SECTION_NAMES.join(", ")})`,
    });
  const { path: file, text } = yield* openConfig(input.config);
  const result = removeAt(text, path);
  if ("reason" in result)
    return yield* new ConfigAddError({ reason: `${input.address} is not in the config` });
  yield* saveConfig(file, result.text);
  yield* Console.log(
    changeText(
      file,
      text,
      result.text,
      <>
        <T tone="ok">removed</T>
        {` ${input.address}`}
        <T tone="dim">{" · a Ship never uninstalls it, so it stays where it is"}</T>
      </>,
    ),
  );
});

// Runs the person's editor on `file` and waits for it to close.
const runEditor = Effect.fn("runEditor")(function* (file: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";
  // Through a shell, so an editor with flags (`code --wait`) works.
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make("/bin/sh", ["-c", `${editor} "$1"`, "fizz", file], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        }),
      );
      return yield* handle.exitCode;
    }),
  );
});

// `fizz config edit`: the editor works on a copy, and the config is replaced
// only by a copy that loads, so the config is never invalid, not even while
// it is open.
export const editConfig = Effect.fn("editConfig")(function* (flags: {
  readonly config: string | undefined;
}) {
  if (!interactive())
    return yield* new ConfigAddError({ reason: "fizz config edit needs a terminal" });
  const { path, text } = yield* openConfig(flags.config);
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const copy = `${dir}/${path.split("/").at(-1) ?? "config.jsonc"}`;
  yield* fs.writeFileString(copy, text);
  // Beside the copy, so an editor that reads `$schema` still checks it.
  const paths = yield* Path.Path;
  const schema = paths.join(paths.dirname(path), SCHEMA_FILE);
  if (yield* fs.exists(schema)) yield* fs.copyFile(schema, `${dir}/${SCHEMA_FILE}`);
  for (;;) {
    const code = yield* runEditor(copy);
    // An editor that exits non-zero was cancelled (vim's :cq) or failed.
    if (code !== 0)
      return yield* Console.log(`the editor exited with ${code}; the config is unchanged`);
    const edited = yield* fs.readFileString(copy);
    if (edited === text) return yield* Console.log("no changes");
    const parsed = yield* Effect.result(parseConfig(homeRelative(path), edited));
    if (parsed._tag === "Success") {
      // Changed by something else while the editor was open: saving the
      // copy would lose that change.
      if ((yield* fs.readFileString(path)) !== text) {
        yield* Console.log(edited);
        return yield* new ConfigAddError({
          reason: `${homeRelative(path)} changed while the editor was open, so it is unchanged; your edit is printed above`,
        });
      }
      yield* saveConfig(path, edited);
      return yield* Console.log(`saved ${homeRelative(path)} · fizz ship to ship it`);
    }
    yield* Console.error(parsed.failure.message);
    const again = yield* Prompt.Select({
      message: "The config does not load",
      choices: [
        { title: "Edit it again", value: true },
        { title: "Discard the changes", value: false },
      ],
    });
    if (!again) return yield* Console.log("discarded; the config is unchanged");
  }
}, Effect.scoped);

// `fizz config path`.
export const printPath = (flags: { readonly config: string | undefined }) =>
  Console.log(flags.config ?? configPath(process.env));
